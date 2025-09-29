const { getStatus, setCharging } = require('../lib/systemState');

module.exports = async function systemCommand(sock, chatId, message, args) {
  const sub = (args[0] || '').toLowerCase();
  switch (sub) {
    case 'status': {
      const s = getStatus();
      await sock.sendMessage(chatId, { text: `*System Status*\n\n🔋 Battery: ${s.level}% (${s.label})\n⚡ Charging: ${s.charging ? `Yes${s.etaMinutes !== null ? ` — full in ~${s.etaMinutes}m` : ''}` : 'No'}` });
      break;
    }
    case 'charge': {
      setCharging(true);
      const s = getStatus();
      await sock.sendMessage(chatId, { text: `⚡ Charging started\nBattery: ${s.level}%\nRate: +2%/min` });
      break;
    }
    case 'unplug': {
      setCharging(false);
      const s = getStatus();
      await sock.sendMessage(chatId, { text: `🔌 Unplugged\nBattery: ${s.level}%` });
      break;
    }
    default: {
      await sock.sendMessage(chatId, { text: `*System Commands*\n.system status — Show battery and charging\n.system charge — Start charging\n.system unplug — Stop charging` });
    }
  }
}