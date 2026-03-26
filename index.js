const express = require('express');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    makeCacheableSignalKeyStore, 
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// Nettoyage des sessions au démarrage
if (fs.existsSync('./sessions')) {
    fs.emptyDirSync('./sessions');
}

app.get('/session', async (req, res) => {
    const num = req.query.number;
    if (!num) return res.status(400).send({ error: "Numéro requis" });

    const targetNumber = num.replace(/[^0-9]/g, '');
    const sessionDir = path.join(__dirname, 'sessions', 'temp_' + Date.now());
    
    let codeSent = false;
    let sessionGenerated = false;

    const { version } = await fetchLatestBaileysVersion();

    const startSocket = async () => {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            browser: ['Mac OS', 'Safari', '10.15.7'],
            syncFullHistory: false,
            connectTimeoutMs: 100000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 20000,
        });

        // --- GÉNÉRATION DU CODE ---
        if (!codeSent && !sock.authState.creds.registered) {
            await delay(8000); 
            try {
                const code = await sock.requestPairingCode(targetNumber);
                const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;
                codeSent = true;
                if (!res.headersSent) res.send({ code: formattedCode });
            } catch (e) {
                if (!res.headersSent) res.status(500).send({ error: "Erreur pairing" });
            }
        }

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode !== 401 && !sessionGenerated) {
                    await delay(5000);
                    startSocket();
                } else {
                    fs.removeSync(sessionDir);
                }
            }

            if (connection === 'open') {
                if (sessionGenerated) return;
                sessionGenerated = true;
                await delay(5000); 

                try {
                    // 🚀 EXTRACTION DIRECTE DEPUIS LA MÉMOIRE (RAM)
                    const credsToExport = sock.authState.creds;

                    const params = new URLSearchParams();
                    params.append('api_dev_key', "Nl_9mAGsEssqcDevULF4FItMAasK5gQb");
                    params.append('api_option', 'paste');
                    params.append('api_paste_code', JSON.stringify(credsToExport));
                    params.append('api_paste_private', '1');
                    params.append('api_paste_expire_date', '10M');

                    const pasteRes = await axios.post('https://pastebin.com/api_post', params);
                    
                    if (pasteRes.data && pasteRes.data.includes('pastebin.com')) {
                        const sessionID = "HYE~" + pasteRes.data.split('/').pop();
                        const jid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                        
                        await sock.sendMessage(jid, { 
                            image: { url: "https://files.catbox.moe/szt37y.jpg" },
                            caption: `🚀 *ⲎⲨⲂꞄⲒⲆⲈ-ⲘⲆ V3*\n\n*SESSION ID :* \`${sessionID}\`\n\n_Généré avec succès sur Render._` 
                        });
                    }
                } catch (e) {
                    console.error("Erreur finalisation");
                }
                setTimeout(() => fs.removeSync(sessionDir), 20000);
            }
        });
    };

    startSocket().catch(() => {
        if (!res.headersSent) res.status(500).send({ error: "Crash" });
    });
});

app.listen(PORT, () => console.log(`🚀 SERVEUR ACTIF PORT ${PORT}`));
