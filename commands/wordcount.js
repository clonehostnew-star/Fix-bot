const sessions = new Map();
const { getUser, saveUser } = require('../lib/economyStore');
let fetch; try { fetch = require('node-fetch'); } catch {}

// Simple cache for dictionary lookups
const dictCache = new Map();
async function isValidEnglishWord(word) {
  const key = word.toLowerCase();
  if (dictCache.has(key)) return dictCache.get(key);
  try {
    if (!fetch) return false;
    const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`);
    const ok = r && r.status === 200;
    dictCache.set(key, ok);
    return ok;
  } catch {
    return false;
  }
}

// WordCount game: round-based; starts at length 3, increments each round.
// Commands:
// .wordcount start [rounds=5] [per_round_seconds=20]
// Players JOIN during lobby; during each round, post a single word of required length.
// Valid only if passes dictionary check and not reused. Points = length.
async function startWordCount(sock, chatId, message, args) {
  const sub = (args[0] || '').toLowerCase();
  if (sub !== 'start') {
    return sock.sendMessage(chatId, { text: 'Usage: .wordcount start [rounds] [per_round_seconds]' }, { quoted: message });
  }
  if (sessions.has(chatId)) return sock.sendMessage(chatId, { text: 'A Word Count game is already running.' }, { quoted: message });
  const rounds = Math.min(15, Math.max(3, parseInt(args[1] || '5', 10) || 5));
  const perRoundSec = Math.min(120, Math.max(10, parseInt(args[2] || '20', 10) || 20));

  const host = message.key.participant || message.key.remoteJid;
  const state = {
    mode: 'wordcount',
    host,
    stage: 'lobby',
    players: new Set([host]),
    scores: new Map([[host, 0]]),
    used: new Set(),
    round: 0,
    rounds,
    perRoundSec,
    requiredLen: 3,
    timeout: null,
  };
  sessions.set(chatId, state);
  await sock.sendMessage(chatId, { text: `🔤 Word Count — Lobby\nRounds: ${rounds}\nPer round: ${perRoundSec}s\nStarts at 3-letter words. Type JOIN to enter. Lobby closes in 20s.` }, { quoted: message });
  setTimeout(async () => {
    const s = sessions.get(chatId); if (!s || s !== state || s.stage !== 'lobby') return;
    s.stage = 'running';
    if (s.players.size === 0) { sessions.delete(chatId); return; }
    await nextRound(sock, chatId);
  }, 20000);
}

async function nextRound(sock, chatId) {
  const s = sessions.get(chatId); if (!s) return;
  s.round += 1;
  if (s.round > s.rounds) { await finishWordCount(sock, chatId, s); sessions.delete(chatId); return; }
  s.requiredLen = 2 + s.round; // 3,4,5,...
  s.used.clear();
  await sock.sendMessage(chatId, { text: `🔤 Round ${s.round}/${s.rounds} — word length: ${s.requiredLen}\nYou have ${s.perRoundSec}s!` });
  clearTimeout(s.timeout);
  s.timeout = setTimeout(async () => {
    const st = sessions.get(chatId); if (!st || st !== s) return;
    await nextRound(sock, chatId);
  }, s.perRoundSec * 1000);
}

async function finishWordCount(sock, chatId, s) {
  let winner = null, max = -1;
  for (const [pid, sc] of s.scores.entries()) { if (sc > max) { max = sc; winner = pid; } }
  if (winner && max > 0) {
    try { const u = await getUser(winner); u.wallet = (u.wallet || 0) + (max * 50); await saveUser(u); } catch {}
    await sock.sendMessage(chatId, { text: `🏁 Word Count Winner: @${winner.split('@')[0]} — ${max} pts (+$${max * 50})`, mentions: [winner] });
  } else {
    await sock.sendMessage(chatId, { text: 'No valid words submitted.' });
  }
}

async function handleWordCountMessage(sock, chatId, message) {
  const s = sessions.get(chatId); if (!s || s.mode !== 'wordcount' || s.stage !== 'running') return;
  const pid = message.key.participant || message.key.remoteJid;
  const body = (message.message?.conversation || '').trim();
  if (!body || /\s/.test(body)) return;
  if (body.length !== s.requiredLen) return; // exact length required
  const w = body.toLowerCase();
  if (s.used.has(w)) return;
  const valid = await isValidEnglishWord(w);
  if (!valid) return;
  s.used.add(w);
  s.scores.set(pid, (s.scores.get(pid) || 0) + w.length);
}

// JOIN handler inside passive
async function handleJoin(sock, chatId, message) {
  const s = sessions.get(chatId); if (!s || s.stage !== 'lobby') return false;
  const pid = message.key.participant || message.key.remoteJid;
  if (!s.players.has(pid)) { s.players.add(pid); s.scores.set(pid, 0); await sock.sendMessage(chatId, { text: `Joined: @${pid.split('@')[0]}`, mentions: [pid] }); }
  return true;
}

module.exports = { startWordCount, handleWordCountMessage, handleJoin };