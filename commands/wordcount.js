const sessions = new Map();
const { getUser, saveUser } = require('../lib/economyStore');

async function startWordCount(sock, chatId, message, args) {
  const sub=(args[0]||'').toLowerCase();
  if (sub!=='start') {
    return sock.sendMessage(chatId,{text:'Usage: .wordcount start'},{quoted:message});
  }
  if (sessions.has(chatId)) return sock.sendMessage(chatId,{text:'A wordcount is already running.'},{quoted:message});
  sessions.set(chatId,{ ends: Date.now()+30000, counts:new Map() });
  await sock.sendMessage(chatId,{text:'🔤 Word Count starting! Type sentences. 30s window.'},{quoted:message});
  setTimeout(async ()=>{
    const s=sessions.get(chatId); if(!s)return;
    let winner=null, max=0; for (const [pid,c] of s.counts.entries()) { if (c>max){max=c;winner=pid;} }
    if (winner) { const u=await getUser(winner); u.wallet=(u.wallet||0)+1000; await saveUser(u); await sock.sendMessage(chatId,{text:`🏁 Word Count Winner: @${winner.split('@')[0]} (+$1,000). Words: ${max}`,mentions:[winner]}); }
    else await sock.sendMessage(chatId,{text:'No participants.'});
    sessions.delete(chatId);
  },30000);
}

async function handleWordCountMessage(sock, chatId, message) {
  const s=sessions.get(chatId); if(!s)return;
  const pid=message.key.participant || message.key.remoteJid;
  const text=message.message?.conversation||'';
  const words=text.trim().split(/\s+/).filter(Boolean).length;
  if (words>0) s.counts.set(pid,(s.counts.get(pid)||0)+words);
}

module.exports = { startWordCount, handleWordCountMessage };