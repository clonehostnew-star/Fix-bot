module.exports = async function coinCommand(sock, chatId, message, args) {
  const guess = (args[0] || '').toLowerCase();
  if (!['heads', 'tails', 'head', 'tail'].includes(guess)) {
    return sock.sendMessage(chatId, { text: '🪙 Coin Flip — heads or tails?\nUsage: .coin heads|tails' }, { quoted: message });
  }
  const flip = Math.random() < 0.5 ? 'heads' : 'tails';
  const normalized = guess.startsWith('h') ? 'heads' : 'tails';
  const win = normalized === flip;
  await sock.sendMessage(chatId, { text: `🪙 Coin: ${flip}\nYou: ${normalized}\n${win ? '✅ You win!' : '❌ You lose!'}` }, { quoted: message });
}

