const { getUser, saveUser, addCoins } = require('../lib/economyStore');

module.exports = async function economyCommand(sock, chatId, message, args) {
  const sub = (args[0] || '').toLowerCase();
  const userId = message.key.participant || message.key.remoteJid;

  function money(n) { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n); } catch { return `$${n}`; } }

  const user = await getUser(userId);

  switch (sub) {
    case 'balance':
    case 'bal': {
      const net = (user.wallet || 0) + (user.bank || 0) - (user.loans || 0);
      await sock.sendMessage(chatId, { text: `💰 Balance\n\n👛 Wallet: ${money(user.wallet||0)}\n🏦 Bank: ${money(user.bank||0)}\n📊 Net Worth: ${money(net)}` }, { quoted: message });
      break;
    }
    case 'daily': {
      const now = Date.now();
      const last = user.lastDaily ? new Date(user.lastDaily).getTime() : 0;
      if (now - last < 24*60*60*1000) {
        const hrs = 24 - Math.floor((now - last)/ (60*60*1000));
        await sock.sendMessage(chatId, { text: `⏳ Wait ${hrs}h to claim again.` }, { quoted: message });
        break;
      }
      user.wallet = (user.wallet||0) + 1000;
      user.lastDaily = new Date();
      await saveUser(user);
      await sock.sendMessage(chatId, { text: `✅ Claimed daily: ${money(1000)}` }, { quoted: message });
      break;
    }
    case 'work': {
      const now = Date.now();
      const last = user.lastWork ? new Date(user.lastWork).getTime() : 0;
      if (now - last < 30*60*1000) {
        const mins = 30 - Math.floor((now - last)/ (60*1000));
        await sock.sendMessage(chatId, { text: `⏳ Wait ${mins}m before working again.` }, { quoted: message });
        break;
      }
      const amt = Math.floor(Math.random()*400)+100;
      user.wallet = (user.wallet||0) + amt;
      user.lastWork = new Date();
      await saveUser(user);
      await sock.sendMessage(chatId, { text: `💼 You worked and earned ${money(amt)}.` }, { quoted: message });
      break;
    }
    case 'deposit':
    case 'dep': {
      const n = parseInt(args[1]);
      if (isNaN(n) || n<=0) return await sock.sendMessage(chatId, { text: '❌ Provide amount: .eco dep <amount>' }, { quoted: message });
      if ((user.wallet||0) < n) return await sock.sendMessage(chatId, { text: '❌ Not enough wallet balance.' }, { quoted: message });
      user.wallet -= n; user.bank = (user.bank||0)+n; await saveUser(user);
      await sock.sendMessage(chatId, { text: `✅ Deposited ${money(n)}.` }, { quoted: message });
      break;
    }
    case 'withdraw':
    case 'with': {
      const n = parseInt(args[1]);
      if (isNaN(n) || n<=0) return await sock.sendMessage(chatId, { text: '❌ Provide amount: .eco with <amount>' }, { quoted: message });
      if ((user.bank||0) < n) return await sock.sendMessage(chatId, { text: '❌ Not enough bank balance.' }, { quoted: message });
      user.bank -= n; user.wallet = (user.wallet||0)+n; await saveUser(user);
      await sock.sendMessage(chatId, { text: `✅ Withdrew ${money(n)}.` }, { quoted: message });
      break;
    }
    default: {
      await sock.sendMessage(chatId, { text: `*Economy*\n\n.eco balance|bal\n.eco daily\n.eco work\n.eco dep <amt>\n.eco with <amt>` }, { quoted: message });
    }
  }
}