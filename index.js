/**
 * WA BOT TREE MD - A WhatsApp Bot
 * Copyright (c) 2024 WA BOT TREE
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 * 
 * Credits:
 * - Baileys Library by @adiwajshing
 * - Pair Code implementation inspired by TechGod143 & DGXEON
 */
require('./settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const FileType = require('file-type')
const path = require('path')
const axios = require('axios')
const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main');
const PhoneNumber = require('awesome-phonenumber')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./lib/exif')
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetch, await, sleep, reSize } = require('./lib/myfunc')
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    generateForwardMessageContent,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    generateMessageID,
    downloadContentFromMessage,
    jidDecode,
    proto,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys")
const NodeCache = require("node-cache")
// Using a lightweight persisted store instead of makeInMemoryStore (compat across versions)
const pino = require("pino")
const readline = require("readline")
const http = require("http")
const { parsePhoneNumber } = require("libphonenumber-js")
const { PHONENUMBER_MCC } = require('@whiskeysockets/baileys/lib/Utils/generics')
const { rmSync, existsSync } = require('fs')
const { join } = require('path')

// Import lightweight store
const store = require('./lib/lightweight_store')

// Initialize store
store.readFromFile()
const settings = require('./settings')
setInterval(() => store.writeToFile(), settings.storeWriteInterval || 10000)

// Do not auto-set global.phoneNumber; prompt user for number unless provided via CLI

// Memory optimization - Force garbage collection if available
setInterval(() => {
    if (global.gc) {
        global.gc()
        console.log('🧹 Garbage collection completed')
    }
}, 60_000) // every 1 minute

// Memory monitoring - configurable
const MAX_MEMORY_MB = parseInt(process.env.MAX_MEMORY_MB || '0', 10) // 0 disables enforcement
const RESTART_ON_MEMORY = process.env.RESTART_ON_MEMORY === 'true'
setInterval(() => {
    const used = process.memoryUsage().rss / 1024 / 1024
    if (MAX_MEMORY_MB > 0 && used > MAX_MEMORY_MB) {
        if (RESTART_ON_MEMORY) {
            console.log(`⚠️ RAM too high (>${MAX_MEMORY_MB}MB), restarting bot...`)
            process.exit(1)
        } else {
            console.log(`⚠️ High RAM usage: ${used.toFixed(0)}MB (limit ${MAX_MEMORY_MB}MB). Set RESTART_ON_MEMORY=true to auto-restart.`)
        }
    }
}, 30_000)

let phoneNumber = ""
let owner
try {
    if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true })
    if (!fs.existsSync('./data/owner.json')) fs.writeFileSync('./data/owner.json', JSON.stringify({ owners: [] }, null, 2))
    owner = JSON.parse(fs.readFileSync('./data/owner.json'))
} catch {
    owner = { owners: [] }
}

global.botname = settings.botName;
global.themeemoji = "•"
// Pairing/QR mode selection (env-first)
const ENV_PAIRING = process.env.PAIRING_CODE
const ENV_PRINT_QR = process.env.PRINT_QR
const HAS_TTY = !!process.stdin.isTTY
const pairingDesired = (ENV_PAIRING === 'true') || (ENV_PAIRING === 'false' ? false : (process.argv.includes("--pairing-code") || HAS_TTY))
const hasPhoneInput = !!process.env.PHONE_NUMBER || HAS_TTY
const pairingActive = pairingDesired && hasPhoneInput
const printQRInTerminalFlag = (ENV_PRINT_QR === 'true') ? true : ((ENV_PRINT_QR === 'false') ? false : !pairingActive)
const useMobile = process.argv.includes("--mobile")

// Only create readline interface if we're in an interactive environment
const rl = HAS_TTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
const question = (text) => {
    if (rl) {
        return new Promise((resolve) => rl.question(text, resolve))
    } else {
        // In non-interactive environments, always use configured ownerNumber
        return Promise.resolve((settings.ownerNumber || phoneNumber || '').toString())
    }
}


async function startXeonBotInc() {
    let { version, isLatest } = await fetchLatestBaileysVersion()
    const { state, saveCreds } = await useMultiFileAuthState(`./session`)
    const msgRetryCounterCache = new NodeCache()

    const XeonBotInc = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: printQRInTerminalFlag,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        syncFullHistory: true,
        getMessage: async (key) => {
            let jid = jidNormalizedUser(key.remoteJid)
            let msg = await store.loadMessage(jid, key.id)
            return msg?.message || ""
        },
        msgRetryCounterCache,
        defaultQueryTimeoutMs: undefined,
    })

    store.bind(XeonBotInc.ev)

    // Message handling
    XeonBotInc.ev.on('messages.upsert', async chatUpdate => {
        try {
            const mek = chatUpdate.messages[0]
            if (!mek.message) return
            mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
            if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                await handleStatus(XeonBotInc, chatUpdate);
                return;
            }
            if (!XeonBotInc.public && !mek.key.fromMe && chatUpdate.type === 'notify') return
            if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return

            // Clear message retry cache to prevent memory bloat
            if (XeonBotInc?.msgRetryCounterCache) {
                XeonBotInc.msgRetryCounterCache.clear()
            }

            try {
                await handleMessages(XeonBotInc, chatUpdate, true)
            } catch (err) {
                console.error("Error in handleMessages:", err)
                // Only try to send error message if we have a valid chatId
                if (mek.key && mek.key.remoteJid) {
                    await XeonBotInc.sendMessage(mek.key.remoteJid, {
                        text: '❌ An error occurred while processing your message.',
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: '0029Val3Ewv6xCSGCE9fZD0H@newsletter',
                                newsletterName: 'WA BOT TREE',
                                serverMessageId: -1
                            }
                        }
                    }).catch(console.error);
                }
            }
        } catch (err) {
            console.error("Error in messages.upsert:", err)
        }
    })

    // Add these event handlers for better functionality
    XeonBotInc.decodeJid = (jid) => {
        if (!jid) return jid
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {}
            return decode.user && decode.server && decode.user + '@' + decode.server || jid
        } else return jid
    }

    XeonBotInc.ev.on('contacts.update', update => {
        for (let contact of update) {
            let id = XeonBotInc.decodeJid(contact.id)
            if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
        }
    })

    XeonBotInc.getName = (jid, withoutContact = false) => {
        id = XeonBotInc.decodeJid(jid)
        withoutContact = XeonBotInc.withoutContact || withoutContact
        let v
        if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
            v = store.contacts[id] || {}
            if (!(v.name || v.subject)) v = XeonBotInc.groupMetadata(id) || {}
            resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'))
        })
        else v = id === '0@s.whatsapp.net' ? {
            id,
            name: 'WhatsApp'
        } : id === XeonBotInc.decodeJid(XeonBotInc.user.id) ?
            XeonBotInc.user :
            (store.contacts[id] || {})
        return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
    }

    XeonBotInc.public = true

    XeonBotInc.serializeM = (m) => smsg(XeonBotInc, m, store)

    // Handle pairing code
    if (pairingActive && !XeonBotInc.authState.creds.registered) {
        if (useMobile) throw new Error('Cannot use pairing code with mobile api')

        // Prefer env PHONE_NUMBER; fallback to interactive prompt when TTY is available
        let phoneNumber = (process.env.PHONE_NUMBER || '').toString()
        if (!phoneNumber && rl) {
            phoneNumber = await question(chalk.bgBlack(chalk.greenBright(`Please type your WhatsApp number 😍\nFormat: ${settings.ownerNumber} (without + or spaces) : `)))
        }
        if (!phoneNumber) {
            console.log(chalk.yellow('PAIRING_CODE requested but no PHONE_NUMBER and no TTY input available. Falling back to QR login...'))
            // Nothing to do here; QR printing is controlled by printQRInTerminalFlag at socket creation
            // Simply skip requesting pairing code
        } else {

            // Clean the phone number - remove any non-digit characters
            phoneNumber = phoneNumber.replace(/[^0-9]/g, '')

            // Validate the phone number using awesome-phonenumber
            const pn = require('awesome-phonenumber');
            if (!pn('+' + phoneNumber).isValid()) {
                console.log(chalk.red('Invalid phone number. Please enter your full international number (e.g., 15551234567 for US, 447911123456 for UK, etc.) without + or spaces.'));
                process.exit(1);
            }

            setTimeout(async () => {
                try {
                    let code = await XeonBotInc.requestPairingCode(phoneNumber)
                    code = code?.match(/.{1,4}/g)?.join("-") || code
                    console.log(chalk.black(chalk.bgGreen(`Your Pairing Code : `)), chalk.black(chalk.white(code)))
                    console.log(chalk.yellow(`\nPlease enter this code in your WhatsApp app:\n1. Open WhatsApp\n2. Go to Settings > Linked Devices\n3. Tap "Link a Device"\n4. Enter the code shown above`))
                } catch (error) {
                    console.error('Error requesting pairing code:', error)
                    console.log(chalk.red('Failed to get pairing code. Please check your phone number and try again.'))
                }
            }, 3000)
        }
    }

    // Connection handling
    XeonBotInc.ev.on('connection.update', async (s) => {
        const { connection, lastDisconnect } = s
        if (connection == "open") {
            console.log(chalk.magenta(` `))
            console.log(chalk.yellow(`🌿Connected to => ` + JSON.stringify(XeonBotInc.user, null, 2)))

            const botNumber = XeonBotInc.user.id.split(':')[0] + '@s.whatsapp.net';
            const usersOnline = Object.keys(store.contacts).length; // Attempt to get a user count
            
            const connectMessage = `🤖 *${settings.botName} Connected Successfully!* 🎉\n` +
                                   `🚦 *Time:* ${new Date().toLocaleString()}\n` +
                                   `✅ *Status:* Online and Ready to Assist! 🤗\n` +
                                   `📦 *Version:* ${version.join('.')} (Latest)\n` +
                                   `👥 *Users Online:* ${usersOnline}\n` +
                                   `💻 *Server Status:* Stable\n\n` +
                                   `Hello! I'm *${settings.botName}*, your friendly WhatsApp bot. I'm here to help you with any questions, provide information, or just have a chat. Feel free to explore my features and let me know how I can assist you! 😊\n\n` +
                                   `*Stay Updated:* Join my official WhatsApp channel for the latest news, updates, and fun content! 📱\n` +
                                   `👉 Channel: https://whatsapp.com/channel/0029Val3Ewv6xCSGCE9fZD0H\n\n` +
                                   `*Visit My Website:* https://wa-bot-tree.pxxl.xyz\n\n` +
                                   `*Quick Links:*\n` +
                                   `🔍 *Help Center:* https://wa-bot-tree.pxxl.xyz/help\n` +
                                   `📝 *Terms of Service:* https://wa-bot-tree.pxxl.xyz/terms\n` +
                                   `📧 *Contact Us:* https://wa-bot-tree.pxxl.xyz/contact\n\n` +
                                   `Looking forward to chatting with you!`;

            await XeonBotInc.sendMessage(botNumber, {
                text: connectMessage,
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '0029Val3Ewv6xCSGCE9fZD0H@newsletter',
                        newsletterName: 'WA BOT TREE',
                        serverMessageId: -1
                    }
                }
            });

            await delay(1999)
            const consoleConnectMessage = `🤖 _${settings.botName} CONNECTED SUCCESSFULLY!_ 🎉\n` +
                                        `🚦 _Time:_ ${new Date().toLocaleString()}\n` +
                                        `✅ _Status:_ Online and Ready to Assist! 🤗\n` +
                                        `📦 _Version:_ ${version.join('.')} (Latest)\n` +
                                        `💻 _Server Status:_ Stable\n\n` +
                                        `Hello! I'm _${settings.botName}_, your friendly WhatsApp bot. I'm here to help you with any questions, provide information, or just have a chat. Feel free to explore my features and let me know how I can assist you! 😊\n\n` +
                                        `_Stay Updated:_ Join my official WhatsApp channel for the latest news, updates, and fun content! 📱\n` +
                                        `👉 Channel: https://whatsapp.com/channel/0029Val3Ewv6xCSGCE9fZD0H\n\n` +
                                        `_Visit My Website:_ https://wa-bot-tree.pxxl.xyz\n\n` +
                                        `_Quick Links:_\n` +
                                        `🔍 _Help Center:_ https://wa-bot-tree.pxxl.xyz/help\n` +
                                        `📝 _Terms of Service:_ https://wa-bot-tree.pxxl.xyz/terms\n` +
                                        `📧 _Contact Us:_ https://wa-bot-tree.pxxl.xyz/contact\n\n` +
                                        `Looking forward to chatting with you!`;

            console.log(chalk.yellow(consoleConnectMessage));

        }
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                try {
                    rmSync('./session', { recursive: true, force: true })
                } catch { }
                console.log(chalk.red('Session logged out. Please re-authenticate.'))
                startXeonBotInc()
            } else {
                startXeonBotInc()
            }
        }
    })

    // Track recently-notified callers to avoid spamming messages
    const antiCallNotified = new Set();

    // Anticall handler: block callers when enabled
    XeonBotInc.ev.on('call', async (calls) => {
        try {
            const { readState: readAnticallState } = require('./commands/anticall');
            const state = readAnticallState();
            if (!state.enabled) return;
            for (const call of calls) {
                const callerJid = call.from || call.peerJid || call.chatId;
                if (!callerJid) continue;
                try {
                    // First: attempt to reject the call if supported
                    try {
                        if (typeof XeonBotInc.rejectCall === 'function' && call.id) {
                            await XeonBotInc.rejectCall(call.id, callerJid);
                        }
                    } catch {}

                    // Notify the caller only once within a short window
                    if (!antiCallNotified.has(callerJid)) {
                        antiCallNotified.add(callerJid);
                        setTimeout(() => antiCallNotified.delete(callerJid), 60000);
                        await XeonBotInc.sendMessage(callerJid, { text: '📵 Anticall is enabled. Your call was rejected and you will be blocked.' });
                    }
                } catch {}
                // Then: block after a short delay to ensure rejection and message are processed
                setTimeout(async () => {
                    try { await XeonBotInc.updateBlockStatus(callerJid, 'block'); } catch {}
                }, 800);
            }
        } catch (e) {
            // ignore
        }
    });

    XeonBotInc.ev.on('creds.update', saveCreds)

    XeonBotInc.ev.on('group-participants.update', async (update) => {
        await handleGroupParticipantUpdate(XeonBotInc, update);
    });

    XeonBotInc.ev.on('messages.upsert', async (m) => {
        if (m.messages[0].key && m.messages[0].key.remoteJid === 'status@broadcast') {
            await handleStatus(XeonBotInc, m);
        }
    });

    XeonBotInc.ev.on('status.update', async (status) => {
        await handleStatus(XeonBotInc, status);
    });

    XeonBotInc.ev.on('messages.reaction', async (status) => {
        await handleStatus(XeonBotInc, status);
    });

    return XeonBotInc
}


// Start the bot with error handling
startXeonBotInc().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
})
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err)
})

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err)
})

let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.redBright(`Update ${__filename}`))
    delete require.cache[file]
    require(file)
})

// Optional keepalive HTTP server for platforms that require listening on a port
try {
    const enableKeepalive = process.env.KEEPALIVE === 'true'
    const port = parseInt(process.env.PORT || '', 10)
    if (enableKeepalive && port) {
        http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/plain' })
            res.end('OK')
        }).listen(port, () => console.log(`Keepalive server listening on :${port}`))
    }
} catch (e) {
    console.error('Failed to start keepalive server:', e?.message)
}
