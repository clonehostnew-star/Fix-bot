
const settings = require('../settings');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Function to get formatted uptime
function getUptime() {
    const uptime = process.uptime();
    const days = Math.floor(uptime / (3600 * 24));
    const hours = Math.floor((uptime % (3600 * 24)) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

// Function to get current time in AM/PM format
function getCurrentTime() {
    const now = new Date();
    let hours = now.getHours();
    let minutes = now.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    minutes = minutes < 10 ? '0' + minutes : minutes;
    return `${hours}:${minutes} ${ampm}`;
}

const commandDescriptions = {
    "add": {
        description: "Adds a new member to the group.",
        usage: ".add <phone number>",
        example: ".add 1234567890"
    },
    "kick": {
        description: "Removes a member from the group.",
        usage: ".kick @<member>",
        example: ".kick @johndoe"
    },
    "promote": {
        description: "Promotes a member to admin.",
        usage: ".promote @<member>",
        example: ".promote @johndoe"
    },
    "demote": {
        description: "Demotes an admin to a regular member.",
        usage: ".demote @<admin>",
        example: ".demote @johndoe"
    },
    "link": {
        description: "Sends the group's invite link.",
        usage: ".link"
    },
    "revoke": {
        description: "Revokes the group's invite link.",
        usage: ".revoke"
    },
    "tagall": {
        description: "Mentions all members in the group.",
        usage: ".tagall"
    },
    "announce": {
        description: "Makes an announcement to the group.",
        usage: ".announce <message>",
        example: ".announce Important meeting tomorrow at 10 AM."
    },
    "mute": {
        description: "Mutes the group chat.",
        usage: ".mute"
    },
    "unmute": {
        description: "Unmutes the group chat.",
        usage: ".unmute"
    },
    "info": {
        description: "Displays group information.",
        usage: ".info"
    },
    "icon": {
        description: "Sets the group's icon.",
        usage: "Reply to an image with .icon"
    },
    "subject": {
        description: "Changes the group's subject.",
        usage: ".subject <new subject>",
        example: ".subject Project Discussion"
    },
    "desc": {
        description: "Changes the group's description.",
        usage: ".desc <new description>",
        example: ".desc This group is for discussing the project."
    },
    "ban": {
        description: "Bans a user from the group.",
        usage: ".ban @<user>",
        example: ".ban @johndoe"
    },
    "delete": {
        description: "Deletes a message.",
        usage: "Reply to a message with .delete"
    },
    "del": {
        description: "Alias for the delete command.",
        usage: "Reply to a message with .del"
    },
    "warnings": {
        description: "Displays the warnings for a user.",
        usage: ".warnings @<user>",
        example: ".warnings @johndoe"
    },
    "warn": {
        description: "Warns a user.",
        usage: ".warn @<user>",
        example: ".warn @johndoe"
    },
    "antilink": {
        description: "Enables or disables the anti-link feature.",
        usage: ".antilink <on|off>",
        example: ".antilink on"
    },
    "antibadword": {
        description: "Enables or disables the anti-badword feature.",
        usage: ".antibadword <on|off>",
        example: ".antibadword on"
    },
    "clear": {
        description: "Clears the chat.",
        usage: ".clear"
    },
    "tag": {
        description: "Tags a specific member.",
        usage: ".tag @<member>",
        example: ".tag @johndoe"
    },
    "chatbot": {
        description: "Enables or disables the chatbot.",
        usage: ".chatbot <on|off>",
        example: ".chatbot on"
    },
    "resetlink": {
        description: "Resets the group's invite link.",
        usage: ".resetlink"
    },
    "welcome": {
        description: "Enables or disables the welcome message.",
        usage: ".welcome <on|off>",
        example: ".welcome on"
    },
    "goodbye": {
        description: "Enables or disables the goodbye message.",
        usage: ".goodbye <on|off>",
        example: ".goodbye on"
    },
    "play": {
        description: "Plays a song or video from YouTube.",
        usage: ".play <song name or YouTube link>",
        example: ".play despacito"
    },
    "song": {
        description: "Downloads a song from YouTube.",
        usage: ".song <song name or YouTube link>",
        example: ".song despacito"
    },
    "sticker": {
        description: "Creates a sticker from an image or video.",
        usage: "Reply to an image or video with .sticker"
    },
    "video": {
        description: "Downloads a video from YouTube.",
        usage: ".video <video name or YouTube link>",
        example: ".video funny cat video"
    },
    "ytmp4": {
        description: "Downloads a YouTube video in MP4 format.",
        usage: ".ytmp4 <YouTube link>",
        example: ".ytmp4 https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    },
    "instagram": {
        description: "Downloads media from Instagram.",
        usage: ".instagram <Instagram post link>",
        example: ".instagram https://www.instagram.com/p/Cq_.../"
    },
    "facebook": {
        description: "Downloads media from Facebook.",
        usage: ".facebook <Facebook post link>",
        example: ".facebook https://www.facebook.com/.../"
    },
    "tiktok": {
        description: "Downloads media from TikTok.",
        usage: ".tiktok <TikTok video link>",
        example: ".tiktok https://www.tiktok.com/@..."
    }
};

async function helpCommand(sock, chatId, message) {
    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const args = text.split(' ');
    const commandName = args[1];

    if (commandName && commandDescriptions[commandName]) {
        const command = commandDescriptions[commandName];
        let helpMessage = `*Command:* ${commandName}\n`;
        helpMessage += `*Description:* ${command.description}\n`;
        if (command.usage) {
            helpMessage += `*Usage:* ${command.usage}\n`;
        }
        if (command.example) {
            helpMessage += `*Example:* ${command.example}\n`;
        }
        await sock.sendMessage(chatId, { text: helpMessage }, { quoted: message });
        return;
    }

    const commandFiles = fs.readdirSync(__dirname).map(file => path.parse(file).name);

    const commandDetails = {
        "ECONOMY": ["balance", "daily", "deposit", "give", "invest", "leaderboard", "loan", "pay", "rob", "slots", "withdraw", "work"],
        "GROUP ADMIN": ["add", "kick", "promote", "demote", "link", "revoke", "tagall", "announce", "mute", "unmute", "info", "icon", "subject", "desc", "ban", "delete", "del", "warnings", "warn", "antilink", "antibadword", "clear", "tag", "chatbot", "resetlink", "welcome", "goodbye"],
        "GAMES": ["truth", "dare", "dice", "slot", "quiz", "riddle", "hangman", "rps", "coin", "guess", "vocab", "proverb", "debate", "cipher", "etymology", "poetry", "logic", "idiom", "decode", "wordhunt", "wordcount"],
        "MEDIA SUITE": ["blur", "simage", "sticker", "tgsticker", "meme", "take", "emojimix"],
        "TEXTMAKER": ["metallic", "ice", "snow", "impressive", "matrix", "light", "neon", "purple", "thunder", "leaves", "1917", "arena", "hacker", "sand", "blackpink", "glitch", "fire"],
        "OWNER": ["broadcast", "join", "leave", "block", "unblock", "ban", "unban", "eval", "restart", "shutdown", "setname", "setbio", "setpp", "clearcache", "chatbot", "mode", "autostatus", "clearsession", "antidelete", "cleartmp", "autoreact", "autotyping", "autoread"],
        "WAMASTER": ["wamaster"],
        "SYSTEM": ["system"],
        "TOOLS": ["qr", "shortlink", "translate", "calculate", "weather", "crypto", "stocks", "news", "dictionary", "wiki"],
        "AI": commandFiles.filter(c => ["chat", "image", "story", "code", "math", "summarize", "grammar", "marketing", "translate", "analysis", "remini", "sora", "removebg", "tts", "gpt", "gemini", "imagine"].includes(c)),
        "MUSIC": ["play", "lyrics", "playlist", "recommend", "artist", "top", "genre", "mood", "identify", "karaoke"],
        "DOWNLOADER": ["yt", "ig", "fb", "tiktok", "twitter", "spotify", "pinterest", "mediafire", "gdrive", "mega", "play", "song", "instagram", "facebook", "video", "ytmp4"],
        "BIBLE": ["bible"]
    };

    const pairPage = process.env.PAIR_PAGE_URL;
    let helpMessage = `╭━━━━━━━━━━━◤◤
┃🤖➥ *𝙱𝙾𝚃 𝙽𝙰𝙼𝙴*: *⟮ ${settings.botName} ⟯*
┃👤➥ *𝚄𝚂𝙴𝚁𝙽𝙰𝙼𝙴*: *[${message.pushName}]*
┃🗺️➥ *𝚃𝙾𝚃𝙰𝙻 𝙲𝙾𝙼𝙼𝙰𝙽𝙳𝚂*: *[${commandFiles.length}]*
┃🚦➥ *𝚃𝙸𝙼𝙴*: *[${getCurrentTime()}]*
┃🎮➥ *𝙿𝚁𝙴𝙵𝙸𝚇*: *(.)*
┃🌍➥ *𝙼𝙾𝙳𝙴*: *[${settings.commandMode}]*
┃📚➥ *𝙻𝙸𝙱𝚁𝙰𝚁𝚈*: *[Baileys]*
┃👨🏽‍💻➥ *𝙳𝙴𝚅𝙴𝙻𝙾𝙿𝙴𝚁*: *${settings.botOwner}*
┃🧭➥ *𝚅𝙴𝚁𝚂𝙸𝙾𝙽*: *${settings.version}*
┃⚙️➥ *𝙳𝙰𝚃𝙰𝙱𝙰𝚂𝙴 𝚄𝚁𝙻*: *MongoDB Atlas*
┃⏳➥ *𝚁𝚄𝙽𝚃𝙸𝙼𝙴*: *${getUptime()}*
┃💻➥ *𝙿𝙻𝙰𝚃𝙵𝙾𝚁𝙼*: *${os.platform()}*
╰━━━━━━━━━━━◥◥

𝙷𝙸 𝚃𝙷𝙴𝚁𝙴 👋,
This is ${settings.botName}, the ultimate WhatsApp bot with games, fun, economy and more.
${pairPage ? `\n🔑 Pair your number here: ${pairPage}\n` : ''}

Visit our website: https://wa-bot-tree.pxxl.xyz
Join our channel: https://whatsapp.com/channel/0029Val3Ewv6xCSGCE9fZD0H

*𝚃𝙷𝙴 𝙱𝙴𝙻𝙾𝚆 𝙰𝚁𝙴 𝙲𝙾𝙼𝙼𝙰𝙽𝙳𝚂 𝙾𝙵 𝚃𝙷𝙴 𝙱𝙾𝚃:*\n\n`;

    for (const category in commandDetails) {
        const availableCommands = [...new Set(commandDetails[category])].filter(command => 
            commandFiles.includes(command) || 
            category === "TEXTMAKER" ||
            (category === "WAMASTER" && command === "wamaster") ||
            (category === "SYSTEM" && command === "system") ||
            (category === "BIBLE" && command === "bible") ||
            (category === "ECONOMY" && commandFiles.includes("economy"))
        );
        
        if (availableCommands.length > 0) {
            helpMessage += `╭─────「 ${'*' + category + '*'} 」───┈⊷\n`;
            if (category === "WAMASTER") {
                helpMessage += `││❐➣ .wamaster antilag\n`;
                helpMessage += `││❐➣ .wamaster antibug\n`;
                helpMessage += `││❐➣ .wamaster contactonly off|immediate|delayed\n`;
                helpMessage += `││❐➣ .wamaster optimize\n`;
                helpMessage += `││❐➣ .wamaster blockcode <code>\n`;
                helpMessage += `││❐➣ .wamaster unblockcode <code>\n`;
                helpMessage += `││❐➣ .wamaster listcodes\n`;
                helpMessage += `││❐➣ .wamaster clearcodes\n`;
                helpMessage += `││❐➣ .wamaster foreign on|off\n`;
                helpMessage += `││❐➣ .wamaster whitelist\n`;
                helpMessage += `││❐➣ .wamaster unwhitelist\n`;
                helpMessage += `││❐➣ .wamaster status\n`;
            } else if (category === "SYSTEM") {
                helpMessage += `││❐➣ .system status\n`;
                helpMessage += `││❐➣ .system drain\n`;
                helpMessage += `││❐➣ .system restart\n`;
            } else if (category === "BIBLE") {
                helpMessage += `││❐➣ .bible study <ref>\n`;
                helpMessage += `││❐➣ .bible quiz\n`;
                helpMessage += `││❐➣ .bible riddle\n`;
                helpMessage += `││❐➣ .bible scramble\n`;
            } else if (category === "ECONOMY") {
                helpMessage += `││❐➣ .eco balance|bal — *Show your wallet and bank.*\n`;
                helpMessage += `││❐➣ .eco daily — *Claim daily reward.*\n`;
                helpMessage += `││❐➣ .eco work — *Work and earn coins.*\n`;
                helpMessage += `││❐➣ .eco dep <amt> — *Deposit to bank.*\n`;
                helpMessage += `││❐➣ .eco with <amt> — *Withdraw from bank.*\n`;
                helpMessage += `││❐➣ .eco rob @user — *Attempt to steal coins.*\n`;
                helpMessage += `││❐➣ .eco leaderboard|lb — *Top 20 richest.*\n`;
            } else {
                availableCommands.forEach(command => {
                    const desc = commandDescriptions[command]?.description;
                    const line = desc ? `││❐➣ .${command} — *${desc}*\n` : `││❐➣ .${command}\n`;
                    helpMessage += line;
                });
            }
            helpMessage += `╰──────────────┈⊷\n\n`;
        }
    }

    helpMessage += `⚠ *Note:*\n *➪ 𝚄𝚂𝙴 .help <𝙲𝙾𝙼𝙼𝙰𝙽𝙳> 𝙵𝙾𝚁 𝙼𝙾𝚁𝙴 𝙸𝙽𝙵𝙾*\n *➪ 𝙴𝚡𝚊𝚖𝚙𝚕𝚎: .help sticker*\n\n*> In support by WA BOT TREE*`;


    try {
        const imagePath = path.join(__dirname, '../assets/bot_image.jpg');

        if (fs.existsSync(imagePath)) {
            const imageBuffer = fs.readFileSync(imagePath);

            await sock.sendMessage(chatId, {
                image: imageBuffer,
                caption: helpMessage,
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '0029Val3Ewv6xCSGCE9fZD0H@newsletter',
                        newsletterName: 'WA BOT TREE',
                        serverMessageId: -1
                    }
                }
            }, { quoted: message });
        } else {
            console.error('Bot image not found at:', imagePath);
            await sock.sendMessage(chatId, {
                text: helpMessage,
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '0029Val3Ewv6xCSGCE9fZD0H@newsletter',
                        newsletterName: 'In support by WA BOT TREE',
                        serverMessageId: -1
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error in help command:', error);
        await sock.sendMessage(chatId, { text: helpMessage });
    }
}

module.exports = helpCommand;
