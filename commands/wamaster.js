const settings = require('../settings');
const { toggleAntiLag, toggleAntiBug, setContactOnly, toggleOptimize, blockCode, unblockCode, statusSummary, setForeign, clearCodes, getSettings } = require('../lib/wamaster');

module.exports = async function waMasterCommand(sock, chatId, message, args) {
  const sub = (args[0] || '').toLowerCase();
  const sender = message.key.participant || message.key.remoteJid;
  const ownerJid = settings.botOwner + '@s.whatsapp.net';
  const isOwner = sender === ownerJid;

  const ownerOnly = ['antilag','antibug','contactonly','optimize','blockcode','unblockcode','foreign','clearcodes','whitelist','unwhitelist'];
  if (ownerOnly.includes(sub) && !isOwner) {
    return await sock.sendMessage(chatId, { text: '❌ This command can only be used by the bot owner.' });
  }

  try {
    switch (sub) {
      case 'antilag':
        toggleAntiLag();
        await sock.sendMessage(chatId, { text: '🛡️ Anti-lag toggled.' });
        break;
      case 'antibug':
        toggleAntiBug();
        await sock.sendMessage(chatId, { text: '🛡️ Anti-bug toggled.' });
        break;
      case 'contactonly':
        {
          const mode = (args[1] || '').toLowerCase();
          if (!['off','immediate','delayed'].includes(mode)) {
            await sock.sendMessage(chatId, { text: 'Usage: .wamaster contactonly off|immediate|delayed' });
            break;
          }
          setContactOnly(mode);
          await sock.sendMessage(chatId, { text: `👥 Contact-only set to ${mode}.` });
        }
        break;
      case 'optimize':
        toggleOptimize();
        await sock.sendMessage(chatId, { text: '⚙️ Optimization toggled.' });
        break;
      case 'blockcode':
        if (!args[1]) return await sock.sendMessage(chatId, { text: 'Usage: .wamaster blockcode <code>' });
        blockCode(args[1]);
        await sock.sendMessage(chatId, { text: `🚫 Blocked country code ${args[1]}` });
        break;
      case 'unblockcode':
        if (!args[1]) return await sock.sendMessage(chatId, { text: 'Usage: .wamaster unblockcode <code>' });
        unblockCode(args[1]);
        await sock.sendMessage(chatId, { text: `✅ Unblocked country code ${args[1]}` });
        break;
      case 'foreign':
        {
          const mode = (args[1] || '').toLowerCase();
          if (!['on','off'].includes(mode)) return await sock.sendMessage(chatId, { text: 'Usage: .wamaster foreign on|off' });
          setForeign(mode === 'on');
          await sock.sendMessage(chatId, { text: `🌍 Foreign filter ${mode}.` });
        }
        break;
      case 'listcodes':
        {
          const s = getSettings();
          await sock.sendMessage(chatId, { text: `Blocked country codes: ${s.blockedCodes.join(', ') || 'None'}` });
        }
        break;
      case 'clearcodes':
        clearCodes();
        await sock.sendMessage(chatId, { text: '✅ Cleared all blocked country codes.' });
        break;
      case 'status':
        {
          const s = statusSummary();
          await sock.sendMessage(chatId, { text: `*WhatsApp Master Status* 🛡️\n\nAnti-Lag: ${s.antiLag ? '✅' : '❌'}\nAnti-Bug: ${s.antiBug ? '✅' : '❌'}\nContact-Only: ${s.contactOnly}\nOptimization: ${s.optimizationEnabled ? '✅' : '❌'}\nBlocked Codes: ${s.blockedCodes.join(', ') || 'None'}\nGroups spamming: ${s.groupsSpamming.length}\nLag: ${s.lagMs}ms\nRunning slow: ${s.runningSlow ? '⚠️ Yes' : '✅ No'}\nProne to ban: ${s.proneToBan ? '⚠️ Yes' : '✅ No'}` });
        }
        break;
      case 'whitelist':
        {
          const id = chatId;
          const { runtime } = require('../lib/wamaster');
          runtime.groupWhitelist.add(id);
          await sock.sendMessage(chatId, { text: '✅ This group is whitelisted from protections.' });
        }
        break;
      case 'unwhitelist':
        {
          const id = chatId;
          const { runtime } = require('../lib/wamaster');
          runtime.groupWhitelist.delete(id);
          await sock.sendMessage(chatId, { text: '✅ This group is removed from whitelist.' });
        }
        break;
      default:
        await sock.sendMessage(chatId, { text: `*WhatsApp Master*\n\n.wamaster antilag\n.wamaster antibug\n.wamaster contactonly off|immediate|delayed\n.wamaster optimize\n.wamaster blockcode <code>\n.wamaster unblockcode <code>\n.wamaster listcodes\n.wamaster clearcodes\n.wamaster foreign on|off\n.wamaster whitelist\n.wamaster unwhitelist\n.wamaster status` });
    }
  } catch (error) {
    console.error('Error in waMasterCommand:', error);
    await sock.sendMessage(chatId, { text: '❌ An error occurred while processing your message.' });
  }
}