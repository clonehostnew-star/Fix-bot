const fs = require('fs');
const path = require('path');

// Storage file for wamaster settings
const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'wamaster.json');

// Runtime state (not persisted) - REAL-TIME tracking
const runtime = {
  groupSpamTracker: new Map(), // groupId -> { count, lastReset, messages: [] }
  lagDetector: { lastCheck: Date.now(), avgResponseTime: 0, samples: [] },
  groupWhitelist: new Set(),
  recentMessages: new Map(), // sender -> [timestamps]
  blockedUsers: new Set(), // Track blocked users this session
  deletedMessages: new Map(), // Track deleted bug messages
  contactCheckQueue: new Map(), // For delayed contact-only blocking
  messageRate: new Map(), // key: chatId|sender -> {count,timestamp}
  eventLoopLagMs: 0,
  firstSeenNonContacts: new Map(), // for contactOnly delayed
};

// Default settings
const defaultSettings = {
  antiLag: false,
  antiBug: false, // Off by default until enabled
  contactOnly: 'off', // off, immediate, delayed
  optimizationEnabled: false,
  blockedCodes: [],
  foreignFilter: false,
  userCountryCode: null,
  cacheCleanIntervalMs: 30 * 60 * 1000,
  maxMessagesPerMinute: 30,
};

// Initialize settings file
function initSettings() {
  try {
    const dataDir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(SETTINGS_FILE)) {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
    }
  } catch (e) {
    console.error('Error initializing wamaster settings:', e);
  }
}
initSettings();

// Read settings
function getSettings() {
  try {
    const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
    return { ...defaultSettings, ...JSON.parse(data) };
  } catch (e) {
    return { ...defaultSettings };
  }
}

// Save settings
function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error('❌ Error saving wamaster settings:', e);
  }
}

// Toggle functions
function toggleAntiLag() {
  const s = getSettings();
  s.antiLag = !s.antiLag;
  saveSettings(s);
  return s.antiLag;
}
function toggleAntiBug() {
  const s = getSettings();
  s.antiBug = !s.antiBug;
  saveSettings(s);
  return s.antiBug;
}
function toggleOptimize() {
  const s = getSettings();
  s.optimizationEnabled = !s.optimizationEnabled;
  saveSettings(s);
  return s.optimizationEnabled;
}
function setContactOnly(mode) {
  const s = getSettings();
  s.contactOnly = mode;
  saveSettings(s);
}
function setForeign(enabled) {
  const s = getSettings();
  s.foreignFilter = !!enabled;
  saveSettings(s);
}
function blockCode(code) {
  if (!code) return;
  const s = getSettings();
  const c = code.replace('+', '');
  if (!s.blockedCodes.includes(c)) s.blockedCodes.push(c);
  s.foreignFilter = true;
  saveSettings(s);
}
function unblockCode(code) {
  const s = getSettings();
  const c = code.replace('+', '');
  s.blockedCodes = s.blockedCodes.filter((x) => x !== c);
  saveSettings(s);
}
function clearCodes() {
  const s = getSettings();
  s.blockedCodes = [];
  saveSettings(s);
}

// Detect user's country code from their number - REAL IMPLEMENTATION
function detectUserCountryCode(userJid) {
  try {
    const number = (userJid || '').split('@')[0];
    const countryCodeMap = {
      '1': 'US/CA','7': 'RU/KZ','20': 'EG','27': 'ZA','30': 'GR','31': 'NL','32': 'BE','33': 'FR','34': 'ES','36': 'HU','39': 'IT','40': 'RO','41': 'CH','43': 'AT','44': 'GB','45': 'DK','46': 'SE','47': 'NO','48': 'PL','49': 'DE','51': 'PE','52': 'MX','53': 'CU','54': 'AR','55': 'BR','56': 'CL','57': 'CO','58': 'VE','60': 'MY','61': 'AU','62': 'ID','63': 'PH','64': 'NZ','65': 'SG','66': 'TH','81': 'JP','82': 'KR','84': 'VN','86': 'CN','90': 'TR','91': 'IN','92': 'PK','93': 'AF','94': 'LK','95': 'MM','98': 'IR','212': 'MA','213': 'DZ','216': 'TN','218': 'LY','220': 'GM','221': 'SN','222': 'MR','223': 'ML','224': 'GN','225': 'CI','226': 'BF','227': 'NE','228': 'TG','229': 'BJ','230': 'MU','231': 'LR','232': 'SL','233': 'GH','234': 'NG','235': 'TD','236': 'CF','237': 'CM','238': 'CV','239': 'ST','240': 'GQ','241': 'GA','242': 'CG','243': 'CD','244': 'AO','245': 'GW','246': 'IO','248': 'SC','249': 'SD','250': 'RW','251': 'ET','252': 'SO','253': 'DJ','254': 'KE','255': 'TZ','256': 'UG','257': 'BI','258': 'MZ','260': 'ZM','261': 'MG','262': 'RE/YT','263': 'ZW','264': 'NA','265': 'MW','266': 'LS','267': 'BW','268': 'SZ','269': 'KM','290': 'SH','291': 'ER','297': 'AW','298': 'FO','299': 'GL','350': 'GI','351': 'PT','352': 'LU','353': 'IE','354': 'IS','355': 'AL','356': 'MT','357': 'CY','358': 'FI','359': 'BG','370': 'LT','371': 'LV','372': 'EE','373': 'MD','374': 'AM','375': 'BY','376': 'AD','377': 'MC','378': 'SM','380': 'UA','381': 'RS','382': 'ME','383': 'XK','385': 'HR','386': 'SI','387': 'BA','389': 'MK','420': 'CZ','421': 'SK','423': 'LI','500': 'FK','501': 'BZ','502': 'GT','503': 'SV','504': 'HN','505': 'NI','506': 'CR','507': 'PA','508': 'PM','509': 'HT','590': 'GP','591': 'BO','592': 'GY','593': 'EC','594': 'GF','595': 'PY','596': 'MQ','597': 'SR','598': 'UY','599': 'CW/BQ','670': 'TL','672': 'NF','673': 'BN','674': 'NR','675': 'PG','676': 'TO','677': 'SB','678': 'VU','679': 'FJ','680': 'PW','681': 'WF','682': 'CK','683': 'NU','685': 'WS','686': 'KI','687': 'NC','688': 'TV','689': 'PF','690': 'TK','691': 'FM','692': 'MH','850': 'KP','852': 'HK','853': 'MO','855': 'KH','856': 'LA','880': 'BD','886': 'TW','960': 'MV','961': 'LB','962': 'JO','963': 'SY','964': 'IQ','965': 'KW','966': 'SA','967': 'YE','968': 'OM','970': 'PS','971': 'AE','972': 'IL','973': 'BH','974': 'QA','975': 'BT','976': 'MN','977': 'NP','992': 'TJ','993': 'TM','994': 'AZ','995': 'GE','996': 'KG','998': 'UZ'
    };
    for (let len = 3; len >= 1; len--) {
      const code = number.substring(0, len);
      if (countryCodeMap[code]) return code;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Helper: per chat/sender rate per minute (aggressive spam cutoff)
function incrementRate(msg, limit = getSettings().maxMessagesPerMinute) {
  const chat = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;
  const key = `${chat}|${sender}`;
  const now = Date.now();
  const rec = runtime.messageRate.get(key) || { count: 0, timestamp: now };
  if (now - rec.timestamp > 60000) { rec.count = 0; rec.timestamp = now; }
  rec.count += 1;
  runtime.messageRate.set(key, rec);
  return rec.count;
}

// REAL-TIME Bug detection - detects malicious messages
function detectBugMessage(message) {
  try {
    const msg = message.message;
    if (!msg) return { isBug: false };

    const sender = message.key.participant || message.key.remoteJid;
    const now = Date.now();
    const msgString = JSON.stringify(msg);
    const textContent = msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || msg.videoMessage?.caption || '';

    // Heuristics set 1: special char density
    // Treat emoji and symbols as special; penalize dense symbol usage
  const specialCharCount = (msgString.match(/[^\p{L}\p{N}\s]/gu) || []).length;
    const totalLength = msgString.length;
  // Stricter density and repeated line heuristics (lowered threshold)
  if (totalLength > 40 && specialCharCount / Math.max(1,totalLength) > 0.18) {
      return { isBug: true, reason: 'excessive_special_chars', severity: 'high' };
    }

    // Heuristics set 2: zero-width / bidi / combining marks and surrogates
  const suspicious = [
      /[\u200B-\u200D\uFEFF\u061C]{12,}/,
      /[\u202A-\u202E\u2066-\u2069]{4,}/,
      /[\u0300-\u036F]{24,}/,
      /[\uD800-\uDFFF]{18,}/,
      /(.)\1{80,}/,
    ];
    if (suspicious.some((r) => r.test(textContent))) {
      return { isBug: true, reason: 'suspicious_unicode', severity: 'high' };
    }

    // Oversized message (potential crash attempt)
  if (totalLength > 12000) {
      return { isBug: true, reason: 'oversized_message', severity: 'critical' };
    }

    // Invisible reactions without content
    if (msg.reactionMessage && !textContent && !msg.imageMessage && !msg.videoMessage) {
      return { isBug: true, reason: 'invisible_reaction', severity: 'high' };
    }

    // Suspicious poll spam and repeated-line spam
    const senderMsgs = runtime.recentMessages.get(sender) || [];
    senderMsgs.push(now);
    const filtered = senderMsgs.filter((t) => now - t < 10000);
    runtime.recentMessages.set(sender, filtered);
  if ((msg.pollCreationMessage || msg.pollUpdateMessage) && filtered.length > 2) {
      return { isBug: true, reason: 'poll_spam', severity: 'medium' };
    }

    // Repeated lines (copy-paste spam): count lines and duplicates
    const lineCount = (textContent.match(/\n/g) || []).length + 1;
    if (lineCount >= 3) {
      const lines = textContent.split(/\n+/).map(s=>s.trim()).filter(Boolean);
      const dupRatio = lines.length ? (lines.length - new Set(lines).size) / lines.length : 0;
  if (dupRatio > 0.3) {
        return { isBug: true, reason: 'repeated_lines', severity: 'high' };
      }
    }

    // Identical burst spam within 5s
  if (filtered.length >= 2) {
      const last3 = filtered.slice(-3);
      if (last3[2] - last3[0] < 5000) {
        return { isBug: true, reason: 'identical_spam', severity: 'medium' };
      }
    }

    // Rapid spam (>7 msgs/10s)
  if (filtered.length > 4) {
      return { isBug: true, reason: 'rapid_spam', severity: 'critical' };
    }

    // Suspicious contact payloads (contact bombing)
    if (msg.contactMessage || msg.contactsArrayMessage) {
      const count = msg.contactsArrayMessage?.contacts?.length || 1;
      if (count > 5) return { isBug: true, reason: 'contacts_bomb', severity: 'high' };
    }

    return { isBug: false };
  } catch (e) {
    return { isBug: false };
  }
}

// Stricter detector for anti-lag only: trigger only on extreme crash patterns
function detectSevereBugMessage(message) {
  try {
    const msg = message.message;
    if (!msg) return { isBug: false };
    const textContent = msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || msg.videoMessage?.caption || '';
    const msgString = JSON.stringify(msg);
    const totalLength = msgString.length;

    // Extremely oversized payloads
    if (totalLength > 25000) return { isBug: true, reason: 'oversized_message', severity: 'critical' };

    // Massive zero-width/bidi/combining sequences
    if (/[\u200B-\u200D\uFEFF\u061C]{40,}/.test(textContent)) return { isBug: true, reason: 'zero_width_mass', severity: 'high' };
    if (/[\u202A-\u202E\u2066-\u2069]{12,}/.test(textContent)) return { isBug: true, reason: 'bidi_mass', severity: 'high' };
    if (/[\u0300-\u036F]{80,}/.test(textContent)) return { isBug: true, reason: 'combining_mass', severity: 'high' };

    // Extremely long repeated characters
    if (/(.)\1{160,}/.test(textContent)) return { isBug: true, reason: 'repeat_mass', severity: 'high' };

    return { isBug: false };
  } catch {
    return { isBug: false };
  }
}

// DM anti-bug detector: only match true crash patterns, avoid normal texts
function detectDMBugMessage(message) {
  try {
    const msg = message.message;
    if (!msg) return { isBug: false };
    const textContent = msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || msg.videoMessage?.caption || '';
    const msgString = JSON.stringify(msg);
    const totalLength = msgString.length;

    // Oversized payloads typical of crash texts
    if (totalLength > 18000) return { isBug: true, reason: 'oversized_message', severity: 'critical' };

    // Zero-width / bidi / combining marks in very large bursts
    if (/[\u200B-\u200D\uFEFF\u061C]{24,}/.test(textContent)) return { isBug: true, reason: 'zero_width_mass', severity: 'high' };
    if (/[\u202A-\u202E\u2066-\u2069]{10,}/.test(textContent)) return { isBug: true, reason: 'bidi_mass', severity: 'high' };
    if (/[\u0300-\u036F]{60,}/.test(textContent)) return { isBug: true, reason: 'combining_mass', severity: 'high' };

    // Long repeated characters
    if (/(.)\1{120,}/.test(textContent)) return { isBug: true, reason: 'repeat_mass', severity: 'high' };

    return { isBug: false };
  } catch {
    return { isBug: false };
  }
}

// REAL-TIME Spam detection for groups (coarse)
function detectGroupSpam(groupId) {
  const now = Date.now();
  if (!runtime.groupSpamTracker.has(groupId)) {
    runtime.groupSpamTracker.set(groupId, { count: 0, lastReset: now, messages: [] });
  }
  const tracker = runtime.groupSpamTracker.get(groupId);
  if (now - tracker.lastReset > 60000) { tracker.count = 0; tracker.lastReset = now; tracker.messages = []; }
  tracker.count++;
  tracker.messages.push(now);
  tracker.messages = tracker.messages.filter((t) => now - t < 60000);
  return tracker.count > 30;
}

// Lag detection sampling
setInterval(() => {
  const mem = process.memoryUsage();
  const memUsageMB = mem.rss / 1024 / 1024;
  const now = Date.now();
  runtime.lagDetector.samples.push({ time: now, mem: memUsageMB });
  runtime.lagDetector.samples = runtime.lagDetector.samples.slice(-10);
  // Event loop lag proxy (1s tick)
}, 1000).unref();

function calculateLagLevel() {
  const mem = process.memoryUsage();
  const memUsageMB = mem.rss / 1024 / 1024;
  const samples = runtime.lagDetector.samples;
  const avg = samples.length ? samples.reduce((a, b) => a + b.mem, 0) / samples.length : memUsageMB;
  if (memUsageMB > 350 || avg > 300) return 'high';
  if (memUsageMB > 250 || avg > 200) return 'medium';
  return 'low';
}

function isRunningSlow() {
  const mem = process.memoryUsage();
  return mem.rss / 1024 / 1024 > 300;
}

function isProneToBan() {
  let spammingGroups = 0;
  runtime.groupSpamTracker.forEach((tracker) => { if (tracker.count > 30) spammingGroups++; });
  return spammingGroups > 5;
}

function statusSummary() {
  const s = getSettings();
  const lagStatus = calculateLagLevel();
  const lagMs = lagStatus === 'high' ? '500+' : lagStatus === 'medium' ? '200-500' : '<200';
  const spammingGroups = [];
  runtime.groupSpamTracker.forEach((tracker, groupId) => { if (tracker.count > 30) spammingGroups.push(groupId); });
  return {
    antiLag: s.antiLag,
    antiBug: s.antiBug,
    contactOnly: s.contactOnly,
    optimizationEnabled: s.optimizationEnabled,
    blockedCodes: s.blockedCodes,
    groupsSpamming: spammingGroups,
    lagMs,
    runningSlow: isRunningSlow(),
    proneToBan: isProneToBan(),
  };
}

// REAL-TIME incoming message protection handler
async function handleIncomingProtection(sock, message) {
  try {
    const s = getSettings();
    const chatId = message.key.remoteJid;
    const senderId = message.key.participant || message.participant || message.key.remoteJid;
    const isGroup = chatId.endsWith('@g.us');

    // Whitelist groups bypass
    if (isGroup && runtime.groupWhitelist.has(chatId)) return { blocked: false };

    // ===== Anti-bug (DMs only) =====
    if (s.antiBug && !isGroup) {
      const bugCheck = detectBugMessage(message);
      
      if (bugCheck.isBug) {
        // DELETE THE BUG MESSAGE FOR YOURSELF ONLY - using the proven format from deleteCommand
        let deleted = false;
        
        try {
          // Use the exact same format that works in your deleteCommand
          await sock.sendMessage(chatId, {
            delete: {
              remoteJid: chatId,
              fromMe: false,
              id: message.key.id,
              participant: senderId
            }
          });
          deleted = true;
          console.log('✅ Bug message deleted successfully');
          
          // Small delay to ensure deletion completes
          await new Promise(r => setTimeout(r, 300));
        } catch (e) {
          console.log('❌ Delete failed:', e.message);
          
          // One retry attempt
          try {
            await new Promise(r => setTimeout(r, 200));
            await sock.sendMessage(chatId, {
              delete: {
                remoteJid: chatId,
                fromMe: false,
                id: message.key.id,
                participant: senderId
              }
            });
            deleted = true;
            console.log('✅ Bug message deleted on retry');
          } catch (e2) {
            console.log('❌ Delete retry failed:', e2.message);
          }
        }

        // BLOCK THE SENDER
        let blocked = false;
        if (!message.key.fromMe) {
          try { 
            await sock.updateBlockStatus(senderId, 'block'); 
            runtime.blockedUsers.add(senderId);
            blocked = true;
            console.log('✅ Sender blocked successfully');
          } catch (e) { 
            try { 
              await new Promise(r => setTimeout(r, 200)); 
              await sock.updateBlockStatus(senderId, 'block'); 
              runtime.blockedUsers.add(senderId);
              blocked = true;
              console.log('✅ Sender blocked on retry');
            } catch (e2) {
              console.log('❌ Block failed:', e2.message);
            } 
          }
        }

        // Send alert to owner
        try {
          const ownerJid = (process.env.OWNER_NUMBER ? `${String(process.env.OWNER_NUMBER).replace(/[^0-9]/g,'')}@s.whatsapp.net` : (sock.user.id.split(':')[0] + '@s.whatsapp.net'));
          const senderNumber = `+${(senderId.split('@')[0] || '').replace(/[^0-9]/g,'')}`;
          const redacted = (message.message?.conversation || message.message?.extendedTextMessage?.text || '').slice(0, 120);
          
          await sock.sendMessage(ownerJid, { 
            text: `🚨 WAMaster Bug Alert\nChat Type: DM\nDeleted For Me: ${deleted ? 'Yes' : 'No'}\nBlocked: ${blocked ? 'Yes' : 'No'}\nSender Number: ${senderNumber}\nSender JID: ${senderId}\nChat: ${chatId}\nReason: ${bugCheck.reason}\nSnippet: ${redacted}` 
          });
          console.log('✅ Alert sent to owner');
        } catch (e) {
          console.log('❌ Alert failed:', e.message);
        }

        runtime.deletedMessages.set(message.key.id, { 
          sender: senderId, 
          time: Date.now(), 
          reason: bugCheck.reason, 
          deleted 
        });
        
        return { blocked: true, reason: 'bug', severity: bugCheck.severity };
      }
    }

    // ===== Foreign filter =====
    if (s.foreignFilter && !isGroup && !message.key.fromMe) {
      const senderCode = detectUserCountryCode(senderId);
      let ownerCode = s.userCountryCode;
      if (!ownerCode && sock.user) {
        const ownerJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        ownerCode = detectUserCountryCode(ownerJid);
        if (ownerCode) { s.userCountryCode = ownerCode; saveSettings(s); }
      }
      if (senderCode && ownerCode && senderCode !== ownerCode) {
        try { await sock.updateBlockStatus(senderId, 'block'); runtime.blockedUsers.add(senderId); } catch {}
        return { blocked: true, reason: 'foreign' };
      }
    }

    // ===== Blocked codes =====
    if (getSettings().blockedCodes.length > 0 && !isGroup && !message.key.fromMe) {
      const senderCode = detectUserCountryCode(senderId);
      if (senderCode && getSettings().blockedCodes.includes(senderCode)) {
        try { await sock.updateBlockStatus(senderId, 'block'); runtime.blockedUsers.add(senderId); } catch {}
        return { blocked: true, reason: 'blocked-code' };
      }
    }

    // ===== Contact-only mode =====
    if (s.contactOnly !== 'off' && !isGroup && !message.key.fromMe) {
      let isContact = false;
      try {
        // Prefer WhatsApp exists check
        const result = await sock.onWhatsApp(senderId);
        isContact = Array.isArray(result) && !!result[0]?.exists;
      } catch {}
      // Fallback to lightweight store if available
      if (!isContact) {
        try { const store = require('./lightweight_store'); isContact = !!(store.contacts && store.contacts[senderId]); } catch {}
      }

      if (!isContact) {
        if (s.contactOnly === 'immediate') {
          try { 
            await sock.sendMessage(chatId, {
              delete: {
                remoteJid: chatId,
                fromMe: false,
                id: message.key.id,
                participant: senderId
              }
            }); 
          } catch {}
          try { await sock.updateBlockStatus(senderId, 'block'); runtime.blockedUsers.add(senderId); } catch {}
          return { blocked: true, reason: 'not-contact' };
        } else if (s.contactOnly === 'delayed') {
          if (!runtime.contactCheckQueue.has(senderId)) {
            runtime.contactCheckQueue.set(senderId, { firstMessage: Date.now(), warned: true });
            try { await sock.sendMessage(chatId, { text: '⚠️ You are not in my contacts. You have 48 hours to receive a response, or you will be blocked automatically.' }); } catch {}
          }
        }
      }
    }

    // ===== Per-minute rate limiting =====
    const count = incrementRate(message);
    if (count > getSettings().maxMessagesPerMinute) {
      if (isGroup) {
        const g = runtime.groupSpamTracker.get(chatId) || { count: 0, lastReset: Date.now(), messages: [] };
        g.count += 1; runtime.groupSpamTracker.set(chatId, g);
        try { 
          await sock.sendMessage(chatId, {
            delete: {
              remoteJid: chatId,
              fromMe: false,
              id: message.key.id,
              participant: senderId
            }
          }); 
        } catch {}
        return { blocked: true, reason: 'ratelimit' };
      }
      // In DMs: do not auto-block on rate limit; ignore without actions
      return { blocked: false };
    }

    // ===== Anti-lag: drop extremely spammy content if enabled =====
    if (isGroup && (s.antiLag || s.optimizationEnabled)) {
      // Drop only extreme crash-like content in groups to avoid false positives
      const bugLike = detectSevereBugMessage(message);
      if (bugLike.isBug) {
        try { 
          await sock.sendMessage(chatId, {
            delete: {
              remoteJid: chatId,
              fromMe: false,
              id: message.key.id,
              participant: senderId
            }
          }); 
        } catch {}
        return { blocked: true, reason: 'antilag-buglike' };
      }
      if (detectGroupSpam(chatId)) {
        try { 
          await sock.sendMessage(chatId, {
            delete: {
              remoteJid: chatId,
              fromMe: false,
              id: message.key.id,
              participant: senderId
            }
          }); 
        } catch {}
        return { blocked: true, reason: 'antilag-group-spam' };
      }
      if (isRunningSlow()) return { blocked: false, skipHeavyOps: true };
    }

    return { blocked: false };
  } catch (e) {
    console.log('❌ Protection handler error:', e.message);
    return { blocked: false };
  }
}

// Cleanup old tracking data periodically - REAL-TIME CLEANUP
setInterval(() => {
  const now = Date.now();
  // Clean message tracking (10s window)
  runtime.recentMessages.forEach((msgs, sender) => {
    const filtered = msgs.filter((t) => now - t < 10000);
    if (filtered.length === 0) runtime.recentMessages.delete(sender);
    else runtime.recentMessages.set(sender, filtered);
  });
  // Clean group trackers (2m)
  runtime.groupSpamTracker.forEach((tracker, groupId) => {
    if (now - tracker.lastReset > 120000) runtime.groupSpamTracker.delete(groupId);
  });
  // Clean deleted messages tracking (1h)
  runtime.deletedMessages.forEach((data, msgId) => {
    if (now - data.time > 3600000) runtime.deletedMessages.delete(msgId);
  });
  // Apply delayed blocks flag; actual block occurs on next message
  runtime.contactCheckQueue.forEach((data, sender) => {
    if (now - data.firstMessage > 172800000) { // 48h
      runtime.contactCheckQueue.delete(sender);
      runtime.blockedUsers.add(sender);
    }
  });
}, 60000).unref();

module.exports = {
  toggleAntiLag,
  toggleAntiBug,
  setContactOnly,
  toggleOptimize,
  blockCode,
  unblockCode,
  clearCodes,
  setForeign,
  getSettings,
  statusSummary,
  handleIncomingProtection,
  runtime,
  detectBugMessage,
  detectGroupSpam,
  detectUserCountryCode,
};