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
      if ((args[1]||'').toLowerCase()==='all') {
        const all = user.wallet||0; if (all<=0) return await sock.sendMessage(chatId,{ text:'❌ Wallet is empty.' },{ quoted: message });
        user.wallet = 0; user.bank = (user.bank||0)+all; await saveUser(user);
        await sock.sendMessage(chatId,{ text: `✅ Deposited ${money(all)}.` },{ quoted: message });
        break;
      }
      const n = parseInt(args[1]);
      if (isNaN(n) || n<=0) return await sock.sendMessage(chatId, { text: '❌ Provide amount: .eco dep <amount>|all' }, { quoted: message });
      if ((user.wallet||0) < n) return await sock.sendMessage(chatId, { text: '❌ Not enough wallet balance.' }, { quoted: message });
      user.wallet -= n; user.bank = (user.bank||0)+n; await saveUser(user);
      await sock.sendMessage(chatId, { text: `✅ Deposited ${money(n)}.` }, { quoted: message });
      break;
    }
    case 'withdraw':
    case 'with': {
      if ((args[1]||'').toLowerCase()==='all') {
        const all = user.bank||0; if (all<=0) return await sock.sendMessage(chatId,{ text:'❌ Bank is empty.' },{ quoted: message });
        user.bank = 0; user.wallet = (user.wallet||0)+all; await saveUser(user);
        await sock.sendMessage(chatId,{ text: `✅ Withdrew ${money(all)}.` },{ quoted: message });
        break;
      }
      const n = parseInt(args[1]);
      if (isNaN(n) || n<=0) return await sock.sendMessage(chatId, { text: '❌ Provide amount: .eco with <amount>|all' }, { quoted: message });
      if ((user.bank||0) < n) return await sock.sendMessage(chatId, { text: '❌ Not enough bank balance.' }, { quoted: message });
      user.bank -= n; user.wallet = (user.wallet||0)+n; await saveUser(user);
      await sock.sendMessage(chatId, { text: `✅ Withdrew ${money(n)}.` }, { quoted: message });
      break;
    }
    case 'pay':
    case 'give': {
      const target = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      const n = parseInt(args[1]);
      if (!target || isNaN(n) || n<=0) return await sock.sendMessage(chatId,{ text:'Usage: .eco pay @user <amount>' },{ quoted: message });
      if (target === userId) return await sock.sendMessage(chatId,{ text:'❌ Cannot pay yourself.' },{ quoted: message });
      if ((user.wallet||0) < n) return await sock.sendMessage(chatId,{ text:'❌ Not enough wallet.' },{ quoted: message });
      const v = await getUser(target);
      user.wallet -= n; v.wallet = (v.wallet||0)+n;
      await saveUser(user); await saveUser(v);
      await sock.sendMessage(chatId,{ text:`💸 Sent ${money(n)} to @${target.split('@')[0]}.`, mentions:[target] },{ quoted: message });
      break;
    }
    case 'slots': {
      const bet = parseInt(args[1]);
      if (isNaN(bet) || bet<=0) return await sock.sendMessage(chatId,{ text:'Usage: .eco slots <bet>' },{ quoted: message });
      if ((user.wallet||0) < bet) return await sock.sendMessage(chatId,{ text:'❌ Not enough wallet.' },{ quoted: message });
      const icons = ['🍒','🍋','🔔','⭐','7️⃣'];
      const roll = [0,0,0].map(()=> icons[Math.floor(Math.random()*icons.length)]);
      const text = roll.join(' | ');
      let delta = -bet;
      if (roll[0]===roll[1] && roll[1]===roll[2]) delta = bet*5;
      else if (roll[0]===roll[1] || roll[1]===roll[2] || roll[0]===roll[2]) delta = Math.floor(bet*1.5) - bet;
      user.wallet = (user.wallet||0) + delta;
      await saveUser(user);
      const outcome = delta>=0 ? `🎉 You won ${money(delta)}!` : `💔 You lost ${money(-delta)}.`;
      await sock.sendMessage(chatId,{ text:`🎰 ${text}\n${outcome}` },{ quoted: message });
      break;
    }
    case 'coinflip':
    case 'cf': {
      const side = (args[1]||'').toLowerCase();
      const bet = parseInt(args[2]);
      if (!['heads','tails'].includes(side) || isNaN(bet) || bet<=0) return await sock.sendMessage(chatId,{ text:'Usage: .eco cf <heads|tails> <bet>' },{ quoted: message });
      if ((user.wallet||0) < bet) return await sock.sendMessage(chatId,{ text:'❌ Not enough wallet.' },{ quoted: message });
      const flip = Math.random()<0.5 ? 'heads' : 'tails';
      const win = flip===side;
      user.wallet = (user.wallet||0) + (win ? bet : -bet);
      await saveUser(user);
      await sock.sendMessage(chatId,{ text:`🪙 Flip: *${flip.toUpperCase()}*\n${win?'🎉 You won ': '💔 You lost '}${money(bet)}.` },{ quoted: message });
      break;
    }
    case 'dice': {
      const guess = parseInt(args[1]);
      const bet = parseInt(args[2]);
      if (isNaN(guess) || guess<1 || guess>6 || isNaN(bet) || bet<=0) return await sock.sendMessage(chatId,{ text:'Usage: .eco dice <1-6> <bet>' },{ quoted: message });
      if ((user.wallet||0) < bet) return await sock.sendMessage(chatId,{ text:'❌ Not enough wallet.' },{ quoted: message });
      const roll = Math.floor(Math.random()*6)+1;
      const win = roll===guess;
      user.wallet = (user.wallet||0) + (win ? bet*5 : -bet);
      await saveUser(user);
      await sock.sendMessage(chatId,{ text:`🎲 Rolled: *${roll}*\n${win? '🎉 You won '+money(bet*5) : '💔 You lost '+money(bet)}.` },{ quoted: message });
      break;
    }
    case 'invest': {
      const amt = parseInt(args[1]);
      if (isNaN(amt) || amt<=0) return await sock.sendMessage(chatId,{ text:'Usage: .eco invest <amount>' },{ quoted: message });
      if ((user.wallet||0) < amt) return await sock.sendMessage(chatId,{ text:'❌ Not enough wallet.' },{ quoted: message });
      const outcome = Math.random();
      let delta = 0;
      if (outcome < 0.45) delta = Math.floor(amt * (Math.random()*0.6 + 0.2)); // +20%..+80%
      else if (outcome < 0.85) delta = -Math.floor(amt * (Math.random()*0.6 + 0.2)); // -20%..-80%
      else delta = 0;
      user.wallet = (user.wallet||0) + delta;
      await saveUser(user);
      await sock.sendMessage(chatId,{ text:`📈 Investment result: ${delta>=0?'Profit':'Loss'} ${money(Math.abs(delta))}.` },{ quoted: message });
      break;
    }
    case 'loan': {
      const amt = parseInt(args[1]);
      if (isNaN(amt) || amt<=0) return await sock.sendMessage(chatId,{ text:'Usage: .eco loan <amount>' },{ quoted: message });
      const maxLoan = 5000;
      if (amt > maxLoan) return await sock.sendMessage(chatId,{ text:`❌ Max loan is ${money(maxLoan)}.` },{ quoted: message });
      user.wallet = (user.wallet||0) + amt;
      user.loans = (user.loans||0) + Math.floor(amt*1.1); // 10% interest
      await saveUser(user);
      await sock.sendMessage(chatId,{ text:`🏦 Loan approved: ${money(amt)}. Total to repay: ${money(user.loans)}.` },{ quoted: message });
      break;
    }
    case 'repay': {
      const amt = parseInt(args[1]);
      if (isNaN(amt) || amt<=0) return await sock.sendMessage(chatId,{ text:'Usage: .eco repay <amount>' },{ quoted: message });
      if ((user.wallet||0) < amt) return await sock.sendMessage(chatId,{ text:'❌ Not enough wallet.' },{ quoted: message });
      const payAmt = Math.min(user.loans||0, amt);
      user.wallet -= payAmt; user.loans = Math.max(0,(user.loans||0)-payAmt);
      await saveUser(user);
      await sock.sendMessage(chatId,{ text:`✅ Repaid ${money(payAmt)}. Remaining loan: ${money(user.loans||0)}.` },{ quoted: message });
      break;
    }
    case 'save': {
      const amt = parseInt(args[1]);
      if (isNaN(amt) || amt<=0) return await sock.sendMessage(chatId,{ text:'Usage: .eco save <amount>' },{ quoted: message });
      if ((user.wallet||0) < amt) return await sock.sendMessage(chatId,{ text:'❌ Not enough wallet.' },{ quoted: message });
      user.wallet -= amt; user.savings = (user.savings||0)+amt;
      await saveUser(user);
      await sock.sendMessage(chatId,{ text:`💾 Saved ${money(amt)}. Savings: ${money(user.savings||0)}.` },{ quoted: message });
      break;
    }
    case 'unsave': {
      const amt = parseInt(args[1]);
      if (isNaN(amt) || amt<=0) return await sock.sendMessage(chatId,{ text:'Usage: .eco unsave <amount>' },{ quoted: message });
      if ((user.savings||0) < amt) return await sock.sendMessage(chatId,{ text:'❌ Not enough savings.' },{ quoted: message });
      user.savings -= amt; user.wallet = (user.wallet||0)+amt;
      await saveUser(user);
      await sock.sendMessage(chatId,{ text:`💾 Withdrawn ${money(amt)} from savings. Savings: ${money(user.savings||0)}.` },{ quoted: message });
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
      await sock.sendMessage(chatId, { text: `*Economy*\n\n.eco balance|bal\n.eco daily\n.eco work\n.eco dep <amt|all>\n.eco with <amt|all>\n.eco pay|give @user <amt>\n.eco rob @user\n.eco slots <bet>\n.eco cf <heads|tails> <bet>\n.eco dice <1-6> <bet>\n.eco invest <amount>\n.eco loan <amount>\n.eco repay <amount>\n.eco save <amount>\n.eco unsave <amount>\n.eco leaderboard|lb` }, { quoted: message });
    }
  }
}