const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore, Browsers } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 3000;

// 🔑 TA CLÉ API PASTEBIN
const PASTEBIN_API_KEY = "Nl_9mAGsEssqcDevULF4FItMAasK5gQb"; 

// 🖼️ LIEN DE TON IMAGE PERSO (Remplace par ton lien direct)
const IMAGE_URL = "https://i.ibb.co/v4b4x80/hybride-logo.jpg"; 

app.use(express.static('public'));

app.get('/session', async (req, res) => {
    const num = req.query.number;
    const type = req.query.type;
    const sessionDir = path.join(__dirname, 'temp_' + Date.now());
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    try {
        let sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            browser: ["Mac OS", "Safari", "10.15.7"] 
        });

        // GESTION QR CODE
        if (type === 'qr') {
            sock.ev.on('connection.update', async (update) => {
                const { qr } = update;
                if (qr) {
                    const QRCode = require('qrcode');
                    const qrBase64 = await QRCode.toDataURL(qr);
                    res.send({ qr: qrBase64 });
                }
            });
        }

        // GESTION PAIRING CODE
        if (type === 'pair' && num) {
            await delay(2000);
            const code = await sock.requestPairingCode(num.replace(/[^0-9]/g, ''));
            res.send({ code: code });
        }

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === "open") {
                await delay(5000);
                const creds = await fs.readJson(path.join(sessionDir, 'creds.json'));
                
                try {
                    const params = new URLSearchParams();
                    params.append('api_dev_key', PASTEBIN_API_KEY);
                    params.append('api_option', 'paste');
                    params.append('api_paste_code', JSON.stringify(creds));
                    params.append('api_paste_private', '1'); 
                    params.append('api_paste_name', 'Hybride-Session');
                    params.append('api_paste_expire_date', '10M'); 

                    const pasteRes = await axios.post('https://pastebin.com/api_post', params);
                    const pasteId = pasteRes.data.split('/').pop();
                    const sessionID = "HYE~" + pasteId;

                    // Message avec ton image et remerciements
                    await sock.sendMessage(sock.user.id, { 
                        image: { url: IMAGE_URL },
                        caption: `🚀 *ⲎⲨⲂꞄⲒⲆⲈ-ⲘⲆ*\n\nMerci d'avoir utilisé notre générateur. Votre session est prête.` 
                    });

                    // Message séparé avec l'ID court
                    await delay(1500);
                    await sock.sendMessage(sock.user.id, { text: `${sessionID}` });

                } catch (e) { console.error("Erreur Pastebin:", e.message); }
                
                await delay(2000);
                fs.removeSync(sessionDir);
            }
        });
    } catch (err) { res.status(500).send({ error: "Erreur" }); }
});

app.listen(PORT, () => console.log(`🚀 ⲎⲨⲂꞄⲒⲆⲈ-ⲘⲆ GENERATOR ONLINE`));
