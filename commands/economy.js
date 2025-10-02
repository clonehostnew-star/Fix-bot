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
    case 'rob': {
      const target = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!target) return await sock.sendMessage(chatId,{ text: 'Usage: .eco rob @user' }, { quoted: message });
      if (target === userId) return await sock.sendMessage(chatId,{ text: '❌ You cannot rob yourself.' }, { quoted: message });
      const victim = await getUser(target);
      const cooldownMs = 10*60*1000; // 10 minutes
      const now = Date.now();
      const last = user.lastRob ? new Date(user.lastRob).getTime() : 0;
      if (now - last < cooldownMs) {
        const mins = Math.ceil((cooldownMs - (now-last)) / 60000);
        return await sock.sendMessage(chatId,{ text: `⏳ Wait ${mins}m before robbing again.` }, { quoted: message });
      }
      const victimWallet = victim.wallet || 0;
      if (victimWallet < 200) {
        return await sock.sendMessage(chatId,{ text: '😅 Victim is too poor to rob.' }, { quoted: message });
      }
      const success = Math.random() < 0.5;
      if (success) {
        const amount = Math.min(victimWallet, Math.floor(Math.random()*400)+100);
        victim.wallet -= amount; user.wallet = (user.wallet||0)+amount; user.lastRob = new Date();
        await saveUser(victim); await saveUser(user);
        await sock.sendMessage(chatId,{ text: `🕵️ You robbed @${target.split('@')[0]} and got ${money(amount)}!`, mentions:[target] }, { quoted: message });
      } else {
        const fine = Math.min(user.wallet||0, Math.floor(Math.random()*200)+50);
        user.wallet = Math.max(0, (user.wallet||0) - fine); user.lastRob = new Date();
        await saveUser(user);
        await sock.sendMessage(chatId,{ text: `🚓 You were caught! You paid a fine of ${money(fine)}.` }, { quoted: message });
      }
      break;
    }
    case 'leaderboard':
    case 'lb': {
      // Load all users and rank by wallet+bank
      const store = require('fs');
      const path = require('path');
      const FILE_PATH = path.join(__dirname, '..', 'data', 'economy.json');
      let all = {};
      try { all = JSON.parse(store.readFileSync(FILE_PATH,'utf-8')); } catch {}
      const entries = Object.values(all).map(u => ({ id:u.userId, total:(u.wallet||0)+(u.bank||0) })).sort((a,b)=>b.total-a.total).slice(0,20);
      if (entries.length===0) { await sock.sendMessage(chatId,{ text: 'No leaderboard data yet.' }, { quoted: message }); break; }
      const lines = entries.map((e,i)=> `${i+1}. @${(e.id||'').split('@')[0]} — ${money(e.total)}`).join('\n');
      await sock.sendMessage(chatId,{ text: `🏆 Top 20 Richest\n\n${lines}`, mentions: entries.map(e=>e.id) }, { quoted: message });
      break;
    }
    default: {
      await sock.sendMessage(chatId, { text: `*Economy*\n\n.eco balance|bal\n.eco daily\n.eco work\n.eco dep <amt>\n.eco with <amt>\n.eco rob @user\n.eco leaderboard|lb` }, { quoted: message });
    }
  }
}