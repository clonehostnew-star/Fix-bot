const fetch = require('node-fetch');

const games = { quiz: new Map(), riddles: new Map(), scramble: new Map() };

async function fetchBibleVerse(book, chapter) {
  try {
    const res = await fetch(`https://bible-api.com/${book}%20${chapter}`);
    if (!res.ok) return null;
    const data = await res.json();
    return { text: data.text?.trim(), reference: data.reference };
  } catch { return null; }
}

module.exports = async function bibleCommand(sock, chatId, message, args) {
  const sub = (args[0] || '').toLowerCase();
  switch (sub) {
    case 'study': {
      const books = ['Genesis','Exodus','Matthew','Luke','John','Psalms','Proverbs'];
      const book = books[Math.floor(Math.random()*books.length)];
      const chapter = Math.floor(Math.random()*50)+1;
      const verse = await fetchBibleVerse(book, chapter);
      if (!verse) return await sock.sendMessage(chatId, { text: '❌ Failed to fetch verse.' }, { quoted: message });
      await sock.sendMessage(chatId, { text: `📖 ${verse.reference}\n\n${verse.text}` }, { quoted: message });
      break;
    }
    case 'quiz': {
      const verse = await fetchBibleVerse('Genesis', 1);
      if (!verse) return await sock.sendMessage(chatId, { text: '❌ Failed to create quiz.' }, { quoted: message });
      const options = [verse.reference,'Genesis 2:1','Exodus 1:1','Leviticus 1:1'].sort(()=>Math.random()-0.5);
      games.quiz.set(chatId, { ref: verse.reference, options });
      await sock.sendMessage(chatId, { text: `📖 Bible Quiz\n\n"${verse.text}"\n\nOptions:\n${options.map((o,i)=>`${i+1}. ${o}`).join('\n')}\n\nReply with 1-${options.length}` }, { quoted: message });
      break;
    }
    case 'riddle': {
      const riddles = [
        { q: 'Oldest man yet died before his father?', a: 'METHUSELAH', h: 'Genesis 5:27' },
        { q: 'Walked with God and was not?', a: 'ENOCH', h: 'Genesis 5:24' },
      ];
      const r = riddles[Math.floor(Math.random()*riddles.length)];
      games.riddles.set(chatId, r);
      await sock.sendMessage(chatId, { text: `🤔 ${r.q}\nType HINT for a hint.` }, { quoted: message });
      break;
    }
    case 'scramble': {
      const words = [ {w:'GENESIS',h:'First book'}, {w:'EXODUS',h:'Departure from Egypt'}, {w:'GOSPEL',h:'Good news'} ];
      const w = words[Math.floor(Math.random()*words.length)];
      const scrambled = w.w.split('').sort(()=>Math.random()-0.5).join('');
      games.scramble.set(chatId, w.w);
      await sock.sendMessage(chatId, { text: `🔤 Unscramble: ${scrambled}\nHint: ${w.h}` }, { quoted: message });
      break;
    }
    default:
      await sock.sendMessage(chatId, { text: `*Bible*\n\n.bible study\n.bible quiz\n.bible riddle\n.bible scramble` }, { quoted: message });
  }

  const body = message.message?.conversation?.trim();
  if (body) {
    // quiz answer
    if (games.quiz.has(chatId)) {
      const q = games.quiz.get(chatId);
      const n = parseInt(body);
      if (!isNaN(n) && n>=1 && n<=q.options.length) {
        const correct = q.options[n-1] === q.ref;
        await sock.sendMessage(chatId, { text: correct ? '✅ Correct!' : `❌ Incorrect. ${q.ref}` }, { quoted: message });
        games.quiz.delete(chatId);
        return;
      }
    }
    if (games.riddles.has(chatId)) {
      const r = games.riddles.get(chatId);
      if (body.toUpperCase() === 'HINT') {
        await sock.sendMessage(chatId, { text: `🔍 Hint: ${r.h}` }, { quoted: message });
      } else if (body.toUpperCase() === r.a) {
        await sock.sendMessage(chatId, { text: '✅ Correct!' }, { quoted: message });
        games.riddles.delete(chatId);
      }
    }
    if (games.scramble.has(chatId)) {
      const target = games.scramble.get(chatId);
      if (body.toUpperCase() === target) {
        await sock.sendMessage(chatId, { text: '✅ Correct!' }, { quoted: message });
        games.scramble.delete(chatId);
      }
    }
  }
}