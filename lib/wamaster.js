const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_PATH = path.join(DATA_DIR, 'wamaster.json');

const settings = {
  antiLag: false,
  contactOnly: 'off', // off | immediate | delayed
  antiBug: true,
  blockedCodes: [],
  optimizationEnabled: false,
  lastCacheClear: 0,
  cacheCleanIntervalMs: 30 * 60 * 1000,
  maxMessagesPerMinute: 30,
  foreignFilterEnabled: false,
  ownerCountryCode: process.env.OWNER_COUNTRY_CODE || '',
};

const runtime = {
  messageRate: new Map(), // key: chatId/userId -> {count,timestamp}
  firstSeenNonContacts: new Map(), // key: userJid -> firstTimestamp
  groupSpamScore: new Map(), // chatId -> score
  eventLoopLagMs: 0,
  groupWhitelist: new Set(),
};

function load() {
  try {
    if (fs.existsSync(DATA_PATH)) {
      const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
      Object.assign(settings, data);
    }
  } catch {}
}

function save() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_PATH, JSON.stringify(settings, null, 2));
  } catch {}
}

function tickEventLoopLag() {
  let prev = Date.now();
  setInterval(() => {
    const now = Date.now();
    const dt = now - prev - 1000;
    runtime.eventLoopLagMs = Math.max(0, dt);
    prev = now;
  }, 1000).unref();
}

function clearCaches() {
  try {
    const tempDir = path.join(__dirname, '..', 'tmp');
    if (fs.existsSync(tempDir)) {
      for (const f of fs.readdirSync(tempDir)) {
        try { fs.unlinkSync(path.join(tempDir, f)); } catch {}
      }
    }
    settings.lastCacheClear = Date.now();
    save();
  } catch {}
}

function scheduleMaintenance() {
  setInterval(() => {
    if (!settings.optimizationEnabled) return;
    clearCaches();
  }, settings.cacheCleanIntervalMs).unref();
}

function isSuspiciousText(text) {
  if (!text) return false;
  const patterns = [
    /[\u200B-\u200F\u202A-\u202E\u2060-\u206F]{4,}/, // zero-width, direction marks
    /[\u0300-\u036F]{50,}/, // excessive combining marks
    /[\u2066\u2067\u2068\u2069]{6,}/, // bidi isolates
    /[\u0600-\u06FF]{120,}/, // very long Arabic block
    /(.)\1{150,}/, // excessive repetition
    /\uFFFD{10,}/, // replacement chars
    /[\uD800-\uDFFF]{50,}/, // high/low surrogate spam
  ];
  return patterns.some((p) => p.test(text)) || text.length > 16000;
}

function extractTextFromMessage(msg) {
  const m = msg.message || {};
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ''
  ) || '';
}

function isForeignBlocked(jid) {
  if (!settings.foreignFilterEnabled || settings.blockedCodes.length === 0) return false;
  const num = jid?.split('@')[0] || '';
  return settings.blockedCodes.some((code) => num.startsWith(code.replace('+','')));
}

function rateLimitKey(msg) {
  const chat = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;
  return `${chat}|${sender}`;
}

function incrementRate(msg) {
  const key = rateLimitKey(msg);
  const now = Date.now();
  const rec = runtime.messageRate.get(key) || { count: 0, timestamp: now };
  if (now - rec.timestamp > 60000) { rec.count = 0; rec.timestamp = now; }
  rec.count += 1;
  runtime.messageRate.set(key, rec);
  return rec.count;
}

async function handleIncomingProtection(sock, msg) {
  try {
    const chatId = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;

    // Group whitelist bypass
    if (chatId.endsWith('@g.us') && runtime.groupWhitelist.has(chatId)) {
      return { blocked: false };
    }

    // Block foreign codes
    if (isForeignBlocked(sender)) {
      try { await sock.updateBlockStatus(sender, 'block'); } catch {}
      try { await sock.sendMessage(chatId, { delete: msg.key }); } catch {}
      try {
        const owner = require('../settings').ownerNumber + '@s.whatsapp.net';
        await sock.sendMessage(owner, { text: `🌍 Foreign code blocked: ${sender}` });
      } catch {}
      return { blocked: true, reason: 'foreign' };
    }

    // Contact-only modes
    if (settings.contactOnly !== 'off') {
      try {
        const [res] = await sock.onWhatsApp(sender);
        const isContact = !!res?.exists;
        if (!isContact) {
          if (settings.contactOnly === 'immediate') {
            try { await sock.sendMessage(chatId, { delete: msg.key }); } catch {}
            try { await sock.updateBlockStatus(sender, 'block'); } catch {}
            return { blocked: true, reason: 'contactonly' };
          } else if (settings.contactOnly === 'delayed') {
            if (!runtime.firstSeenNonContacts.has(sender)) {
              runtime.firstSeenNonContacts.set(sender, Date.now());
              try {
                const owner = require('../settings').ownerNumber + '@s.whatsapp.net';
                await sock.sendMessage(owner, { text: `👤 New non-contact messaged: ${sender}. Will block in 2 days if no reply.` });
              } catch {}
            } else {
              const first = runtime.firstSeenNonContacts.get(sender);
              const twoDays = 2 * 24 * 60 * 60 * 1000;
              if (Date.now() - first > twoDays) {
                try { await sock.updateBlockStatus(sender, 'block'); } catch {}
                try { await sock.sendMessage(chatId, { delete: msg.key }); } catch {}
                runtime.firstSeenNonContacts.delete(sender);
                return { blocked: true, reason: 'contactonly-delayed' };
              }
            }
          }
        }
      } catch {}
    }

    // Anti-bug detection
    if (settings.antiBug) {
      const text = extractTextFromMessage(msg);
      if (isSuspiciousText(text)) {
        try { await sock.sendMessage(chatId, { delete: msg.key }); } catch {}
        try { await sock.updateBlockStatus(sender, 'block'); } catch {}
        return { blocked: true, reason: 'antibug-text' };
      }

      // suspicious contact payloads
      if (msg.message?.contactMessage || msg.message?.contactsArrayMessage) {
        // Heuristic: block unknown large contact payloads
        const count = msg.message?.contactsArrayMessage?.contacts?.length || 1;
        if (count > 5) {
          try { await sock.sendMessage(chatId, { delete: msg.key }); } catch {}
          try { await sock.updateBlockStatus(sender, 'block'); } catch {}
          return { blocked: true, reason: 'antibug-contacts' };
        }
      }
    }

    // Rate limiting for spam
    const c = incrementRate(msg);
    if (c > settings.maxMessagesPerMinute) {
      const isGroup = chatId.endsWith('@g.us');
      if (isGroup) {
        const score = (runtime.groupSpamScore.get(chatId) || 0) + 1;
        runtime.groupSpamScore.set(chatId, score);
      } else {
        try { await sock.updateBlockStatus(sender, 'block'); } catch {}
      }
      try { await sock.sendMessage(chatId, { delete: msg.key }); } catch {}
      return { blocked: true, reason: 'ratelimit' };
    }

    // If anti-lag/optimization enabled and group is extremely spammy, aggressively drop
    if (chatId.endsWith('@g.us') && (settings.antiLag || settings.optimizationEnabled)) {
      const score = runtime.groupSpamScore.get(chatId) || 0;
      if (score > 25) {
        try { await sock.sendMessage(chatId, { delete: msg.key }); } catch {}
        return { blocked: true, reason: 'antilag-group-spam' };
      }
    }
  } catch {}
  return { blocked: false };
}

function statusSummary() {
  const groupsSpamming = Array.from(runtime.groupSpamScore.entries()).
    filter(([,score]) => score > 5).map(([id]) => id);
  const lag = runtime.eventLoopLagMs;
  return {
    antiLag: settings.antiLag,
    contactOnly: settings.contactOnly,
    antiBug: settings.antiBug,
    optimizationEnabled: settings.optimizationEnabled,
    blockedCodes: settings.blockedCodes,
    groupsSpamming,
    lagMs: lag,
    runningSlow: lag > 200,
    proneToBan: groupsSpamming.length > 10,
  };
}

function toggleAntiLag(on) { settings.antiLag = on ?? !settings.antiLag; save(); }
function toggleAntiBug(on) { settings.antiBug = on ?? !settings.antiBug; save(); }
function setContactOnly(mode) { settings.contactOnly = mode; save(); }
function toggleOptimize(on) { settings.optimizationEnabled = on ?? !settings.optimizationEnabled; save(); }
function blockCode(code) { if (!code) return; const c = code.replace('+',''); if (!settings.blockedCodes.includes(c)) settings.blockedCodes.push(c); settings.foreignFilterEnabled = true; save(); }
function unblockCode(code) { const c = code.replace('+',''); settings.blockedCodes = settings.blockedCodes.filter(x => x !== c); save(); }
function setForeign(on) { settings.foreignFilterEnabled = !!on; save(); }
function clearCodes() { settings.blockedCodes = []; save(); }
function getSettings() { return { ...settings }; }

load();
tickEventLoopLag();
scheduleMaintenance();

module.exports = {
  settings,
  handleIncomingProtection,
  statusSummary,
  toggleAntiLag,
  toggleAntiBug,
  setContactOnly,
  toggleOptimize,
  blockCode,
  unblockCode,
  setForeign,
  clearCodes,
  getSettings,
  runtime,
};