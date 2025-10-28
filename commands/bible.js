let fetch
try { fetch = require('node-fetch'); } catch { fetch = null }

const games = { quiz: new Map(), riddles: new Map(), scramble: new Map(), multi: new Map() };

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
      // Modes: personal | speed <n> | duel <n>
      const mode = (args[1] || '').toLowerCase();
      const numQ = parseInt(args[2] || args[1] || '0', 10);
      const sender = message.key.participant || message.key.remoteJid;
      if (!mode) {
        await sock.sendMessage(chatId, { text: `🧠 Bible Quiz Modes\n\n• personal — normal quiz\n• speed <n> — multiplayer, first correct scores\n• duel <n> — exactly two players, timed turns\n\nExamples:\n.bible quiz speed 5\n.bible quiz duel 5` }, { quoted: message });
        return;
      }
      if (mode === 'speed') {
        const total = (!isNaN(numQ) && numQ > 0 && numQ <= 50) ? numQ : 5;
        games.multi.set(chatId, {
          mode: 'speed', stage: 'lobby', host: sender, players: new Set([sender]), scores: new Map([[sender, 0]]),
          total, asked: 0, current: null, answered: false
        });
        await sock.sendMessage(chatId, { text: `🧠 Bible Quiz — Speed Race\nQuestions: ${total}\nType JOIN to enter. Lobby closes in 30s.` }, { quoted: message });
        setTimeout(async () => {
          const st = games.multi.get(chatId);
          if (!st || st.mode !== 'speed' || st.stage !== 'lobby') return;
          st.stage = 'running';
          if (st.players.size === 0) { games.multi.delete(chatId); return; }
          await askNextSpeed(sock, chatId);
        }, 30000);
        return;
      } else if (mode === 'duel') {
        const total = (!isNaN(numQ) && numQ > 0 && numQ <= 50) ? numQ : 5;
        games.multi.set(chatId, {
          mode: 'duel', stage: 'lobby', host: sender, players: [], scores: new Map(),
          total, asked: 0, current: null, turn: 0, timeout: null
        });
        await sock.sendMessage(chatId, { text: `🧠 Bible Quiz — Two Players\nQuestions each: ${total}\nType JOIN to enter (exactly 2 players). Lobby closes in 30s.` }, { quoted: message });
        setTimeout(async () => {
          const st = games.multi.get(chatId);
          if (!st || st.mode !== 'duel' || st.stage !== 'lobby') return;
          if (st.players.length !== 2) { games.multi.delete(chatId); await sock.sendMessage(chatId, { text: 'Not enough players for duel.' }); return; }
          st.stage = 'running';
          st.scores.set(st.players[0], 0); st.scores.set(st.players[1], 0);
          st.asked = 0; st.turn = 0;
          await askNextDuel(sock, chatId);
        }, 30000);
        return;
      }
      // personal (default)
      const bank = [
        { q: 'Who said: "For I know that my redeemer lives"?', correct: 'Job', choices: ['Job','David','Moses','Paul'] },
        { q: 'Where is the verse "In the beginning God created the heavens and the earth"?', correct: 'Genesis 1:1', choices: ['Genesis 1:1','John 1:1','Exodus 1:1','Psalms 1:1'] },
        { q: 'Who built the ark?', correct: 'Noah', choices: ['Noah','Abraham','Elijah','Peter'] },
      ];
      const item = bank[Math.floor(Math.random()*bank.length)];
      const options = [...item.choices].sort(()=>Math.random()-0.5);
      games.quiz.set(chatId, { correct: item.correct, options, attempts: 3 });
      await sock.sendMessage(chatId, { text: `🧠 Bible Quiz\n\n${item.q}\n\n${options.map((o,i)=>`${i+1}. ${o}`).join('\n')}\n\nReply 1-${options.length} or type the answer. Attempts: 3` }, { quoted: message });
      break;
    }
    case 'riddle': {
      const mode = (args[1] || '').toLowerCase();
      const numQ = parseInt(args[2] || args[1] || '0', 10);
      const sender = message.key.participant || message.key.remoteJid;
      if (mode === 'speed') {
        const total = (!isNaN(numQ) && numQ > 0 && numQ <= 50) ? numQ : 5;
        games.multi.set(chatId, { mode: 'riddle-speed', stage: 'lobby', host: sender, players: new Set([sender]), scores: new Map([[sender,0]]), total, asked: 0, current: null, answered: false });
        await sock.sendMessage(chatId, { text: `🤔 Bible Riddle — Speed Race\nQuestions: ${total}\nType JOIN to enter. Lobby closes in 30s.` }, { quoted: message });
        setTimeout(async()=>{ const st=games.multi.get(chatId); if(!st||st.mode!=='riddle-speed'||st.stage!=='lobby')return; st.stage='running'; if(st.players.size===0){ games.multi.delete(chatId); return;} await askNextRiddleSpeed(sock, chatId); }, 30000);
        return;
      }
      const r = sampleRiddle();
      games.riddles.set(chatId, r);
      await sock.sendMessage(chatId, { text: `🤔 ${r.q}\nType HINT for a hint.` }, { quoted: message });
      break;
    }
    case 'scramble': {
      const mode = (args[1] || '').toLowerCase();
      const numQ = parseInt(args[2] || args[1] || '0', 10);
      const sender = message.key.participant || message.key.remoteJid;
      if (mode === 'speed') {
        const total = (!isNaN(numQ) && numQ > 0 && numQ <= 50) ? numQ : 5;
        games.multi.set(chatId, { mode: 'scramble-speed', stage: 'lobby', host: sender, players: new Set([sender]), scores: new Map([[sender,0]]), total, asked: 0, current: null, answered: false });
        await sock.sendMessage(chatId, { text: `🔤 Bible Scramble — Speed Race\nQuestions: ${total}\nType JOIN to enter. Lobby closes in 30s.` }, { quoted: message });
        setTimeout(async()=>{ const st=games.multi.get(chatId); if(!st||st.mode!=='scramble-speed'||st.stage!=='lobby')return; st.stage='running'; if(st.players.size===0){ games.multi.delete(chatId); return;} await askNextScrambleSpeed(sock, chatId); }, 30000);
        return;
      }
      const w = sampleScramble();
      games.scramble.set(chatId, w.w);
      await sock.sendMessage(chatId, { text: `🔤 Unscramble: ${w.scrambled}\nHint: ${w.h}` }, { quoted: message });
      break;
    }
    default:
      await sock.sendMessage(chatId, { text: `*Bible*\n\n.bible study\n.bible quiz\n.bible riddle\n.bible scramble` }, { quoted: message });
  }
}

async function handleBiblePassive(sock, chatId, message) {
  const body = message.message?.conversation?.trim();
  if (!body) return;
  // Multi-player lobby joins and gameplay
  const state = games.multi.get(chatId);
  if (state) {
    const pid = message.key.participant || message.key.remoteJid;
    if (state.stage === 'lobby' && /^join$/i.test(body)) {
      if (state.mode === 'speed') {
        state.players.add(pid); state.scores.set(pid, 0); games.multi.set(chatId, state);
        await sock.sendMessage(chatId, { text: `Joined: @${pid.split('@')[0]}` , mentions:[pid] });
      } else if (state.mode === 'duel') {
        if (!state.players.includes(pid) && state.players.length < 2) { state.players.push(pid); games.multi.set(chatId, state); await sock.sendMessage(chatId, { text: `Joined: @${pid.split('@')[0]}` , mentions:[pid] }); }
      }
      return;
    }
    if (state.stage === 'running') {
      if (state.mode === 'speed') {
        const ans = normalizeAnswer(body);
        if (checkAnswer(state.current, ans)) {
          if (!state.answered) {
            state.answered = true;
            state.scores.set(pid, (state.scores.get(pid)||0)+10);
            await showLeaderboard(sock, chatId, state.scores);
            await askNextSpeed(sock, chatId);
          }
          games.multi.set(chatId, state);
        }
        return;
      } else if (state.mode === 'duel') {
        const currentPlayer = state.players[state.turn % 2];
        if (pid !== currentPlayer) {
          await sock.sendMessage(chatId, { text: `⏳ Not your turn, @${pid.split('@')[0]}`, mentions:[pid] });
          return;
        }
        const ans = normalizeAnswer(body);
        if (checkAnswer(state.current, ans)) {
          state.scores.set(pid, (state.scores.get(pid)||0)+10);
          state.asked += 1; state.turn += 1;
          await showLeaderboard(sock, chatId, state.scores);
          if (state.asked >= state.total*2) { await finishDuel(sock, chatId, state); games.multi.delete(chatId); return; }
          await askNextDuel(sock, chatId);
          games.multi.set(chatId, state);
        }
        return;
      }
    }
  }
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
      const normalized = body.trim().toLowerCase();
      correct = q.options.some(opt => opt.trim().toLowerCase() === normalized) && normalized === q.correct.trim().toLowerCase();
    }
    if (correct) {
      await sock.sendMessage(chatId, { text: '✅ Correct!' }, { quoted: message });
      games.quiz.delete(chatId);
    } else if (!isNaN(n) || body.length > 0) {
      q.attempts = (q.attempts || 1) - 1;
      if (q.attempts > 0) {
        await sock.sendMessage(chatId, { text: `❌ Incorrect. Attempts left: ${q.attempts}` }, { quoted: message });
        games.quiz.set(chatId, q);
      } else {
        await sock.sendMessage(chatId, { text: `❌ Incorrect. Correct answer: ${q.correct}` }, { quoted: message });
        games.quiz.delete(chatId);
      }
    }
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

function normalizeAnswer(s) { return (s||'').trim().toLowerCase(); }
function sampleQuestion() {
  const bank = [
    { q: 'Who said: "For I know that my redeemer lives"?', correct: 'job', choices: ['Job','David','Moses','Paul'] },
    { q: 'Where is "In the beginning God created the heavens and the earth"?', correct: 'genesis 1:1', choices: ['Genesis 1:1','John 1:1','Exodus 1:1','Psalms 1:1'] },
    { q: 'Who built the ark?', correct: 'noah', choices: ['Noah','Abraham','Elijah','Peter'] },
  ];
  const item = bank[Math.floor(Math.random()*bank.length)];
  const options = [...item.choices].sort(()=>Math.random()-0.5);
  return { q: item.q, correct: item.correct, options };
}
function sampleRiddle() {
  const bank = [
    { q: 'Oldest man yet died before his father?', a: 'methuselah', h: 'Genesis 5:27' },
    { q: 'Walked with God and was not?', a: 'enoch', h: 'Genesis 5:24' },
  ];
  return bank[Math.floor(Math.random()*bank.length)];
}
function sampleScramble() {
  const words = [ {w:'GENESIS',h:'First book'}, {w:'EXODUS',h:'Departure from Egypt'}, {w:'GOSPEL',h:'Good news'} ];
  const w = words[Math.floor(Math.random()*words.length)];
  const scrambled = w.w.split('').sort(()=>Math.random()-0.5).join('');
  return { w: w.w, h: w.h, scrambled };
}
function checkAnswer(current, ans) {
  if (!current) return false;
  if (!ans) return false;
  if (Array.isArray(current.options) && current.options.length) {
    // accept index or text
    const asIdx = parseInt(ans,10);
    if (!isNaN(asIdx) && asIdx>=1 && asIdx<=current.options.length) {
      return normalizeAnswer(current.options[asIdx-1]) === current.correct;
    }
    return normalizeAnswer(ans) === current.correct;
  }
  return normalizeAnswer(ans) === current.correct;
}
async function showLeaderboard(sock, chatId, scores) {
  const rows = Array.from(scores.entries()).sort((a,b)=>b[1]-a[1]).map(([pid,pts],i)=>`${i+1}. @${pid.split('@')[0]} — ${pts}`);
  await sock.sendMessage(chatId, { text: `🏅 Leaderboard\n${rows.join('\n')}`, mentions: Array.from(scores.keys()) });
}
async function askNextSpeed(sock, chatId) {
  const st = games.multi.get(chatId); if (!st) return;
  if (st.asked >= st.total) { await finishSpeed(sock, chatId, st); games.multi.delete(chatId); return; }
  const q = sampleQuestion(); st.current = q; st.answered = false; st.asked += 1; games.multi.set(chatId, st);
  const opts = q.options.map((o,i)=>`${i+1}. ${o}`).join('\n');
  await sock.sendMessage(chatId, { text: `Q${st.asked}/${st.total}: ${q.q}\n${opts}\n⏱️ First correct answer gets 10 points!` });
  // 15s timeout to move on
  setTimeout(async()=>{ const s=games.multi.get(chatId); if(!s||s!==st||s.answered) return; await sock.sendMessage(chatId,{text:`⏰ Time up! Answer: ${q.correct}`}); await askNextSpeed(sock, chatId); }, 15000);
}
async function askNextRiddleSpeed(sock, chatId) {
  const st = games.multi.get(chatId); if (!st) return;
  if (st.asked >= st.total) { await finishSpeed(sock, chatId, st); games.multi.delete(chatId); return; }
  const r = sampleRiddle(); st.current = { q: r.q, correct: r.a, options: [] }; st.answered = false; st.asked += 1; games.multi.set(chatId, st);
  await sock.sendMessage(chatId, { text: `Q${st.asked}/${st.total}: ${r.q}\n⏱️ First correct answer gets 10 points!` });
  setTimeout(async()=>{ const s=games.multi.get(chatId); if(!s||s!==st||s.answered) return; await sock.sendMessage(chatId,{text:`⏰ Time up! Answer: ${r.a}`}); await askNextRiddleSpeed(sock, chatId); }, 15000);
}
async function askNextScrambleSpeed(sock, chatId) {
  const st = games.multi.get(chatId); if (!st) return;
  if (st.asked >= st.total) { await finishSpeed(sock, chatId, st); games.multi.delete(chatId); return; }
  const w = sampleScramble(); st.current = { q: `Unscramble this: ${w.scrambled}\nHint: ${w.h}`, correct: w.w.toLowerCase(), options: [] }; st.answered = false; st.asked += 1; games.multi.set(chatId, st);
  await sock.sendMessage(chatId, { text: `Q${st.asked}/${st.total}: ${st.current.q}\n⏱️ First correct answer gets 10 points!` });
  setTimeout(async()=>{ const s=games.multi.get(chatId); if(!s||s!==st||s.answered) return; await sock.sendMessage(chatId,{text:`⏰ Time up! Answer: ${w.w}`}); await askNextScrambleSpeed(sock, chatId); }, 15000);
}
async function askNextDuel(sock, chatId) {
  const st = games.multi.get(chatId); if (!st) return;
  const player = st.players[st.turn % 2];
  const q = sampleQuestion(); st.current = { q: q.q, correct: q.correct, options: [] }; games.multi.set(chatId, st);
  await sock.sendMessage(chatId, { text: `@${player.split('@')[0]}'s turn: ${q.q}\n⏱️ 10s`, mentions:[player] });
  clearTimeout(st.timeout); st.timeout = setTimeout(async()=>{ const s=games.multi.get(chatId); if(!s||s!==st) return; s.asked += 1; s.turn += 1; await sock.sendMessage(chatId,{text:`⏰ Time up! Answer: ${q.correct}`}); if (s.asked >= s.total*2) { await finishDuel(sock, chatId, s); games.multi.delete(chatId); } else { await askNextDuel(sock, chatId); } }, 10000);
}
async function finishSpeed(sock, chatId, st) {
  const sorted = Array.from(st.scores.entries()).sort((a,b)=>b[1]-a[1]);
  const winner = sorted[0]?.[0]; const points = sorted[0]?.[1] || 0;
  await showLeaderboard(sock, chatId, st.scores);
  if (winner) {
    try { const { getUser, saveUser } = require('../lib/economyStore'); const u = await getUser(winner); u.wallet=(u.wallet||0)+points*100; await saveUser(u); } catch {}
    await sock.sendMessage(chatId, { text: `🏁 Winner: @${winner.split('@')[0]} (+$${points*100})`, mentions:[winner] });
  } else {
    await sock.sendMessage(chatId, { text: 'No winners.' });
  }
}
async function finishDuel(sock, chatId, st) {
  await showLeaderboard(sock, chatId, st.scores);
  const sorted = Array.from(st.scores.entries()).sort((a,b)=>b[1]-a[1]);
  const winner = sorted[0]?.[0]; const prize = (sorted[0]?.[1]||0)*100;
  if (winner) {
    try { const { getUser, saveUser } = require('../lib/economyStore'); const u = await getUser(winner); u.wallet=(u.wallet||0)+prize; await saveUser(u); } catch {}
    await sock.sendMessage(chatId, { text: `🏁 Duel winner: @${winner.split('@')[0]} (+$${prize})`, mentions:[winner] });
  }
}

module.exports = { bibleCommand, handleBiblePassive };