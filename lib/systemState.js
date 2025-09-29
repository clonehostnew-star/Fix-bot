const fs = require('fs');

const STATE_PATH = './data/system.json';
const state = {
  batteryLevel: 100,
  charging: false,
  lastUpdateMs: Date.now(),
};

function load() {
  try {
    if (fs.existsSync(STATE_PATH)) {
      const data = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
      Object.assign(state, data);
    }
  } catch {}
}

function save() {
  try { fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2)); } catch {}
}

function applyBackgroundDrift() {
  const now = Date.now();
  const minutes = Math.floor((now - state.lastUpdateMs) / 60000);
  if (minutes <= 0) return;
  if (state.charging) {
    state.batteryLevel = Math.min(100, state.batteryLevel + 2 * minutes);
  } else {
    state.batteryLevel = Math.max(0, state.batteryLevel - 1 * minutes);
  }
  state.lastUpdateMs = now;
  save();
}

function drainForCommand(command) {
  applyBackgroundDrift();
  const high = new Set(['sticker','toimage','tovideo','play','ytmp4','ytmp3','tiktok']);
  const medium = new Set(['game','quiz','riddle','translate','search']);
  let delta = -1;
  if (high.has(command)) delta = -5;
  else if (medium.has(command)) delta = -2;
  if (!state.charging) {
    state.batteryLevel = Math.max(0, state.batteryLevel + delta);
    save();
  }
}

function setCharging(on) {
  applyBackgroundDrift();
  state.charging = !!on;
  save();
}

function getStatus() {
  applyBackgroundDrift();
  const level = state.batteryLevel;
  let label = '🔋 Normal';
  if (level <= 10) label = '🚨 Critical';
  else if (level <= 20) label = '⚠️ Low';
  const eta = state.charging ? Math.max(0, Math.ceil((100 - level) / 2)) : null;
  return {
    level,
    charging: state.charging,
    label,
    etaMinutes: eta,
  };
}

load();

module.exports = { drainForCommand, setCharging, getStatus };