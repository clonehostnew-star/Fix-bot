const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');

async function createApp() {
  const app = express();
  app.get('/code', async (req, res) => {
    try {
      const number = (req.query.number || '').replace(/[^0-9]/g, '');
      if (!number) return res.status(400).json({ error: 'missing number' });

      const { state, saveCreds } = await useMultiFileAuthState('./session');
      const { version } = await fetchLatestBaileysVersion();
      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ['WA-BOT-TREE', 'Chrome', '20'],
      });
      sock.ev.on('creds.update', saveCreds);
      const code = await sock.requestPairingCode(number);
      return res.json({ code });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'failed' });
    }
  });
  return app;
}

if (require.main === module) {
  createApp().then(app => {
    const port = process.env.PORT || 3000;
    app.listen(port, () => console.log(`Pair service listening on :${port}`));
  });
}

module.exports = createApp;