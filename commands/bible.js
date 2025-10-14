let fetch
try { fetch = require('node-fetch'); } catch { fetch = null }

const games = { quiz: new Map(), riddles: new Map(), scramble: new Map(), multi: new Map() };

// External helpers
const isAdmin = require('../lib/isAdmin');
const {
  isSudo,
  recordBibleQuizSolo,
  getBibleQuizLeaderboard,
  resetBibleQuizLeaderboard,
  setBibleQuizEnabled,
  isBibleQuizEnabled,
  setBibleQuizConfig,
  getBibleQuizConfig,
} = require('../lib/index');

// --- Bible Quiz (Personal) configuration ---
const PERSONAL_DEFAULT_QUESTIONS = 5;
const PERSONAL_ATTEMPTS_PER_QUESTION = 2;
const PERSONAL_SECONDS_PER_QUESTION = 20; // timeout per question

// A richer built-in question bank. All correct answers are normalized to lowercase.
function getQuestionBank() {
  const bank = [
    { q: 'Who said: "For I know that my Redeemer lives"?', correct: 'job', choices: ['Job','David','Moses','Paul'], ref: 'Job 19:25' },
    { q: 'Where is "In the beginning God created the heavens and the earth"?', correct: 'genesis 1:1', choices: ['Genesis 1:1','John 1:1','Exodus 1:1','Psalm 1:1'], ref: 'Genesis 1:1' },
    { q: 'Who built the ark?', correct: 'noah', choices: ['Noah','Abraham','Elijah','Peter'], ref: 'Genesis 6–9' },
    { q: 'Who led the Israelites out of Egypt?', correct: 'moses', choices: ['Moses','Joshua','Aaron','Joseph'], ref: 'Exodus 13–14' },
    { q: 'Which king wrote many of the Psalms?', correct: 'david', choices: ['David','Solomon','Saul','Hezekiah'], ref: 'Psalms' },
    { q: 'Finish the verse: "For God so loved the world..."', correct: 'john 3:16', choices: ['John 3:16','Romans 8:28','Genesis 12:1','Luke 2:11'], ref: 'John 3:16' },
    { q: 'Who was thrown into the lions’ den?', correct: 'daniel', choices: ['Daniel','Joseph','Samuel','Elijah'], ref: 'Daniel 6' },
    { q: 'How many days did God take to create the world?', correct: 'six', choices: ['Six','Seven','Three','Ten'], ref: 'Genesis 1' },
    { q: 'Who betrayed Jesus for 30 pieces of silver?', correct: 'judas', choices: ['Judas','Peter','Thomas','James'], ref: 'Matthew 26:14–16' },
    { q: 'Which prophet was swallowed by a great fish?', correct: 'jonah', choices: ['Jonah','Micah','Hosea','Amos'], ref: 'Jonah 1–2' },
    { q: 'Who interpreted Pharaoh’s dreams in Egypt?', correct: 'joseph', choices: ['Joseph','Daniel','Moses','Nehemiah'], ref: 'Genesis 41' },
    { q: 'Which book is known as the book of wisdom?', correct: 'proverbs', choices: ['Proverbs','Job','Ecclesiastes','Psalms'], ref: 'Proverbs' },
    { q: 'Who defeated Goliath?', correct: 'david', choices: ['David','Saul','Jonathan','Samson'], ref: '1 Samuel 17' },
    { q: 'What is the first commandment?', correct: 'no other gods', choices: ['No other gods','Do not steal','Honor your parents','Do not covet'], ref: 'Exodus 20:3' },
    { q: 'Where is the fruit of the Spirit listed?', correct: 'galatians 5:22-23', choices: ['Galatians 5:22-23','Romans 12','1 Corinthians 13','Ephesians 6'], ref: 'Galatians 5:22–23' }
  ];
  return bank;
}

function normalizeAnswer(s) { return (s||'').trim().toLowerCase(); }

function buildQuestion() {
  const bank = getQuestionBank();
  const item = bank[Math.floor(Math.random() * bank.length)];
  const shuffled = [...item.choices].sort(() => Math.random() - 0.5);
  const correctIndex = shuffled.findIndex(c => normalizeAnswer(c) === item.correct);
  return {
    question: item.q,
    choices: shuffled,
    correctIndex: correctIndex >= 0 ? correctIndex : 0,
    correctText: item.choices.find(c => normalizeAnswer(c) === item.correct) || item.choices[0],
    correctNormalized: item.correct,
    reference: item.ref || null
  };
}

function formatChoicesLettered(choices) {
  const letters = ['A','B','C','D','E','F'];
  return choices.map((c, i) => `${letters[i]}. ${c}`).join('\n');
}

function parseChoiceAnswer(input, numChoices) {
  const trimmed = (input || '').trim();
  // Numeric 1..N
  const asNum = parseInt(trimmed, 10);
  if (!isNaN(asNum) && asNum >= 1 && asNum <= numChoices) {
    return asNum - 1;
  }
  // Letter A..F
  const upper = trimmed.toUpperCase();
  const code = upper.charCodeAt(0);
  if (upper.length === 1 && code >= 65 && code < 65 + numChoices) {
    return code - 65;
  }
  return null;
}

function clearPersonalTimer(session) {
  if (session && session.timer) {
    clearTimeout(session.timer);
    session.timer = null;
  }
}

async function askNextPersonal(sock, chatId) {
  const session = games.quiz.get(chatId);
  if (!session || session.mode !== 'personal') return;

  // Finish if done
  if (session.asked >= session.total) {
    await finishPersonal(sock, chatId, session);
    games.quiz.delete(chatId);
    return;
  }

  // Prepare next question
  const q = buildQuestion();
  session.current = q;
  session.asked += 1;
  session.attemptsLeft = PERSONAL_ATTEMPTS_PER_QUESTION;
  session.usedHint = false;
  games.quiz.set(chatId, session);

  const spq = session.secondsPerQuestion || PERSONAL_SECONDS_PER_QUESTION;
  const body = `🧠 Bible Quiz (${session.asked}/${session.total})\n\n${q.question}\n\n${formatChoicesLettered(q.choices)}\n\nReply with A-D or 1-4.\nType HINT or SKIP. (${spq}s)`.trim();
  await sock.sendMessage(chatId, { text: body });

  clearPersonalTimer(session);
  session.timer = setTimeout(async () => {
    const s = games.quiz.get(chatId);
    if (!s || s !== session || s.mode !== 'personal' || s.current !== q) return;
    await sock.sendMessage(chatId, { text: `⏰ Time up! Answer: ${q.correctText}${q.reference ? ` (${q.reference})` : ''}` });
    await askNextPersonal(sock, chatId);
  }, spq * 1000);
}

async function finishPersonal(sock, chatId, session) {
  clearPersonalTimer(session);
  const totalPoints = session.score || 0;
  // Award coins if economy store is available
  try {
    const { getUser, saveUser } = require('../lib/economyStore');
    const player = session.host || null; // not tracked; single-player chat—credit sender if known
    if (player) {
      const user = await getUser(player);
      user.wallet = (user.wallet || 0) + totalPoints * 100;
      await saveUser(user);
    }
  } catch {}
  // Record persistent solo stats (non-blocking)
  try {
    const player = session.host || null;
    if (player) {
      await recordBibleQuizSolo(player, chatId, totalPoints, session.correctCount || 0, session.total || 0);
    }
  } catch {}
  await sock.sendMessage(chatId, { text: `🏁 Quiz finished!\nScore: ${totalPoints} points out of ${session.total * 10}.` });
}

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
      // Modes: personal [n] | speed <n> | duel <n> | stop | lb [group|global] [N] | enable/disable | config <field> <value> | resetlb [group|global]
      const mode = (args[1] || '').toLowerCase();
      const numQ = parseInt(args[2] || args[1] || '0', 10);
      const sender = message.key.participant || message.key.remoteJid;
      const isGroup = chatId.endsWith('@g.us');

      // Help
      if (!mode || mode === 'help') {
        await sock.sendMessage(chatId, { text: `🧠 Bible Quiz\n\n• .bible quiz [personal] [n] — start solo quiz (default n=${PERSONAL_DEFAULT_QUESTIONS})\n• .bible quiz speed <n> — multiplayer, first correct scores\n• .bible quiz duel <n> — two players, alternating turns\n• .bible quiz lb [group|global] [N] — show leaderboard\n• .bible quiz enable|disable — toggle in this group (admin)\n• .bible quiz config <questions|attempts|seconds> <n> — set group cfg (admin)\n• .bible quiz resetlb [group|global] — reset leaderboard (admin/global sudo)\n• During solo quiz: answer A-D or 1-4; HINT, SKIP, or STOP` }, { quoted: message });
        return;
      }

      // Leaderboard
      if (mode === 'lb' || mode === 'leaderboard') {
        const scope = (args[2] || (isGroup ? 'group' : 'global')).toLowerCase();
        const topN = parseInt(args[3] || '10', 10) || 10;
        const list = await getBibleQuizLeaderboard(scope === 'group' ? 'group' : 'global', chatId, topN);
        if (!list.length) { await sock.sendMessage(chatId, { text: 'No scores yet.' }, { quoted: message }); return; }
        const rows = list.map((r, i) => `${i+1}. @${String(r.userId||'').split('@')[0]} — ${r.points||0} pts (best ${r.best||0})`);
        await sock.sendMessage(chatId, { text: `🏆 Bible Quiz Leaderboard (${scope})\n${rows.join('\n')}`, mentions: list.map(r=>r.userId).filter(Boolean) }, { quoted: message });
        return;
      }

      // Enable/disable in group
      if (mode === 'enable' || mode === 'disable') {
        if (!isGroup) { await sock.sendMessage(chatId, { text: 'This toggle is for groups only.' }, { quoted: message }); return; }
        const admin = await isAdmin(sock, chatId, sender);
        if (!admin.isSenderAdmin && !message.key.fromMe) { await sock.sendMessage(chatId, { text: 'Only group admins can change quiz settings.' }, { quoted: message }); return; }
        await setBibleQuizEnabled(chatId, mode === 'enable');
        await sock.sendMessage(chatId, { text: `Bible quiz ${mode === 'enable' ? 'enabled' : 'disabled'} for this group.` }, { quoted: message });
        return;
      }

      // Config per group
      if (mode === 'config') {
        if (!isGroup) { await sock.sendMessage(chatId, { text: 'Config is for groups only.' }, { quoted: message }); return; }
        const admin = await isAdmin(sock, chatId, sender);
        if (!admin.isSenderAdmin && !message.key.fromMe) { await sock.sendMessage(chatId, { text: 'Only group admins can change quiz settings.' }, { quoted: message }); return; }
        const field = (args[2] || '').toLowerCase();
        const val = parseInt(args[3] || '', 10);
        if (!['questions','attempts','seconds'].includes(field) || !Number.isFinite(val) || val <= 0) {
          await sock.sendMessage(chatId, { text: 'Usage: .bible quiz config <questions|attempts|seconds> <number>' }, { quoted: message });
          return;
        }
        const saved = await setBibleQuizConfig(chatId, { [field]: val });
        await sock.sendMessage(chatId, { text: `Set ${field} = ${saved[field]} for this group.` }, { quoted: message });
        return;
      }

      // Reset leaderboard
      if (mode === 'resetlb') {
        const scope = (args[2] || 'group').toLowerCase();
        if (scope === 'global') {
          const sudo = await isSudo(sender);
          if (!sudo && !message.key.fromMe) { await sock.sendMessage(chatId, { text: 'Only bot owner/sudo can reset global leaderboard.' }, { quoted: message }); return; }
          await resetBibleQuizLeaderboard('global');
          await sock.sendMessage(chatId, { text: 'Global leaderboard reset.' }, { quoted: message });
          return;
        }
        // group
        if (!isGroup) { await sock.sendMessage(chatId, { text: 'Group leaderboard reset only works in groups.' }, { quoted: message }); return; }
        const admin = await isAdmin(sock, chatId, sender);
        if (!admin.isSenderAdmin && !message.key.fromMe) { await sock.sendMessage(chatId, { text: 'Only group admins can reset group leaderboard.' }, { quoted: message }); return; }
        await resetBibleQuizLeaderboard('group', chatId);
        await sock.sendMessage(chatId, { text: 'Group leaderboard reset.' }, { quoted: message });
        return;
      }

      // Before starting any game mode in groups, check if enabled
      if (isGroup) {
        const enabled = await isBibleQuizEnabled(chatId);
        if (!enabled) { await sock.sendMessage(chatId, { text: 'Bible quiz is disabled in this group.' }, { quoted: message }); return; }
      }
      if (mode === 'stop') {
        const sess = games.quiz.get(chatId);
        if (sess && sess.mode === 'personal') {
          games.quiz.delete(chatId);
          await sock.sendMessage(chatId, { text: '🛑 Stopped the current quiz.' }, { quoted: message });
        } else {
          await sock.sendMessage(chatId, { text: 'No active personal quiz to stop.' }, { quoted: message });
        }
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
      const cfg = (await getBibleQuizConfig(chatId)) || {};
      const personalTotal = (!isNaN(numQ) && numQ > 0 && numQ <= 50)
        ? numQ
        : (!isNaN(parseInt(mode, 10)) ? parseInt(mode, 10) : (cfg.questions || PERSONAL_DEFAULT_QUESTIONS));

      games.quiz.set(chatId, {
        mode: 'personal',
        host: sender,
        total: personalTotal,
        asked: 0,
        score: 0,
        current: null,
        attemptsLeft: cfg.attempts || PERSONAL_ATTEMPTS_PER_QUESTION,
        attemptsPerQuestion: cfg.attempts || PERSONAL_ATTEMPTS_PER_QUESTION,
        usedHint: false,
        timer: null,
        secondsPerQuestion: cfg.seconds || PERSONAL_SECONDS_PER_QUESTION,
        correctCount: 0
      });
      await sock.sendMessage(chatId, { text: `🧠 Bible Quiz — Solo Mode\nQuestions: ${personalTotal}\nReply with A-D or 1-4. Type HINT, SKIP, or STOP.` }, { quoted: message });
      await askNextPersonal(sock, chatId);
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
  // Personal quiz flow (answers + controls)
  if (games.quiz.has(chatId)) {
    const session = games.quiz.get(chatId);
    if (session && session.mode === 'personal') {
      const lower = body.toLowerCase();
      if (lower === 'stop') {
        clearPersonalTimer(session);
        games.quiz.delete(chatId);
        await sock.sendMessage(chatId, { text: '🛑 Stopped the current quiz.' }, { quoted: message });
        return;
      }
      if (lower === 'hint') {
        if (session.usedHint) {
          await sock.sendMessage(chatId, { text: 'You already used a hint for this question.' }, { quoted: message });
          return;
        }
        if (!session.current) return;
        session.usedHint = true;
        games.quiz.set(chatId, session);
        const firstLetter = session.current.correctText?.charAt(0) || '?';
        await sock.sendMessage(chatId, { text: `🔍 Hint: Answer starts with "${firstLetter}"${session.current.reference ? ` (${session.current.reference})` : ''}` }, { quoted: message });
        return;
      }
      if (lower === 'skip') {
        if (!session.current) return;
        clearPersonalTimer(session);
        await sock.sendMessage(chatId, { text: `⏭️ Skipped. Correct answer: ${session.current.correctText}${session.current.reference ? ` (${session.current.reference})` : ''}` }, { quoted: message });
        await askNextPersonal(sock, chatId);
        return;
      }

      // Treat as an answer
      if (!session.current) return;
      const idx = parseChoiceAnswer(body, session.current.choices.length);
      const answeredIndex = (idx !== null) ? idx : null;
      const isCorrect = answeredIndex !== null
        ? answeredIndex === session.current.correctIndex
        : normalizeAnswer(body) === session.current.correctNormalized;

      if (isCorrect) {
        clearPersonalTimer(session);
        const basePoints = session.attemptsLeft === PERSONAL_ATTEMPTS_PER_QUESTION ? 10 : 5;
        const penalty = session.usedHint ? 3 : 0;
        const gained = Math.max(0, basePoints - penalty);
        session.score = (session.score || 0) + gained;
        session.correctCount = (session.correctCount || 0) + 1;
        await sock.sendMessage(chatId, { text: `✅ Correct! (+${gained})` }, { quoted: message });
        games.quiz.set(chatId, session);
        await askNextPersonal(sock, chatId);
      } else {
        session.attemptsLeft = (session.attemptsLeft || 1) - 1;
        games.quiz.set(chatId, session);
        if (session.attemptsLeft > 0) {
          await sock.sendMessage(chatId, { text: `❌ Incorrect. Attempts left: ${session.attemptsLeft}` }, { quoted: message });
        } else {
          clearPersonalTimer(session);
          await sock.sendMessage(chatId, { text: `❌ Incorrect. Correct answer: ${session.current.correctText}${session.current.reference ? ` (${session.current.reference})` : ''}` }, { quoted: message });
          await askNextPersonal(sock, chatId);
        }
      }
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