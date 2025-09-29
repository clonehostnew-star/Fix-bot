const hunts = new Map();
const { getUser, saveUser } = require('../lib/economyStore');

module.exports = async function wordHunt(sock, chatId, message, args) {
  const sub = (args[0]||'').toLowerCase();
  if (sub==='start') {
    if (hunts.has(chatId)) return sock.sendMessage(chatId,{text:'A hunt is already running.'},{quoted:message});
    hunts.set(chatId,{ players:new Map(), ends: Date.now()+30000 });
    await sock.sendMessage(chatId,{text:'🧠 Word Hunt starting! Type any English word. 30s. Join now!'},{quoted:message});
    setTimeout(async ()=>{
      const h = hunts.get(chatId); if(!h) return;
      let winner=null,score=-1; for (const [pid,cnt] of h.players.entries()) { if (cnt>score){score=cnt;winner=pid;} }
      if (winner) { const u = await getUser(winner); u.wallet=(u.wallet||0)+1000; await saveUser(u); await sock.sendMessage(chatId,{text:`🏁 Hunt over! Winner: @${winner.split('@')[0]} (+$1,000). Words: ${score}` ,mentions:[winner]}); }
      else await sock.sendMessage(chatId,{text:'No participants.'});
      hunts.delete(chatId);
    },30000);
  } else {
    const h = hunts.get(chatId); if (!h) return;
    const pid = message.key.participant || message.key.remoteJid;
    const body = message.message?.conversation?.trim(); if (!body || /\s/.test(body)) return;
    h.players.set(pid,(h.players.get(pid)||0)+1);
  }
}