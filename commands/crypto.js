const axios = require('axios');

module.exports = async function cryptoCommand(sock, chatId, message, args) {
  const symbol = (args || []).join(' ').trim().toLowerCase();
  if (!symbol) return sock.sendMessage(chatId, { text: 'Usage: .crypto <symbol> (e.g., btc, eth)' }, { quoted: message });
  const map = { btc: 'bitcoin', eth: 'ethereum', bnb: 'binancecoin', sol: 'solana', doge: 'dogecoin' };
  const id = map[symbol] || symbol;
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_24hr_change=true`;
    const { data } = await axios.get(url, { timeout: 15000 });
    const row = data[id];
    if (!row) throw new Error('No data');
    await sock.sendMessage(chatId, { text: `💰 ${id.toUpperCase()}\nUSD: ${row.usd}\n24h: ${row.usd_24h_change?.toFixed?.(2)}%` }, { quoted: message });
  } catch (e) {
    await sock.sendMessage(chatId, { text: '❌ Failed to fetch crypto price.' }, { quoted: message });
  }
}

