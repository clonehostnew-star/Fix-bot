const axios = require('axios');

module.exports = async function shortlinkCommand(sock, chatId, message, args) {
  const url = (args || []).join(' ').trim();
  if (!url) {
    return sock.sendMessage(chatId, { text: 'Usage: .shortlink <url>' }, { quoted: message });
  }
  try {
    new URL(url);
  } catch {
    return sock.sendMessage(chatId, { text: '❌ Invalid URL' }, { quoted: message });
  }
  try {
    const api = `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`;
    const { data } = await axios.get(api, { timeout: 15000 });
    if (!data || typeof data !== 'string') throw new Error('API failed');
    await sock.sendMessage(chatId, { text: `🔗 Short link: ${data}` }, { quoted: message });
  } catch (e) {
    await sock.sendMessage(chatId, { text: '❌ Failed to shorten link, try later.' }, { quoted: message });
  }
}

