const settings = require("../settings");
const { getStatus } = require("../lib/systemState");
async function aliveCommand(sock, chatId, message) {
    try {
        const s = getStatus();
        const chargeLine = s.charging ? `⚡ Charging — ${s.level}%${s.etaMinutes !== null ? ` (full in ~${s.etaMinutes}m)` : ''}` : `🔋 Battery — ${s.level}% (${s.label})`;
        const message1 = `🟢 WA BOT TREE — I’m online and ready!\n\n` +
                       `• Version: ${settings.version}\n` +
                       `• Mode: ${settings.commandMode?.toUpperCase() || 'PUBLIC'}\n` +
                       `• ${chargeLine}\n\n` +
                       `✨ Highlights:\n` +
                       `- Powerful group moderation (antilink, admin tools)\n` +
                       `- Fun utilities (stickers, memes, games)\n` +
                       `- Media tools (IG/FB/TikTok/YT)\n\n` +
                       `📜 Type *.menu* to see all commands.\n` +
                       `📣 Updates: https://whatsapp.com/channel/0029Val3Ewv6xCSGCE9fZD0H`;
        await sock.sendMessage(chatId, {
            text: message1,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '0029Val3Ewv6xCSGCE9fZD0H@newsletter',
                    newsletterName: 'WA BOT TREE',
                    serverMessageId: -1
                }
            }
        }, { quoted: message });
    } catch (error) {
        console.error('Error in alive command:', error);
        await sock.sendMessage(chatId, { text: 'Bot is alive and running!' }, { quoted: message });
    }
}

module.exports = aliveCommand;