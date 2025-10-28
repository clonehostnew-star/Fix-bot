const axios = require('axios');

module.exports = async function wikiCommand(sock, chatId, message, args) {
  const query = (args || []).join(' ').trim();
  if (!query) return sock.sendMessage(chatId, { text: 'Usage: .wiki <topic>' }, { quoted: message });
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const { data } = await axios.get(url, { timeout: 15000, headers: { 'accept': 'application/json' } });
    if (!data || !data.extract) throw new Error('No summary');
    const title = data.title || query;
    const extract = data.extract.slice(0, 1200);
    const page = data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;
    await sock.sendMessage(chatId, { text: `📘 ${title}\n\n${extract}\n\n${page}` }, { quoted: message });
  } catch (e) {
    await sock.sendMessage(chatId, { text: '❌ Not found or API error.' }, { quoted: message });
  }
}

