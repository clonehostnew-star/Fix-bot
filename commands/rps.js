module.exports = async function rpsCommand(sock, chatId, message, args) {
  const choice = (args[0] || '').toLowerCase();
  const valid = ['rock', 'paper', 'scissors'];
  if (!valid.includes(choice)) {
    return sock.sendMessage(chatId, { text: '🎮 RPS — rock, paper, or scissors?\nUsage: .rps rock|paper|scissors' }, { quoted: message });
  }
  const bot = valid[Math.floor(Math.random() * valid.length)];
  let result = '';
  if (choice === bot) result = 'It\'s a draw!';
  else if (
    (choice === 'rock' && bot === 'scissors') ||
    (choice === 'paper' && bot === 'rock') ||
    (choice === 'scissors' && bot === 'paper')
  ) result = 'You win!';
  else result = 'You lose!';
  await sock.sendMessage(chatId, { text: `🪨📄✂️ Rock-Paper-Scissors\nYou: ${choice}\nBot: ${bot}\n\n${result}` }, { quoted: message });
}

