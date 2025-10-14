const fs = require('fs');
const path = require('path');

// Function to load user and group data from JSON file
function loadUserGroupData() {
    try {
        const dataPath = path.join(__dirname, '../data/userGroupData.json');
        if (!fs.existsSync(dataPath)) {
            // Create the file with default structure if it doesn't exist
            const defaultData = {
                antibadword: {},
                antilink: {},
                welcome: {},
                goodbye: {},
                chatbot: {},
                warnings: {},
                sudo: [],
                bibleQuiz: {
                    enabled: {},        // chatId -> boolean
                    scores: {},         // userId -> aggregate stats
                    groupScores: {},    // chatId -> { userId -> stats }
                    config: {}          // chatId -> { questions, attempts, seconds }
                }
            };
            fs.writeFileSync(dataPath, JSON.stringify(defaultData, null, 2));
            return defaultData;
        }
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        return data;
    } catch (error) {
        console.error('Error loading user group data:', error);
        return {
            antibadword: {},
            antilink: {},
            welcome: {},
            goodbye: {},
            chatbot: {},
            warnings: {}
        };
    }
}

// Function to save user and group data to JSON file
function saveUserGroupData(data) {
    try {
        const dataPath = path.join(__dirname, '../data/userGroupData.json');
        // Ensure the directory exists
        const dir = path.dirname(dataPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving user group data:', error);
        return false;
    }
}

// Add these functions to your SQL helper file
async function setAntilink(groupId, type, action) {
    try {
        const data = loadUserGroupData();
        if (!data.antilink) data.antilink = {};
        if (!data.antilink[groupId]) data.antilink[groupId] = {};
        
        data.antilink[groupId] = {
            enabled: type === 'on',
            action: action || 'delete' // Set default action to delete
        };
        
        saveUserGroupData(data);
        return true;
    } catch (error) {
        console.error('Error setting antilink:', error);
        return false;
    }
}

async function getAntilink(groupId, type) {
    try {
        const data = loadUserGroupData();
        if (!data.antilink || !data.antilink[groupId]) return null;
        
        return type === 'on' ? data.antilink[groupId] : null;
    } catch (error) {
        console.error('Error getting antilink:', error);
        return null;
    }
}

async function removeAntilink(groupId, type) {
    try {
        const data = loadUserGroupData();
        if (data.antilink && data.antilink[groupId]) {
            delete data.antilink[groupId];
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error removing antilink:', error);
        return false;
    }
}

// Add antitag functions
async function setAntitag(groupId, type, action) {
    try {
        const data = loadUserGroupData();
        if (!data.antitag) data.antitag = {};
        if (!data.antitag[groupId]) data.antitag[groupId] = {};
        
        data.antitag[groupId] = {
            enabled: type === 'on',
            action: action || 'delete' // Set default action to delete
        };
        
        saveUserGroupData(data);
        return true;
    } catch (error) {
        console.error('Error setting antitag:', error);
        return false;
    }
}

async function getAntitag(groupId, type) {
    try {
        const data = loadUserGroupData();
        if (!data.antitag || !data.antitag[groupId]) return null;
        
        return type === 'on' ? data.antitag[groupId] : null;
    } catch (error) {
        console.error('Error getting antitag:', error);
        return null;
    }
}

async function removeAntitag(groupId, type) {
    try {
        const data = loadUserGroupData();
        if (data.antitag && data.antitag[groupId]) {
            delete data.antitag[groupId];
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error removing antitag:', error);
        return false;
    }
}

// Add these functions for warning system
async function incrementWarningCount(groupId, userId) {
    try {
        const data = loadUserGroupData();
        if (!data.warnings) data.warnings = {};
        if (!data.warnings[groupId]) data.warnings[groupId] = {};
        if (!data.warnings[groupId][userId]) data.warnings[groupId][userId] = 0;
        
        data.warnings[groupId][userId]++;
        saveUserGroupData(data);
        return data.warnings[groupId][userId];
    } catch (error) {
        console.error('Error incrementing warning count:', error);
        return 0;
    }
}

async function resetWarningCount(groupId, userId) {
    try {
        const data = loadUserGroupData();
        if (data.warnings && data.warnings[groupId] && data.warnings[groupId][userId]) {
            data.warnings[groupId][userId] = 0;
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error resetting warning count:', error);
        return false;
    }
}

// Add sudo check function
async function isSudo(userId) {
    try {
        const data = loadUserGroupData();
        return data.sudo && data.sudo.includes(userId);
    } catch (error) {
        console.error('Error checking sudo:', error);
        return false;
    }
}

// Manage sudo users
async function addSudo(userJid) {
    try {
        const data = loadUserGroupData();
        if (!data.sudo) data.sudo = [];
        if (!data.sudo.includes(userJid)) {
            data.sudo.push(userJid);
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error adding sudo:', error);
        return false;
    }
}

async function removeSudo(userJid) {
    try {
        const data = loadUserGroupData();
        if (!data.sudo) data.sudo = [];
        const idx = data.sudo.indexOf(userJid);
        if (idx !== -1) {
            data.sudo.splice(idx, 1);
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error removing sudo:', error);
        return false;
    }
}

async function getSudoList() {
    try {
        const data = loadUserGroupData();
        return Array.isArray(data.sudo) ? data.sudo : [];
    } catch (error) {
        console.error('Error getting sudo list:', error);
        return [];
    }
}

// Add these functions
async function addWelcome(jid, enabled, message) {
    try {
        const data = loadUserGroupData();
        if (!data.welcome) data.welcome = {};
        
        data.welcome[jid] = {
            enabled: enabled,
            message: message || '╔═⚔️ WELCOME ⚔️═╗\n║ 🛡️ User: {user}\n║ 🏰 Kingdom: {group}\n╠═══════════════╣\n║ 📜 Message:\n║ {description}\n╚═══════════════╝',
            channelId: '0029Val3Ewv6xCSGCE9fZD0H@newsletter'
        };
        
        saveUserGroupData(data);
        return true;
    } catch (error) {
        console.error('Error in addWelcome:', error);
        return false;
    }
}

async function delWelcome(jid) {
    try {
        const data = loadUserGroupData();
        if (data.welcome && data.welcome[jid]) {
            delete data.welcome[jid];
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error in delWelcome:', error);
        return false;
    }
}

async function isWelcomeOn(jid) {
    try {
        const data = loadUserGroupData();
        return data.welcome && data.welcome[jid] && data.welcome[jid].enabled;
    } catch (error) {
        console.error('Error in isWelcomeOn:', error);
        return false;
    }
}

async function addGoodbye(jid, enabled, message) {
    try {
        const data = loadUserGroupData();
        if (!data.goodbye) data.goodbye = {};
        
        data.goodbye[jid] = {
            enabled: enabled,
            message: message || '╔═⚔️ GOODBYE ⚔️═╗\n║ 🛡️ User: {user}\n║ 🏰 Kingdom: {group}\n╠═══════════════╣\n║ ⚰️ We will never miss you!\n╚═══════════════╝',
            channelId: '0029Val3Ewv6xCSGCE9fZD0H@newsletter'
        };
        
        saveUserGroupData(data);
        return true;
    } catch (error) {
        console.error('Error in addGoodbye:', error);
        return false;
    }
}

async function delGoodBye(jid) {
    try {
        const data = loadUserGroupData();
        if (data.goodbye && data.goodbye[jid]) {
            delete data.goodbye[jid];
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error in delGoodBye:', error);
        return false;
    }
}

async function isGoodByeOn(jid) {
    try {
        const data = loadUserGroupData();
        return data.goodbye && data.goodbye[jid] && data.goodbye[jid].enabled;
    } catch (error) {
        console.error('Error in isGoodByeOn:', error);
        return false;
    }
}

// Add these functions to your existing SQL helper file
async function setAntiBadword(groupId, type, action) {
    try {
        const data = loadUserGroupData();
        if (!data.antibadword) data.antibadword = {};
        if (!data.antibadword[groupId]) data.antibadword[groupId] = {};
        
        data.antibadword[groupId] = {
            enabled: type === 'on',
            action: action || 'delete'
        };
        
        saveUserGroupData(data);
        return true;
    } catch (error) {
        console.error('Error setting antibadword:', error);
        return false;
    }
}

async function getAntiBadword(groupId, type) {
    try {
        const data = loadUserGroupData();
        //console.log('Loading antibadword config for group:', groupId);
        //console.log('Current data:', data.antibadword);
        
        if (!data.antibadword || !data.antibadword[groupId]) {
            console.log('No antibadword config found');
            return null;
        }
        
        const config = data.antibadword[groupId];
       // console.log('Found config:', config);
        
        return type === 'on' ? config : null;
    } catch (error) {
        console.error('Error getting antibadword:', error);
        return null;
    }
}

async function removeAntiBadword(groupId, type) {
    try {
        const data = loadUserGroupData();
        if (data.antibadword && data.antibadword[groupId]) {
            delete data.antibadword[groupId];
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error removing antibadword:', error);
        return false;
    }
}

async function setChatbot(groupId, enabled) {
    try {
        const data = loadUserGroupData();
        if (!data.chatbot) data.chatbot = {};
        
        data.chatbot[groupId] = {
            enabled: enabled
        };
        
        saveUserGroupData(data);
        return true;
    } catch (error) {
        console.error('Error setting chatbot:', error);
        return false;
    }
}

async function getChatbot(groupId) {
    try {
        const data = loadUserGroupData();
        return data.chatbot?.[groupId] || null;
    } catch (error) {
        console.error('Error getting chatbot:', error);
        return null;
    }
}

async function removeChatbot(groupId) {
    try {
        const data = loadUserGroupData();
        if (data.chatbot && data.chatbot[groupId]) {
            delete data.chatbot[groupId];
            saveUserGroupData(data);
        }
        return true;
    } catch (error) {
        console.error('Error removing chatbot:', error);
        return false;
    }
}

module.exports = {
    // ... existing exports
    setAntilink,
    getAntilink,
    removeAntilink,
    setAntitag,
    getAntitag,
    removeAntitag,
    incrementWarningCount,
    resetWarningCount,
    isSudo,
    addSudo,
    removeSudo,
    getSudoList,
    addWelcome,
    delWelcome,
    isWelcomeOn,
    addGoodbye,
    delGoodBye,
    isGoodByeOn,
    setAntiBadword,
    getAntiBadword,
    removeAntiBadword,
    setChatbot,
    getChatbot,
    removeChatbot,
    // Bible quiz utilities
    recordBibleQuizSolo,
    getBibleQuizLeaderboard,
    resetBibleQuizLeaderboard,
    setBibleQuizEnabled,
    isBibleQuizEnabled,
    setBibleQuizConfig,
    getBibleQuizConfig,
}; 

// ---- Bible quiz support ----
function ensureBibleQuiz(data) {
    if (!data.bibleQuiz) {
        data.bibleQuiz = { enabled: {}, scores: {}, groupScores: {}, config: {} };
    } else {
        if (!data.bibleQuiz.enabled) data.bibleQuiz.enabled = {};
        if (!data.bibleQuiz.scores) data.bibleQuiz.scores = {};
        if (!data.bibleQuiz.groupScores) data.bibleQuiz.groupScores = {};
        if (!data.bibleQuiz.config) data.bibleQuiz.config = {};
    }
}

async function recordBibleQuizSolo(userId, chatId, points, correct, total) {
    try {
        if (!userId) return false;
        const data = loadUserGroupData();
        ensureBibleQuiz(data);
        const now = Date.now();

        if (!data.bibleQuiz.scores[userId]) {
            data.bibleQuiz.scores[userId] = { points: 0, best: 0, games: 0, correct: 0, total: 0, lastAt: 0 };
        }
        const s = data.bibleQuiz.scores[userId];
        s.points = (s.points || 0) + (points || 0);
        s.games = (s.games || 0) + 1;
        s.correct = (s.correct || 0) + (correct || 0);
        s.total = (s.total || 0) + (total || 0);
        s.best = Math.max(s.best || 0, points || 0);
        s.lastAt = now;

        if (chatId) {
            if (!data.bibleQuiz.groupScores[chatId]) data.bibleQuiz.groupScores[chatId] = {};
            if (!data.bibleQuiz.groupScores[chatId][userId]) {
                data.bibleQuiz.groupScores[chatId][userId] = { points: 0, best: 0, games: 0, correct: 0, total: 0, lastAt: 0 };
            }
            const g = data.bibleQuiz.groupScores[chatId][userId];
            g.points = (g.points || 0) + (points || 0);
            g.games = (g.games || 0) + 1;
            g.correct = (g.correct || 0) + (correct || 0);
            g.total = (g.total || 0) + (total || 0);
            g.best = Math.max(g.best || 0, points || 0);
            g.lastAt = now;
        }

        saveUserGroupData(data);
        return true;
    } catch (e) {
        console.error('Error recording bible quiz result:', e);
        return false;
    }
}

async function getBibleQuizLeaderboard(scope = 'global', chatId, topN = 10) {
    try {
        const data = loadUserGroupData();
        ensureBibleQuiz(data);
        const src = scope === 'group' && chatId ? (data.bibleQuiz.groupScores[chatId] || {}) : (data.bibleQuiz.scores || {});
        const entries = Object.entries(src).map(([userId, st]) => ({ userId, ...(st || {}) }));
        entries.sort((a, b) => (b.points || 0) - (a.points || 0) || (b.best || 0) - (a.best || 0) || (b.lastAt || 0) - (a.lastAt || 0));
        return entries.slice(0, Math.max(1, Math.min(50, topN)));
    } catch (e) {
        console.error('Error getting bible quiz leaderboard:', e);
        return [];
    }
}

async function resetBibleQuizLeaderboard(scope = 'group', chatId) {
    try {
        const data = loadUserGroupData();
        ensureBibleQuiz(data);
        if (scope === 'global') {
            data.bibleQuiz.scores = {};
        } else if (scope === 'group' && chatId) {
            data.bibleQuiz.groupScores[chatId] = {};
        }
        saveUserGroupData(data);
        return true;
    } catch (e) {
        console.error('Error resetting bible quiz leaderboard:', e);
        return false;
    }
}

async function setBibleQuizEnabled(chatId, enabled) {
    try {
        const data = loadUserGroupData();
        ensureBibleQuiz(data);
        data.bibleQuiz.enabled[chatId] = !!enabled;
        saveUserGroupData(data);
        return true;
    } catch (e) {
        console.error('Error setting bible quiz enabled:', e);
        return false;
    }
}

async function isBibleQuizEnabled(chatId) {
    try {
        const data = loadUserGroupData();
        ensureBibleQuiz(data);
        if (!chatId || !chatId.endsWith('@g.us')) return true;
        const val = data.bibleQuiz.enabled[chatId];
        return typeof val === 'boolean' ? val : true;
    } catch (e) {
        console.error('Error reading bible quiz enabled state:', e);
        return true;
    }
}

async function setBibleQuizConfig(chatId, cfg) {
    try {
        const data = loadUserGroupData();
        ensureBibleQuiz(data);
        if (!data.bibleQuiz.config[chatId]) data.bibleQuiz.config[chatId] = {};
        Object.assign(data.bibleQuiz.config[chatId], cfg || {});
        saveUserGroupData(data);
        return data.bibleQuiz.config[chatId];
    } catch (e) {
        console.error('Error setting bible quiz config:', e);
        return {};
    }
}

async function getBibleQuizConfig(chatId) {
    try {
        const data = loadUserGroupData();
        ensureBibleQuiz(data);
        return data.bibleQuiz.config[chatId] || {};
    } catch (e) {
        console.error('Error getting bible quiz config:', e);
        return {};
    }
}