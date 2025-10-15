const { getUser, saveUser, addCoins } = require('../lib/economyStore');

module.exports = async function economyCommand(sock, chatId, message, args) {
  const sub = (args[0] || '').toLowerCase();
  const userId = message.key.participant || message.key.remoteJid;

  function money(n) { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n); } catch { return `$${n}`; } }

  const user = await getUser(userId);

  switch (sub) {
    case 'shop': {
      const items = [
        { id:'boost', name:'XP/Income Boost (24h)', price: 5000 },
        { id:'lucky', name:'Lucky Charm (better odds for 24h)', price: 8000 },
        { id:'vault', name:'Vault Upgrade (+$5,000 bank cap)', price: 10000 },
      ];
      const lines = items.map(i=>`• ${i.name} — $${i.price} (buy: .eco buy ${i.id})`).join('\n');
      await sock.sendMessage(chatId,{ text:`🛒 Shop\n${lines}` },{ quoted: message });
      break;
    }
    case 'buy': {
      const item = (args[1]||'').toLowerCase();
      if (!item) return await sock.sendMessage(chatId,{ text:'Usage: .eco buy <item-id>. See .eco shop' },{ quoted: message });
      const catalog = { boost:5000, lucky:8000, vault:10000 };
      if (!(item in catalog)) return await sock.sendMessage(chatId,{ text:'❌ Unknown item.' },{ quoted: message });
      const price = catalog[item];
      if ((user.wallet||0) < price) return await sock.sendMessage(chatId,{ text:'❌ Not enough wallet.' },{ quoted: message });
      user.wallet -= price; user.inventory = user.inventory || []; user.inventory.push(item);
      if (item==='boost' || item==='lucky') user.boostExpiresAt = new Date(Date.now()+24*60*60*1000);
      await saveUser(user);
      await sock.sendMessage(chatId,{ text:`✅ Purchased ${item}.` },{ quoted: message });
      break;
    }
    case 'inv':
    case 'inventory': {
      const inv = user.inventory || [];
      await sock.sendMessage(chatId,{ text:`🎒 Inventory\n${inv.length? inv.join(', ') : 'Empty'}` },{ quoted: message });
      break;
    }
    case 'auction': {
      // .eco auction <item> <start_price>
      const item = (args[1]||'').toLowerCase();
      const start = parseInt(args[2]);
      if (!item || isNaN(start) || start<=0) return await sock.sendMessage(chatId,{ text:'Usage: .eco auction <item> <start_price>' },{ quoted: message });
      if (!user.inventory || !user.inventory.includes(item)) return await sock.sendMessage(chatId,{ text:'❌ You do not own this item.' },{ quoted: message });
      if (!global.auctions) global.auctions = new Map();
      if (global.auctions.has(chatId)) return await sock.sendMessage(chatId,{ text:'An auction is already running here.' },{ quoted: message });
      global.auctions.set(chatId,{ item, owner:userId, highestBid:start, highestBidder:null, ends: Date.now()+60000 });
      await sock.sendMessage(chatId,{ text:`🏦 Auction started for ${item}. Starting at $${start}. Place bids with .eco bid <amount>. Ends in 60s.` },{ quoted: message });
      setTimeout(async ()=>{
        const a = global.auctions.get(chatId); if (!a) return;
        if (!a.highestBidder) {
          await sock.sendMessage(chatId,{ text:'Auction ended with no bids.' });
        } else {
          // transfer item and funds
          const winner = await getUser(a.highestBidder);
          if ((winner.wallet||0) >= a.highestBid) {
            winner.wallet -= a.highestBid; user.wallet = (user.wallet||0) + a.highestBid;
            // move item
            winner.inventory = winner.inventory || []; winner.inventory.push(a.item);
            user.inventory = (user.inventory||[]).filter(x=>x!==a.item);
            await saveUser(winner); await saveUser(user);
            await sock.sendMessage(chatId,{ text:`🏁 Auction won by @${a.highestBidder.split('@')[0]} for $${a.highestBid}`, mentions:[a.highestBidder] });
          } else {
            await sock.sendMessage(chatId,{ text:`❌ Winner had insufficient funds. Auction void.` });
          }
        }
        global.auctions.delete(chatId);
      }, 60000);
      break;
    }
    case 'bid': {
      const amt = parseInt(args[1]);
      if (isNaN(amt) || amt<=0) return await sock.sendMessage(chatId,{ text:'Usage: .eco bid <amount>' },{ quoted: message });
      if (!global.auctions || !global.auctions.get(chatId)) return await sock.sendMessage(chatId,{ text:'No active auction here.' },{ quoted: message });
      const a = global.auctions.get(chatId);
      if (a.ends < Date.now()) return await sock.sendMessage(chatId,{ text:'Auction already ended.' },{ quoted: message });
      if (amt <= a.highestBid) return await sock.sendMessage(chatId,{ text:`Bid must be > $${a.highestBid}.` },{ quoted: message });
      const bidder = await getUser(userId);
      if ((bidder.wallet||0) < amt) return await sock.sendMessage(chatId,{ text:'❌ Insufficient wallet for this bid.' },{ quoted: message });
      a.highestBid = amt; a.highestBidder = userId; global.auctions.set(chatId,a);
      await sock.sendMessage(chatId,{ text:`✅ Highest bid updated: $${amt} by @${userId.split('@')[0]}`, mentions:[userId] },{ quoted: message });
      break;
    }
    case 'blackjack': {
      const bet = parseInt(args[1]);
      if (isNaN(bet) || bet<=0) return await sock.sendMessage(chatId,{ text:'Usage: .eco blackjack <bet>' },{ quoted: message });
      if ((user.wallet||0) < bet) return await sock.sendMessage(chatId,{ text:'❌ Not enough wallet.' },{ quoted: message });
      // Simple one-round blackjack simulation: player vs dealer, hit/stand auto strategy (hit < 17)
      const deck = [];
      const ranks = [2,3,4,5,6,7,8,9,10,'J','Q','A'];
      for (let i=0;i<4;i++) for (const r of ranks) deck.push(r);
      function draw() { const i = Math.floor(Math.random()*deck.length); return deck.splice(i,1)[0]; }
      function val(hand){ let total=0, aces=0; for(const c of hand){ if(c==='J'||c==='Q') total+=10; else if(c==='A'){ aces++; total+=11; } else total+=c; } while(total>21 && aces>0){ total-=10; aces--; } return total; }
      const player=[draw(),draw()], dealer=[draw(),draw()];
      while(val(player)<17) player.push(draw());
      while(val(dealer)<17) dealer.push(draw());
      const pv=val(player), dv=val(dealer);
      let delta=0, result;
      if (pv>21) { delta = -bet; result='💥 You busted!'; }
      else if (dv>21) { delta = bet; result='🎉 Dealer busted!'; }
      else if (pv>dv) { delta = bet; result='🎉 You win!'; }
      else if (pv<dv) { delta = -bet; result='💔 You lose!'; }
      else { delta = 0; result='🤝 Push.'; }
      user.wallet = (user.wallet||0) + delta;
      await saveUser(user);
      await sock.sendMessage(chatId,{ text:`🃏 Blackjack\nYou: ${player.join(', ')} (${pv})\nDealer: ${dealer.join(', ')} (${dv})\n${result} ${delta>=0?'+':'-'}$${Math.abs(delta)}` },{ quoted: message });
      break;
    }
    case 'roulette': {
      // .eco roulette <bet> <red|black|odd|even|number>
      const bet = parseInt(args[1]);
      const pick = (args[2]||'').toLowerCase();
      if (isNaN(bet) || bet<=0 || !pick) return await sock.sendMessage(chatId,{ text:'Usage: .eco roulette <bet> <red|black|odd|even|0-36>' },{ quoted: message });
      if ((user.wallet||0) < bet) return await sock.sendMessage(chatId,{ text:'❌ Not enough wallet.' },{ quoted: message });
      const spin = Math.floor(Math.random()*37); // 0..36
      const redNums = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
      let delta = -bet; let winText='';
      if (['red','black','odd','even'].includes(pick)) {
        const isWin = (pick==='red'&&redNums.has(spin)) || (pick==='black'&&spin!==0&&!redNums.has(spin)) || (pick==='odd'&&spin%2===1) || (pick==='even'&&spin!==0&&spin%2===0);
        if (isWin) { delta = Math.floor(bet * 1.9) - bet; winText = '1:1'; }
      } else {
        const n = parseInt(pick); if (!isNaN(n) && n>=0 && n<=36 && n===spin) { delta = bet*35; winText = '35:1'; }
      }
      user.wallet = (user.wallet||0) + delta;
      await saveUser(user);
      await sock.sendMessage(chatId,{ text:`🎡 Roulette\nSpin: ${spin}\n${delta>0?`🎉 You won ${money(delta)} (${winText})`:`💔 You lost ${money(-delta)}`}` },{ quoted: message });
      break;
    }
    case 'balance':
    case 'bal': {
      const net = (user.wallet || 0) + (user.bank || 0) - (user.loans || 0);
      await sock.sendMessage(chatId, { text: `💰 Balance\n\n👛 Wallet: ${money(user.wallet||0)}\n🏦 Bank: ${money(user.bank||0)}\n📊 Net Worth: ${money(net)}` }, { quoted: message });
      break;
    }
    case 'daily': {
      const now = Date.now();
      const last = user.lastDaily ? new Date(user.lastDaily).getTime() : 0;
      const DAY = 24*60*60*1000;
      if (now - last < DAY) {
        const hrs = Math.max(0, 24 - Math.floor((now - last)/ (60*60*1000)));
        await sock.sendMessage(chatId, { text: `⏳ Wait ${hrs}h to claim again.` }, { quoted: message });
        break;
      }
      // Streak handling
      const yesterday = last ? last + DAY : 0;
      const withinStreak = yesterday && Math.abs(now - yesterday) < (8*60*60*1000); // 8h grace
      user.dailyStreak = withinStreak ? (user.dailyStreak||0)+1 : 1;
      user.bestDailyStreak = Math.max(user.bestDailyStreak||0, user.dailyStreak);
      let base = 1000;
      const bonus = Math.min(5000, 100 * (user.dailyStreak - 1)); // +100 per streak day, cap 5k
      const total = base + bonus;
      user.wallet = (user.wallet||0) + total;
      user.lastDaily = new Date();
      // Achievements
      user.achievements = user.achievements || {};
      if (user.dailyStreak>=3) user.achievements.streak3 = true;
      if (user.dailyStreak>=7) user.achievements.streak7 = true;
      await saveUser(user);
      await sock.sendMessage(chatId, { text: `✅ Claimed daily: ${money(total)} (streak ${user.dailyStreak}🔥)` }, { quoted: message });
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
      // Anti-abuse: max bet 50% of wallet
      const maxBet = Math.max(100, Math.floor((user.wallet||0) * 0.5));
      if (bet > maxBet) return await sock.sendMessage(chatId,{ text:`⚠️ Max allowable bet right now is ${money(maxBet)}.` },{ quoted: message });
      user.wallet = (user.wallet||0) + (win ? bet : -bet);
      // gambler achievement
      user.achievements = user.achievements || {}; if (win) user.achievements.gambler = (user.achievements.gambler||0)+1;
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
      // Risk tiers: .eco invest <amount> [low|mid|high]
      const tier = (args[2]||'mid').toLowerCase();
      const outcome = Math.random();
      let delta = 0;
      if (tier==='low') {
        if (outcome < 0.55) delta = Math.floor(amt * (Math.random()*0.2 + 0.05)); // +5..+25%
        else if (outcome < 0.95) delta = -Math.floor(amt * (Math.random()*0.2 + 0.02)); // -2..-22%
        else delta = 0;
      } else if (tier==='high') {
        if (outcome < 0.35) delta = Math.floor(amt * (Math.random()*1.2 + 0.3)); // +30..+150%
        else if (outcome < 0.9) delta = -Math.floor(amt * (Math.random()*0.8 + 0.2)); // -20..-100%
        else delta = 0;
      } else { // mid
        if (outcome < 0.45) delta = Math.floor(amt * (Math.random()*0.6 + 0.2)); // +20..+80%
        else if (outcome < 0.85) delta = -Math.floor(amt * (Math.random()*0.6 + 0.2)); // -20..-80%
        else delta = 0;
      }
      user.wallet = (user.wallet||0) + delta;
      await saveUser(user);
      await sock.sendMessage(chatId,{ text:`📈 Investment (${tier}) result: ${delta>=0?'Profit':'Loss'} ${money(Math.abs(delta))}.` },{ quoted: message });
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
    case 'achievements': {
      const a = user.achievements || {};
      const list = [
        `🔥 Streak 3: ${a.streak3?'✅':'❌'}`,
        `🔥 Streak 7: ${a.streak7?'✅':'❌'}`,
        `🎲 Gambler wins: ${a.gambler||0}`,
      ].join('\n');
      await sock.sendMessage(chatId,{ text:`🏅 Achievements\n${list}` },{ quoted: message });
      break;
    }
    case 'interest': {
      // Admin/owner could expose; here any user can trigger their own accrual with 24h cooldown
      const now = Date.now();
      const last = user.lastInterestAt ? new Date(user.lastInterestAt).getTime() : 0;
      const DAY = 24*60*60*1000;
      if (now - last < DAY) { const hrs = Math.ceil((DAY - (now-last))/ (60*60*1000)); return await sock.sendMessage(chatId,{ text:`⏳ Wait ${hrs}h before next interest.`},{quoted:message}); }
      const rate = 0.01; // 1% daily
      const gained = Math.floor((user.savings||0) * rate);
      user.savings = (user.savings||0) + gained; user.lastInterestAt = new Date();
      await saveUser(user);
      await sock.sendMessage(chatId,{ text:`🏦 Savings interest accrued: ${money(gained)}. Savings: ${money(user.savings||0)}.`},{quoted:message});
      break;
    }
    case 'bankrisk': {
      // Risk event with 24h cooldown; small chance of bank fee/theft simulation
      const now = Date.now();
      const last = user.lastRiskAt ? new Date(user.lastRiskAt).getTime() : 0;
      const DAY = 24*60*60*1000;
      if (now - last < DAY) { const hrs = Math.ceil((DAY - (now-last))/ (60*60*1000)); return await sock.sendMessage(chatId,{ text:`⏳ Risk already evaluated. ${hrs}h left.`},{quoted:message}); }
      user.lastRiskAt = new Date();
      const roll = Math.random();
      let delta = 0; let msg = 'All clear. No events today.';
      if (roll < 0.05) { // bank fee 2%
        delta = -Math.floor((user.bank||0)*0.02);
        user.bank = Math.max(0,(user.bank||0)+delta);
        msg = `Bank fee applied: ${money(-delta)}.`;
      } else if (roll < 0.08) { // small theft from wallet
        delta = -Math.min(user.wallet||0, Math.floor(Math.random()*300)+100);
        user.wallet = (user.wallet||0)+delta;
        msg = `Pickpocketed: ${money(-delta)} lost from wallet.`;
      }
      await saveUser(user);
      await sock.sendMessage(chatId,{ text:`🚨 Risk report: ${msg}` },{ quoted: message });
      break;
    }
    default: {
      await sock.sendMessage(chatId, { text: `*Economy*\n\n.eco balance|bal\n.eco daily\n.eco work\n.eco dep <amt|all>\n.eco with <amt|all>\n.eco pay|give @user <amt>\n.eco rob @user\n.eco slots <bet>\n.eco cf <heads|tails> <bet>\n.eco dice <1-6> <bet>\n.eco invest <amount> [low|mid|high]\n.eco loan <amount>\n.eco repay <amount>\n.eco save <amount>\n.eco unsave <amount>\n.eco leaderboard|lb` }, { quoted: message });
    }
  }
}