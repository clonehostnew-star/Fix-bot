module.exports = async function responsoryCommand(sock, chatId, message, args) {
  const sub = (args[0] || '').toLowerCase();
  if (sub === 'script' || !sub) {
    await sock.sendMessage(chatId, { text: 'Repository: https://github.com/clonehostnew-star/Wabot' }, { quoted: message });
    return;
  }
  await sock.sendMessage(chatId, { text: 'Usage: .responsory script' }, { quoted: message });
}