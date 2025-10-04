const axios = require('axios');

module.exports = async function dictionaryCommand(sock, chatId, message, args) {
  const word = (args || []).join(' ').trim().toLowerCase();
  if (!word) return sock.sendMessage(chatId, { text: 'Usage: .dictionary <word>' }, { quoted: message });
  try {
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
    const { data } = await axios.get(url, { timeout: 15000 });
    const entry = Array.isArray(data) ? data[0] : null;
    const defs = entry?.meanings?.[0]?.definitions?.slice(0, 3).map((d,i)=>`${i+1}. ${d.definition}`).join('\n');
    if (!defs) throw new Error('No definitions');
    await sock.sendMessage(chatId, { text: `📖 ${entry.word}\n${defs}` }, { quoted: message });
  } catch (e) {
    await sock.sendMessage(chatId, { text: '❌ No definition found.' }, { quoted: message });
  }
}

