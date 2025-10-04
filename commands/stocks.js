const axios = require('axios');

module.exports = async function stocksCommand(sock, chatId, message, args) {
  const symbol = (args || []).join(' ').trim().toUpperCase();
  if (!symbol) return sock.sendMessage(chatId, { text: 'Usage: .stocks <symbol> (e.g., AAPL)' }, { quoted: message });
  try {
    // Use Yahoo Finance unofficial endpoint via rapid user-agent; fallback minimal
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
    const { data } = await axios.get(url, { timeout: 15000, headers: { 'user-agent': 'Mozilla/5.0' } });
    const q = data?.quoteResponse?.result?.[0];
    if (!q) throw new Error('No quote');
    const text = `📈 ${q.symbol} — ${q.shortName || ''}\nPrice: ${q.regularMarketPrice}\nChange: ${q.regularMarketChange?.toFixed?.(2)} (${q.regularMarketChangePercent?.toFixed?.(2)}%)\nDay: ${q.regularMarketDayLow} - ${q.regularMarketDayHigh}`;
    await sock.sendMessage(chatId, { text }, { quoted: message });
  } catch (e) {
    await sock.sendMessage(chatId, { text: '❌ Failed to fetch stock quote.' }, { quoted: message });
  }
}

