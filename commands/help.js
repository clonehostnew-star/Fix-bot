
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
        "GAMES": ["hm", "number", "rps", "dice", "coin", "quiz", "riddle", "wordhunt", "wordcount"],
        "MEDIA SUITE": ["blur", "simage", "sticker", "tgsticker", "meme", "take", "emojimix"],
        "TEXTMAKER": ["metallic", "ice", "snow", "impressive", "matrix", "light", "neon", "purple", "thunder", "leaves", "1917", "arena", "hacker", "sand", "blackpink", "glitch", "fire"],
        "OWNER": ["broadcast", "join", "leave", "block", "unblock", "ban", "unban", "eval", "restart", "shutdown", "setname", "setbio", "setpp", "clearcache", "chatbot", "mode", "autostatus", "clearsession", "antidelete", "cleartmp", "autoreact", "autotyping", "autoread"],
        "WAMASTER": ["wamaster"],
        "SYSTEM": ["system"],
        "TOOLS": ["shortlink", "translate", "calculate", "weather", "crypto", "stocks", "news", "dictionary", "wiki"],
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
            } else if (category === "GAMES") {
                helpMessage += `││❐➣ .hm guide — *Hangman guide.*\n`;
                helpMessage += `││❐➣ .hm start|guess <a-z>|forfeit — *Play Hangman.*\n`;
                helpMessage += `││❐➣ .number guide — *Number game guide.*\n`;
                helpMessage += `││❐➣ .number start|guess <1-100>|forfeit — *Guess the number.*\n`;
                helpMessage += `││❐➣ .rps rock|paper|scissors — *Rock-Paper-Scissors.*\n`;
                helpMessage += `││❐➣ .dice 1-6 — *Dice guess game.*\n`;
                helpMessage += `││❐➣ .coin heads|tails — *Coin flip.*\n`;
                helpMessage += `││❐➣ .wordhunt start — *One-word sprint (30s).*\n`;
                helpMessage += `││❐➣ .wordcount start — *Word count race (30s).*\n`;
            } else if (category === "ECONOMY") {
                helpMessage += `││❐➣ .eco balance|bal — *Show your wallet and bank.*\n`;
                helpMessage += `││❐➣ .eco daily — *Claim daily reward.*\n`;
                helpMessage += `││❐➣ .eco work — *Work and earn coins.*\n`;
                helpMessage += `││❐➣ .eco dep <amt|all> — *Deposit to bank.*\n`;
                helpMessage += `││❐➣ .eco with <amt|all> — *Withdraw from bank.*\n`;
                helpMessage += `││❐➣ .eco pay|give @user <amt> — *Transfer coins.*\n`;
                helpMessage += `││❐➣ .eco rob @user — *Attempt to steal coins.*\n`;
                helpMessage += `││❐➣ .eco slots <bet> — *Slot machine game.*\n`;
                helpMessage += `││❐➣ .eco cf <heads|tails> <bet> — *Coin flip.*\n`;
                helpMessage += `││❐➣ .eco dice <1-6> <bet> — *Dice guess game.*\n`;
                helpMessage += `││❐➣ .eco invest <amount> — *Risk investment.*\n`;
                helpMessage += `││❐➣ .eco loan <amount> — *Take a loan (10% interest).*\n`;
                helpMessage += `││❐➣ .eco repay <amount> — *Repay loan.*\n`;
                helpMessage += `││❐➣ .eco save <amount> — *Move to savings.*\n`;
                helpMessage += `││❐➣ .eco unsave <amount> — *Withdraw savings.*\n`;
                helpMessage += `││❐➣ .eco leaderboard|lb — *Top 20 richest.*\n`;
            } else if (category === "TEXTMAKER") {
                helpMessage += `││❐➣ .metallic — *Stylized metallic text logo.*\n`;
                helpMessage += `││❐➣ .ice — *Icy text logo.*\n`;
                helpMessage += `││❐➣ .snow — *Snow effect text.*\n`;
                helpMessage += `││❐➣ .impressive — *Impressive 3D title.*\n`;
                helpMessage += `││❐➣ .matrix — *Matrix code style text.*\n`;
                helpMessage += `││❐➣ .light — *Light glow text.*\n`;
                helpMessage += `││❐➣ .neon — *Neon signage text.*\n`;
                helpMessage += `││❐➣ .purple — *Purple glow text.*\n`;
                helpMessage += `││❐➣ .thunder — *Lightning text.*\n`;
                helpMessage += `││❐➣ .leaves — *Leafy nature style.*\n`;
                helpMessage += `││❐➣ .1917 — *Vintage 1917 style.*\n`;
                helpMessage += `││❐➣ .arena — *Steel arena title.*\n`;
                helpMessage += `││❐➣ .hacker — *Hacker terminal style.*\n`;
                helpMessage += `││❐➣ .sand — *Sand writing.*\n`;
                helpMessage += `││❐➣ .blackpink — *Blackpink logo style.*\n`;
                helpMessage += `││❐➣ .glitch — *RGB glitch effect.*\n`;
                helpMessage += `││❐➣ .fire — *Fire flaming text.*\n`;
            } else if (category === "OWNER") {
                helpMessage += `││❐➣ .mode — *Set public/private.*\n`;
                helpMessage += `││❐➣ .autostatus — *View/react statuses.*\n`;
                helpMessage += `││❐➣ .antidelete — *Anti message delete.*\n`;
                helpMessage += `││❐➣ .clearsession — *Reset WhatsApp session.*\n`;
                helpMessage += `││❐➣ .cleartmp — *Cleanup temp files.*\n`;
                helpMessage += `││❐➣ .autoreact — *Auto react to commands.*\n`;
                helpMessage += `││❐➣ .autotyping — *Typing indicator.*\n`;
                helpMessage += `││❐➣ .autoread — *Auto read messages.*\n`;
                helpMessage += `││❐➣ .setpp — *Set profile photo.*\n`;
            } else if (category === "WAMASTER") {
                helpMessage += `││❐➣ .wamaster antilag — *Drop heavy load in spammy groups.*\n`;
                helpMessage += `││❐➣ .wamaster antibug — *Delete + block malicious bug messages.*\n`;
                helpMessage += `││❐➣ .wamaster contactonly off|immediate|delayed — *Non-contacts policy.*\n`;
                helpMessage += `││❐➣ .wamaster optimize — *Enable scheduled cache cleanup.*\n`;
                helpMessage += `││❐➣ .wamaster blockcode <code> — *Block country code.*\n`;
                helpMessage += `││❐➣ .wamaster unblockcode <code> — *Unblock country code.*\n`;
                helpMessage += `││❐➣ .wamaster listcodes — *List blocked codes.*\n`;
                helpMessage += `││❐➣ .wamaster clearcodes — *Clear blocked codes.*\n`;
                helpMessage += `││❐➣ .wamaster foreign on|off — *Block foreign numbers.*\n`;
                helpMessage += `││❐➣ .wamaster whitelist — *Bypass protections in this group.*\n`;
                helpMessage += `││❐➣ .wamaster unwhitelist — *Remove bypass.*\n`;
                helpMessage += `││❐➣ .wamaster status — *Protection status.*\n`;
            } else if (category === "SYSTEM") {
                helpMessage += `││❐➣ .system status — *Show health metrics.*\n`;
                helpMessage += `││❐➣ .system drain — *CPU/memory drain test.*\n`;
                helpMessage += `││❐➣ .system restart — *Self-restart.*\n`;
            } else if (category === "TOOLS") {
                helpMessage += `││❐➣ .shortlink — *Shorten a URL.*\n`;
                helpMessage += `││❐➣ .translate — *Translate text.*\n`;
                helpMessage += `││❐➣ .calculate — *Math calculator.*\n`;
                helpMessage += `││❐➣ .weather — *Weather info.*\n`;
                helpMessage += `││❐➣ .crypto — *Crypto prices.*\n`;
                helpMessage += `││❐➣ .stocks — *Stock quotes.*\n`;
                helpMessage += `││❐➣ .dictionary — *Word definitions.*\n`;
                helpMessage += `││❐➣ .wiki — *Wikipedia summary.*\n`;
            } else if (category === "AI") {
                helpMessage += `││❐➣ .gpt — *AI chat.*\n`;
                helpMessage += `││❐➣ .gemini — *AI chat (Gemini).*\n`;
                helpMessage += `││❐➣ .remini — *Enhance images.*\n`;
                helpMessage += `││❐➣ .sora — *Video generation.*\n`;
                helpMessage += `││❐➣ .removebg — *Remove background.*\n`;
                helpMessage += `││❐➣ .tts — *Text-to-speech.*\n`;
                helpMessage += `││❐➣ .imagine — *Generate images.*\n`;
            } else if (category === "MUSIC") {
                helpMessage += `││❐➣ .play — *Search and play.*\n`;
                helpMessage += `││❐➣ .song — *Download audio.*\n`;
                helpMessage += `││❐➣ .lyrics — *Song lyrics.*\n`;
                helpMessage += `││❐➣ .spotify — *Spotify lookup.*\n`;
                helpMessage += `││❐➣ .video|.ytmp4 — *Download video.*\n`;
            } else if (category === "DOWNLOADER") {
                helpMessage += `││❐➣ .instagram — *Download IG media.*\n`;
                helpMessage += `││❐➣ .facebook — *Download FB media.*\n`;
                helpMessage += `││❐➣ .tiktok — *Download TikTok.*\n`;
                helpMessage += `││❐➣ .play|.song|.video — *YouTube audio/video.*\n`;
            } else if (category === "BIBLE") {
                helpMessage += `││❐➣ .bible study <book:ch:verse> — *Fetch verses; type "continue" to proceed.*\n`;
                helpMessage += `││❐➣ .bible quiz — *Modes:* personal | speed <n> | duel <n>\n`;
                helpMessage += `││   • personal — normal quiz\n`;
                helpMessage += `││   • speed <n> — multiplayer, first correct scores\n`;
                helpMessage += `││   • duel <n> — two players, timed turns\n`;
                helpMessage += `││❐➣ .bible riddle — *Add "speed <n>" for multiplayer speed race.*\n`;
                helpMessage += `││❐➣ .bible scramble — *Add "speed <n>" for multiplayer speed race.*\n`;
            } else if (category === "MEDIA SUITE") {
                helpMessage += `││❐➣ .simage — *Sticker to image.*\n`;
                helpMessage += `││❐➣ .sticker — *Image/video to sticker.*\n`;
                helpMessage += `││❐➣ .tgsticker — *Import Telegram sticker.*\n`;
                helpMessage += `││❐➣ .meme — *Random meme.*\n`;
                helpMessage += `││❐➣ .take — *Change sticker metadata.*\n`;
                helpMessage += `││❐➣ .emojimix — *Mix two emojis into a sticker.*\n`;
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
