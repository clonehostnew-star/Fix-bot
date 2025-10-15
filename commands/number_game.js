const games = new Map();
const { getUser, saveUser } = require('../lib/economyStore');

function prize(attempts) { const base = Math.floor(Math.random()*(10000-7000+1))+7000; return Math.floor(base * (attempts/10)); }

module.exports = async function numberGame(sock, chatId, message, args) {
  const sub = (args[0]||'').toLowerCase();
  const userId = message.key.participant || message.key.remoteJid;

  if (sub === 'guide') return sock.sendMessage(chatId,{text:'🎮 Number\n\n.number start | .number guess <1-100> | .number forfeit'},{quoted:message});

  if (sub === 'start') {
    const u = await getUser(userId);
    if ((u.wallet||0) < 100) return sock.sendMessage(chatId,{text:'⚠️ Need $100 to start.'},{quoted:message});
    u.wallet -= 100; await saveUser(u);
    const num = Math.floor(Math.random()*100)+1;
    games.set(userId,{ num, attempts:10 });
    return sock.sendMessage(chatId,{text:'🎮 Started! Guess a number 1-100. Attempts: 10'},{quoted:message});
  }

  if (sub === 'forfeit') { const g=games.get(userId); if(!g)return; games.delete(userId); return sock.sendMessage(chatId,{text:`💀 Forfeited. Number was ${g.num}`},{quoted:message}); }

  if (sub === 'guess') {
    const g = games.get(userId); if (!g) return;
    const n = parseInt(args[1]); if (isNaN(n)||n<1||n>100) return sock.sendMessage(chatId,{text:'Enter 1-100.'},{quoted:message});
    if (n===g.num) { const p = prize(g.attempts); const u=await getUser(userId); u.wallet=(u.wallet||0)+p; await saveUser(u); games.delete(userId); return sock.sendMessage(chatId,{text:`🎉 Correct! +${p}`},{quoted:message}); }
    g.attempts--; if (g.attempts<=0) { const num=g.num; games.delete(userId); return sock.sendMessage(chatId,{text:`💀 No attempts left. It was ${num}`},{quoted:message}); }
    const diff=Math.abs(n-g.num); const hint= diff>=50?'too far': diff>=20?'far': diff>=10?'close': diff>=5?'very close':'near';
    return sock.sendMessage(chatId,{text:`❌ Wrong. Hint: ${hint}. Attempts: ${g.attempts}`},{quoted:message});
  }
}