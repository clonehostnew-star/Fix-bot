module.exports = async function diceCommand(sock, chatId, message, args) {
  const guess = parseInt(args[0] || '');
  const roll = Math.floor(Math.random() * 6) + 1;
  if (isNaN(guess) || guess < 1 || guess > 6) {
    return sock.sendMessage(chatId, { text: '🎲 Dice — guess a number 1-6\nUsage: .dice 1-6' }, { quoted: message });
  }
  const result = guess === roll ? '✅ Correct guess!' : '❌ Wrong guess!';
  await sock.sendMessage(chatId, { text: `🎲 Dice rolled: ${roll}\nYour guess: ${guess}\n${result}` }, { quoted: message });
}

