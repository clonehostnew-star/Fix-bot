let fetch
try { fetch = require('node-fetch'); } catch { fetch = null }

const games = { quiz: new Map(), riddles: new Map(), scramble: new Map() };

// Fetch a single verse or passage using a reference string like "Genesis 1:2"
async function fetchBibleVerse(ref) {
  try {
    if (!fetch) return null;
    const url = `https://bible-api.com/${encodeURIComponent(ref)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return { text: (data.text || '').trim(), reference: data.reference };
  } catch { return null; }
}

const bibleState = new Map(); // chatId -> { book, chapter, verse }

async function bibleCommand(sock, chatId, message, args) {
  const sub = (args[0] || '').toLowerCase();
  switch (sub) {
    case 'study': {
      const join = args.slice(1).join(' ').trim();
      if (!join) {
        return sock.sendMessage(chatId, { text: 'Usage: .bible study <Book Chapter:Verse>\nExample: .bible study Job 19:25' }, { quoted: message });
      }
      const m = join.match(/^([A-Za-z ]+)\s+(\d+):(\d+)$/);
      if (!m) return sock.sendMessage(chatId,{ text:'❌ Format: <Book Chapter:Verse> e.g., Job 19:25' },{ quoted: message });
      const book = m[1].trim(); const chapter = parseInt(m[2]); const verseNum = parseInt(m[3]);
      bibleState.set(chatId, { book, chapter, verse: verseNum });
      const verse = await fetchBibleVerse(`${book} ${chapter}:${verseNum}`);
      if (!verse) return await sock.sendMessage(chatId, { text: '❌ Failed to fetch verse.' }, { quoted: message });
      await sock.sendMessage(chatId, { text: `📖 ${book} ${chapter}:${verseNum}\n\n${verse.text}\n\nType "continue" to read next verse.` }, { quoted: message });
      break;
    }
    case 'quiz': {
      const bank = [
        { q: 'Who said: "For I know that my redeemer lives"?', correct: 'Job', choices: ['Job','David','Moses','Paul'] },
        { q: 'Where is the verse "In the beginning God created the heavens and the earth"?', correct: 'Genesis 1:1', choices: ['Genesis 1:1','John 1:1','Exodus 1:1','Psalms 1:1'] },
        { q: 'Who built the ark?', correct: 'Noah', choices: ['Noah','Abraham','Elijah','Peter'] },
      ];
      const item = bank[Math.floor(Math.random()*bank.length)];
      const options = [...item.choices].sort(()=>Math.random()-0.5);
      games.quiz.set(chatId, { correct: item.correct, options });
      await sock.sendMessage(chatId, { text: `🧠 Bible Quiz\n\n${item.q}\n\n${options.map((o,i)=>`${i+1}. ${o}`).join('\n')}\n\nReply 1-${options.length} or type the answer.` }, { quoted: message });
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
}

async function handleBiblePassive(sock, chatId, message) {
  const body = message.message?.conversation?.trim();
  if (!body) return;
  if (body.toLowerCase() === 'continue' && bibleState.has(chatId)) {
    const s = bibleState.get(chatId);
    s.verse += 1;
    const verse = await fetchBibleVerse(`${s.book} ${s.chapter}:${s.verse}`);
    if (!verse) {
      await sock.sendMessage(chatId,{ text:'End of chapter or failed to fetch.'},{quoted:message});
      bibleState.delete(chatId);
      return;
    }
    await sock.sendMessage(chatId,{ text:`📖 ${s.book} ${s.chapter}:${s.verse}\n\n${verse.text}\n\nType "continue" for next verse.`},{quoted:message});
    bibleState.set(chatId, s);
    return;
  }
  // quiz answer
  if (games.quiz.has(chatId)) {
    const q = games.quiz.get(chatId);
    const n = parseInt(body);
    let correct = false;
    if (!isNaN(n) && n>=1 && n<=q.options.length) {
      correct = (q.options[n-1] === q.correct);
    } else {
      // Accept text answers as well
      const normalized = body.trim().toLowerCase();
      correct = q.options.some(opt => opt.trim().toLowerCase() === normalized) && normalized === q.correct.trim().toLowerCase();
    }
    if (correct) {
      await sock.sendMessage(chatId, { text: '✅ Correct!' }, { quoted: message });
    } else if (!isNaN(n) || body.length > 0) {
      await sock.sendMessage(chatId, { text: `❌ Incorrect. Correct answer: ${q.correct}` }, { quoted: message });
    }
    games.quiz.delete(chatId);
    return;
  }
  if (games.riddles.has(chatId)) {
    const r = games.riddles.get(chatId);
    if (body.toUpperCase() === 'HINT') {
      await sock.sendMessage(chatId, { text: `🔍 Hint: ${r.h}` }, { quoted: message });
    } else if (body.toUpperCase() === r.a) {
      await sock.sendMessage(chatId, { text: '✅ Correct!' }, { quoted: message });
      games.riddles.delete(chatId);
    } else {
      await sock.sendMessage(chatId, { text: '❌ Incorrect. Type HINT for a hint.' }, { quoted: message });
    }
  }
  if (games.scramble.has(chatId)) {
    const target = games.scramble.get(chatId);
    if (body.toUpperCase() === target) {
      await sock.sendMessage(chatId, { text: '✅ Correct!' }, { quoted: message });
      games.scramble.delete(chatId);
    } else {
      await sock.sendMessage(chatId, { text: '❌ Incorrect. Try again!' }, { quoted: message });
    }
  }
}

module.exports = { bibleCommand, handleBiblePassive };