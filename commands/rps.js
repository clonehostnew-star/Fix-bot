const sessions = new Map();

module.exports = async function rpsCommand(sock, chatId, message, args) {
  const sub = (args[0] || '').toLowerCase();
  const valid = ['rock','paper','scissors'];

  if (!sub || sub === 'help') {
    return sock.sendMessage(chatId, { text: '🎮 RPS\n• Personal: .rps rock|paper|scissors\n• Multiplayer: .rps start (lobby 20s) then players type JOIN, then DM .rps pick <rock|paper|scissors>' }, { quoted: message });
  }

  // Personal versus bot
  if (valid.includes(sub)) {
    const choice = sub;
    const bot = valid[Math.floor(Math.random()*valid.length)];
    const youWin = (choice==='rock'&&bot==='scissors')||(choice==='paper'&&bot==='rock')||(choice==='scissors'&&bot==='paper');
    const text = `🪨📄✂️ Rock-Paper-Scissors\nYou: ${choice}\nBot: ${bot}\n\n${choice===bot?'It\'s a draw!': (youWin?'You win!':'You lose!')}`;
    return sock.sendMessage(chatId, { text }, { quoted: message });
  }

  // Multiplayer
  const userId = message.key.participant || message.key.remoteJid;
  if (sub === 'start') {
    if (sessions.has(chatId)) return sock.sendMessage(chatId,{ text:'An RPS match is already running.' },{ quoted: message });
    const s = { stage:'lobby', players:new Set([userId]), picks:new Map(), timeout:null };
    sessions.set(chatId, s);
    await sock.sendMessage(chatId,{ text:'🪨📄✂️ RPS — Lobby open (20s). Type JOIN to enter. After start, DM .rps pick <rock|paper|scissors> here.' },{ quoted: message });
    s.timeout = setTimeout(async ()=>{
      const st = sessions.get(chatId); if (!st || st!==s || st.stage!=='lobby') return;
      if (st.players.size < 2) { sessions.delete(chatId); return sock.sendMessage(chatId,{ text:'Not enough players for RPS.' }); }
      st.stage='picking';
      await sock.sendMessage(chatId,{ text:'RPS started! Everyone, send .rps pick <rock|paper|scissors>.' });
      // picking window 20s
      setTimeout(async ()=>{
        await settleRps(sock, chatId);
      }, 20000);
    }, 20000);
    return;
  }

  if (sub === 'pick') {
    const s = sessions.get(chatId); if (!s || s.stage!=='picking') return;
    const pick = (args[1]||'').toLowerCase(); if (!valid.includes(pick)) return;
    if (!s.players.has(userId)) return;
    s.picks.set(userId, pick);
    return;
  }
}

async function settleRps(sock, chatId) {
  const s = sessions.get(chatId); if (!s) return;
  s.stage = 'finished';
  const entries = Array.from(s.players.values());
  if (entries.length < 2) { sessions.delete(chatId); return; }
  // Build results table
  const valid = ['rock','paper','scissors'];
  const beatenBy = { rock:'paper', paper:'scissors', scissors:'rock' };
  const scores = new Map(entries.map(pid => [pid, 0]));
  for (let i=0;i<entries.length;i++){
    for (let j=i+1;j<entries.length;j++){
      const a = entries[i], b = entries[j];
      const pa = s.picks.get(a), pb = s.picks.get(b);
      if (!pa || !pb) continue;
      if (pa===pb) continue;
      if (beatenBy[pa]===pb) scores.set(b, (scores.get(b)||0)+1); else scores.set(a, (scores.get(a)||0)+1);
    }
  }
  const sorted = Array.from(scores.entries()).sort((a,b)=>b[1]-a[1]);
  const winner = sorted[0]?.[0];
  if (winner) {
    await sock.sendMessage(chatId,{ text:`🏁 RPS Winner: @${winner.split('@')[0]}`, mentions:[winner] });
  } else {
    await sock.sendMessage(chatId,{ text:'No decisive winner.' });
  }
  sessions.delete(chatId);
}

