module.exports = async function calculateCommand(sock, chatId, message, args) {
  const expr = (args || []).join(' ').trim();
  if (!expr) {
    return sock.sendMessage(chatId, { text: 'Usage: .calculate <expression>\nExample: .calculate (2+3)*4 - 5/2' }, { quoted: message });
  }
  // Whitelist characters to avoid code injection
  if (!/^[0-9+\-*/().,%\s^]+$/.test(expr)) {
    return sock.sendMessage(chatId, { text: '❌ Invalid characters in expression.' }, { quoted: message });
  }
  try {
    // Implement a safe minimal evaluator: convert ^ to **, % modulo, and evaluate with Function
    const safe = expr.replace(/\^/g, '**');
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${safe});`)();
    if (typeof result === 'number' && isFinite(result)) {
      await sock.sendMessage(chatId, { text: `= ${result}` }, { quoted: message });
    } else {
      await sock.sendMessage(chatId, { text: '❌ Could not compute a numeric result.' }, { quoted: message });
    }
  } catch (e) {
    await sock.sendMessage(chatId, { text: '❌ Error evaluating expression.' }, { quoted: message });
  }
}

