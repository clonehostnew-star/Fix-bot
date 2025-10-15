const fs = require('fs');
const path = require('path');
let mongoose;
try { mongoose = require('mongoose'); } catch {}

const FILE_PATH = path.join(__dirname, '..', 'data', 'economy.json');
const hasMongo = !!(process.env.MONGODB_URI && mongoose);

let UserModel = null;

async function initMongo() {
  if (!hasMongo) return false;
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB || 'wa-bot-tree' });
  }
  if (!UserModel) {
    const schema = new mongoose.Schema({
      userId: { type: String, unique: true },
      wallet: { type: Number, default: 0 },
      bank: { type: Number, default: 0 },
      lastDaily: Date,
      lastWork: Date,
      loans: { type: Number, default: 0 },
      savings: { type: Number, default: 0 },
    }, { timestamps: true });
    UserModel = mongoose.model('EconomyUser', schema);
  }
  return true;
}

function ensureFile() {
  const dir = path.dirname(FILE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(FILE_PATH)) fs.writeFileSync(FILE_PATH, JSON.stringify({}), 'utf-8');
}

function readAll() { ensureFile(); return JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8')); }
function writeAll(data) { ensureFile(); fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2)); }

async function getUser(userId) {
  if (await initMongo()) {
    let u = await UserModel.findOne({ userId });
    if (!u) u = await UserModel.create({ userId, wallet: 0, bank: 0 });
    return u;
  }
  const all = readAll();
  const existing = all[userId] || {};
  const u = {
    userId,
    wallet: existing.wallet ?? 0,
    bank: existing.bank ?? 0,
    loans: existing.loans ?? 0,
    savings: existing.savings ?? 0,
    inventory: Array.isArray(existing.inventory) ? existing.inventory : [],
    lastDaily: existing.lastDaily || null,
    lastWork: existing.lastWork || null,
    lastGamble: existing.lastGamble || null,
    lastInterestAt: existing.lastInterestAt || null,
    lastRiskAt: existing.lastRiskAt || null,
    boostExpiresAt: existing.boostExpiresAt || null,
    dailyStreak: existing.dailyStreak ?? 0,
    bestDailyStreak: existing.bestDailyStreak ?? 0,
    achievements: existing.achievements || {
      streak3: false,
      streak7: false,
      highRoller: false,
      gambler: 0, // count of gambling wins
      benefactor: false,
      tycoon: false
    }
  };
  all[userId] = u;
  writeAll(all);
  return u;
}

async function saveUser(user) {
  if (await initMongo()) {
    await user.save();
    return;
  }
  const all = readAll();
  all[user.userId] = user;
  writeAll(all);
}

async function addCoins(userId, amount) {
  const u = await getUser(userId);
  u.wallet = (u.wallet || 0) + amount;
  await saveUser(u);
  return u;
}

module.exports = { getUser, saveUser, addCoins };