const hm = new Map();
const { getUser, saveUser } = require('../lib/economyStore');

function prize() { return Math.floor(Math.random() * (15000 - 10000 + 1)) + 10000; }

module.exports = async function hangmanGame(sock, chatId, message, args) {
  const sub = (args[0] || '').toLowerCase();
  const userId = message.key.participant || message.key.remoteJid;

  if (sub === 'guide') {
    return sock.sendMessage(chatId, { text: '🎮 Hangman\n\n.hm start | .hm guess <letter> | .hm forfeit' }, { quoted: message });
  }

  if (sub === 'start') {
    const u = await getUser(userId);
    if ((u.wallet||0) < 100) return sock.sendMessage(chatId, { text: '⚠️ Need $100 to start.' }, { quoted: message });
    u.wallet -= 100; await saveUser(u);
    const words = ['Banana','Laptop','Rocket','Coffee','Garden','Jacket','Yellow','Mother','Silver'];
    const word = words[Math.floor(Math.random()*words.length)].toLowerCase();
    hm.set(userId, { word, masked: word.replace(/./g,'➖'), attempts: 6, guessed: [] });
    return sock.sendMessage(chatId, { text: `🎮 Hangman Started!\nWord: ${word.replace(/./g,'➖')}\nAttempts: 6` }, { quoted: message });
  }

  if (sub === 'forfeit') {
    const g = hm.get(userId); if (!g) return;
    hm.delete(userId);
    return sock.sendMessage(chatId, { text: `⚠️ Forfeited. Word: ${g.word.toUpperCase()}` }, { quoted: message });
  }

  if (sub === 'guess') {
    const g = hm.get(userId); if (!g) return;
    const letter = (args[1]||'').toLowerCase();
    if (!letter || letter.length!==1 || !/[a-z]/.test(letter)) return sock.sendMessage(chatId,{text:'Guess one letter (a-z).'},{quoted:message});
    if (g.guessed.includes(letter)) return sock.sendMessage(chatId,{text:'Already guessed.'},{quoted:message});
    g.guessed.push(letter);
    if (g.word.includes(letter)) {
      g.masked = g.word.split('').map((c,i)=> (g.masked[i]!=='➖'|| c===letter)? c:'➖').join('');
      if (!g.masked.includes('➖')) {
        const win = prize();
        const u = await getUser(userId); u.wallet = (u.wallet||0)+win; await saveUser(u);
        hm.delete(userId);
        return sock.sendMessage(chatId,{text:`🎉 You won! +${win}`},{quoted:message});
      }
      return sock.sendMessage(chatId,{text:`✅ Correct\nWord: ${g.masked}\nAttempts: ${g.attempts}`},{quoted:message});
    } else {
      g.attempts -= 1;
      if (g.attempts<=0) { hm.delete(userId); return sock.sendMessage(chatId,{text:`❌ You lost! Word: ${g.word.toUpperCase()}`},{quoted:message}); }
      return sock.sendMessage(chatId,{text:`❌ Wrong\nWord: ${g.masked}\nAttempts: ${g.attempts}`},{quoted:message});
    }
  }
}