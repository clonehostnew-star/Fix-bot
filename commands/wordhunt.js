const hunts = new Map();
const { getUser, saveUser } = require('../lib/economyStore');
let fetch; try { fetch = require('node-fetch'); } catch {}

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
  } catch { return false; }
}

// Word Hunt: grid letters, find any valid words; points = length.
// .wordhunt start [seconds=60]
async function startWordHunt(sock, chatId, message, args) {
  const sub = (args[0]||'').toLowerCase();
  if (sub!=='start') return sock.sendMessage(chatId,{text:'Usage: .wordhunt start [seconds]'}, {quoted:message});
  if (hunts.has(chatId)) return sock.sendMessage(chatId,{text:'A Word Hunt is already running.'},{quoted:message});
  const seconds = Math.min(180, Math.max(20, parseInt(args[1]||'60',10)||60));
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const grid = Array.from({length: 12}, () => letters[Math.floor(Math.random()*letters.length)]);
  const state = { ends: Date.now()+seconds*1000, players:new Map(), used:new Set(), grid };
  hunts.set(chatId, state);
  await sock.sendMessage(chatId,{text:`🧠 Word Hunt (find real words)!\nTime: ${seconds}s\nLetters: ${grid.join(' ')}`},{quoted:message});
  setTimeout(async ()=>{
    const h = hunts.get(chatId); if(!h) return;
    let winner=null,score=-1; for (const [pid,cnt] of h.players.entries()) { if (cnt>score){score=cnt;winner=pid;} }
    if (winner) { const u = await getUser(winner); u.wallet=(u.wallet||0)+(score*50); await saveUser(u); await sock.sendMessage(chatId,{text:`🏁 Hunt over! Winner: @${winner.split('@')[0]} — ${score} pts (+$${score*50})` ,mentions:[winner]}); }
    else await sock.sendMessage(chatId,{text:'No participants.'});
    hunts.delete(chatId);
  }, seconds*1000);
}

async function handleWordHuntMessage(sock, chatId, message) {
  const h = hunts.get(chatId); if (!h) return;
  const pid = message.key.participant || message.key.remoteJid;
  const body = message.message?.conversation?.trim(); if (!body || /\s/.test(body)) return;
  const w = body.toUpperCase();
  // word must be composed from available letters (allow reuse? choose limited reuse)
  const lettersAvail = h.grid.slice();
  for (const ch of w) {
    const idx = lettersAvail.indexOf(ch);
    if (idx === -1) return; // cannot form
    lettersAvail.splice(idx, 1);
  }
  const lw = w.toLowerCase();
  if (h.used.has(lw)) return;
  const valid = await isValidEnglishWord(lw);
  if (!valid) return;
  h.used.add(lw);
  const points = lw.length;
  h.players.set(pid,(h.players.get(pid)||0)+points);
}

module.exports = { startWordHunt, handleWordHuntMessage };