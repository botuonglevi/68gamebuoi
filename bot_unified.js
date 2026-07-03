const WebSocket = require('ws');
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteer.use(StealthPlugin());

async function getWSS(landing) {
    // Nếu có WS_URL trong môi trường, dùng luôn (Bypass Puppeteer)
    if (process.env.WS_URL) {
        console.log(`🌍 [WSS-FETCH] Using WS_URL from ENV: ${process.env.WS_URL}`);
        return process.env.WS_URL;
    }

    let browser = null;
    try {
        console.log(`🌐 [WSS-FETCH] Launching browser to find WSS...`);
        browser = await puppeteer.launch({
            headless: "new",
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-extensions",
                "--disable-web-security",
                "--disable-features=IsolateOrigins,site-per-process"
            ]
        });

        const page = await browser.newPage();
        const client = await page.createCDPSession();
        await client.send("Network.enable");

        let wssUrl = null;
        let resolved = false;

        // Listen for WebSocket creation events
        const waitWss = new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                if (!resolved) {
                    reject(new Error("Timeout waiting for WSS (90s)"));
                }
            }, 90000);

            client.on("Network.webSocketCreated", (p) => {
                console.log(`📡 [WSS-FETCH] WS Created: ${p.url}`);
                if (p.url && p.url.includes("wss://")) {
                    resolved = true;
                    clearTimeout(timeoutId);
                    resolve(p.url);
                }
            });
        });

        console.log(`🌐 [WSS-FETCH] Opening game: ${landing}`);
        await page.goto(landing, { waitUntil: "domcontentloaded", timeout: 90000 });

        wssUrl = await waitWss;
        
        // Validate WSS URL
        if (!wssUrl || !wssUrl.startsWith('wss://')) {
            throw new Error(`Invalid WSS URL: ${wssUrl}`);
        }
        
        return wssUrl;
    } catch (err) {
        console.error(`❌ [WSS-FETCH] Lỗi khi lấy WSS: ${err.message}`);
        throw err;
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (e) {
                // Ignore close errors
            }
        }
    }
}

class Bot68GB {
    constructor(shared) {
        this.shared = shared;
        this.name = "ULTIMATE-BOT";
        this.ws = null;
        this.auth_done = false;
        this.req_id = Math.floor(Math.random() * 1000) + 500;
        this.heartbeat = null;
        this.auth_timeout = null;
        this.reconnect_delay = 1000;
        this.max_reconnect_delay = 30000;
        this.is_connecting = false;

        this.txhu = { history: [], last_result: null, last_sig: "", prev_session: 0, last_msg: Date.now() };
        this.md5 = { history: [], last_result: null, last_sig: "", prev_session: 0, last_msg: Date.now(), current_md5: "" };
    }

    _makePacket(route, body = "{}") {
        const rb = Buffer.from(route);
        const bb = Buffer.from(body);
        this.req_id = (this.req_id + 1) % 65535;
        const varint = (n) => {
            const res = [];
            while (n > 127) { res.push((n & 0x7f) | 0x80); n >>>= 7; }
            res.push(n & 0x7f); return Buffer.from(res);
        };
        const msg = Buffer.concat([Buffer.from([0x00]), varint(this.req_id), Buffer.from([rb.length]), rb, bb]);
        const header = Buffer.alloc(4);
        header.writeUInt8(0x04, 0); header.writeUInt8(0, 1);
        header.writeUInt16BE(msg.length, 2);
        return Buffer.concat([header, msg]);
    }

    _authFlow() {
        if (this.auth_done) return;
        console.log(`🚀 [AUTH] Khởi động...`);
        if (this.auth_timeout) clearTimeout(this.auth_timeout);
        this.auth_timeout = setTimeout(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                console.log(`⚠️ [AUTH] WebSocket not open, skipping auth`);
                return;
            }
            
            // Gửi token auth
            if (this.shared.PKT_AUTH && this.shared.PKT_AUTH.length > 0) {
                this.ws.send(this.shared.PKT_AUTH);
            } else {
                console.log(`⚠️ [AUTH] No token available!`);
            }

            const routes = [
                "lobby.account.getgamelist",
                "mnshaibao.mnshaibaohandler.entergameroom",
                "mnshaibao.mnshaibaohandler.getgamescene",
                "mnmdsb.mnmdsbhandler.entergameroom",
                "mnmdsb.mnmdsbhandler.getgamescene"
            ];

            routes.forEach((r, i) => {
                setTimeout(() => {
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        this.ws.send(this._makePacket(r));
                    }
                }, 400 * (i + 1));
            });
            
            setTimeout(() => {
                this.auth_done = true;
                this.reconnect_delay = 1000; // Reset delay when auth succeeds
                console.log("✅ [AUTH] Hoàn tất!");
            }, 6000);
        }, 1000);
    }

    async run(landingPage = "https://68gbvn88.bar") {
        // Prevent multiple simultaneous connection attempts
        if (this.is_connecting) {
            console.log(`⏳ [${this.name}] Already connecting, skipping...`);
            return;
        }
        this.is_connecting = true;

        this.req_id = Math.floor(Math.random() * 1000) + 500;
        this.auth_done = false;

        try {
            // Chỉ tìm WSS nếu chưa có trong shared
            if (!this.shared.WS_URL || this.shared.WS_URL.length < 10) {
                console.log(`📡 [${this.name}] Đang tìm kiếm WSS từ: ${landingPage}...`);
                const wssUrl = await getWSS(landingPage);
                if (wssUrl && wssUrl.startsWith('wss://')) {
                    this.shared.WS_URL = wssUrl;
                    console.log(`✨ [${this.name}] WSS FOUND: ${this.shared.WS_URL}`);
                } else {
                    throw new Error(`Invalid WSS URL: ${wssUrl}`);
                }
            } else {
                console.log(`📡 [${this.name}] Using existing WSS: ${this.shared.WS_URL}`);
            }
        } catch (err) {
            console.error(`❌ [${this.name}] Không thể khởi động bot vì lỗi WSS. Reconnecting later...`);
            this.is_connecting = false;
            setTimeout(() => this.run(landingPage), 10000);
            return;
        }

        const headers = {
            "Origin": landingPage,
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
            "Cookie": this.shared.COOKIES || ""
        };
        
        try {
            this.ws = new WebSocket(this.shared.WS_URL, { headers });
        } catch (err) {
            console.error(`❌ [WS] Failed to create WebSocket: ${err.message}`);
            this.is_connecting = false;
            setTimeout(() => this.run(landingPage), 5000);
            return;
        }

        this.ws.on('open', () => {
            console.log(`🌐 [WS] Connected.`);
            this.is_connecting = false;
            
            // Send handshake
            if (this.shared.PKT_HANDSHAKE) {
                this.ws.send(this.shared.PKT_HANDSHAKE);
            }
            
            // Setup heartbeat
            if (this.heartbeat) clearInterval(this.heartbeat);
            this.heartbeat = setInterval(() => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    if (this.shared.PKT_HEARTBEAT) {
                        this.ws.send(this.shared.PKT_HEARTBEAT);
                    }
                    this.ws.send(this._makePacket("gamecen.gamecenter.queryjackpot"));

                    const now = Date.now();
                    // Nếu quá 30 giây không có data mới, ép re-subscribe
                    if (now - this.txhu.last_msg > 30000 || now - this.md5.last_msg > 30000) {
                        console.log(`📡 [WS] Data stale (>30s). Re-entering rooms...`);
                        const reEntry = [
                            "mnshaibao.mnshaibaohandler.entergameroom",
                            "mnshaibao.mnshaibaohandler.getgamescene",
                            "mnmdsb.mnmdsbhandler.entergameroom",
                            "mnmdsb.mnmdsbhandler.getgamescene"
                        ];
                        reEntry.forEach((r, i) => {
                            setTimeout(() => {
                                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                                    this.ws.send(this._makePacket(r));
                                }
                            }, 300 * i);
                        });
                        this.txhu.last_msg = now;
                        this.md5.last_msg = now;
                    }
                }
            }, 10000);
        });

        this.ws.on('message', (data) => {
            if (!Buffer.isBuffer(data)) return;
            if (data.length === 0) return;
            
            try {
                if (data[0] === 0x01) {
                    if (this.shared.PKT_HANDSHAKE_ACK) {
                        this.ws.send(this.shared.PKT_HANDSHAKE_ACK);
                    }
                    this._authFlow();
                } else if (data[0] === 0x04) {
                    this._parse(data);
                } else if (data[0] === 0x05) {
                    console.log(`⚠️ [WS] Bị KICK.`);
                    this.ws.close();
                }
            } catch (err) {
                console.error(`❌ [WS] Error processing message: ${err.message}`);
            }
        });

        this.ws.on('error', (err) => {
            console.error(`❌ [WS] Error: ${err.message}`);
        });

        this.ws.on('close', (code, reason) => {
            console.log(`🔌 [WS] Closed. Code: ${code}, Reason: ${reason || 'No reason'}`);
            this.auth_done = false;
            this.is_connecting = false;
            if (this.heartbeat) clearInterval(this.heartbeat);
            if (this.auth_timeout) clearTimeout(this.auth_timeout);

            console.log(`🔁 [${this.name}] [WS] Reconnecting in ${this.reconnect_delay / 1000}s...`);
            setTimeout(() => {
                this.reconnect_delay = Math.min(this.reconnect_delay * 1.5, this.max_reconnect_delay);
                this.run(landingPage);
            }, this.reconnect_delay);
        });
    }

    _findSession(raw, game) {
        const text = raw.toString('utf8', 0, 512);
        const m = /#(\d{5,10})/.exec(text);
        if (m) return parseInt(m[1]);

        // Brute force varint scan
        const body = raw.slice(4);
        for (let i = 0; i < Math.min(body.length - 4, 150); i++) {
            if (body[i] === 0x28 || body[i] === 0x38) { // Tag 5 hoặc Tag 7
                let val = 0, sh = 0;
                for (let j = 1; j < 6; j++) {
                    if (i + j >= body.length) break;
                    let b = body[i + j];
                    val |= (b & 0x7f) << sh;
                    if (!(b & 0x80)) {
                        let s = (body[i] === 0x38) ? (val >> 1) : val;
                        if (game === 'txhu' && s > 200000) return s;
                        if (game === 'md5' && s > 40000 && s < 100000) return s;
                        break;
                    }
                    sh += 7;
                }
            }
        }
        return game === 'txhu' ? this.txhu.prev_session : this.md5.prev_session;
    }

    _parse(raw) {
        if (raw.length < 30) return;
        
        const rawBin = raw.toString('binary');
        const text = raw.toString('utf8', 0, 1024);

        // Parse TXHU (mnshaibao)
        if (text.includes('mnshaibao') || text.includes('mnsb')) {
            this.txhu.last_msg = Date.now();
            const s = this._findSession(raw, 'txhu');
            if (s > 200000) this.txhu.prev_session = s;

            // Binary Dice pattern
            const dicePattern = /\x0a\x03([\x02\x04\x06\x08\x0a\x0c])([\x02\x04\x06\x08\x0a\x0c])([\x02\x04\x06\x08\x0a\x0c])/g;
            let match;
            let matched = [];
            while ((match = dicePattern.exec(rawBin)) !== null) {
                matched.push(match);
            }
            
            if (this.txhu.prev_session && matched.length > 0) {
                // Process last match first (latest)
                const last = matched[matched.length - 1];
                this._emit('HŨ', this.txhu.prev_session, 
                    last[1].charCodeAt(0) / 2, 
                    last[2].charCodeAt(0) / 2, 
                    last[3].charCodeAt(0) / 2
                );
                
                // Process history (limit to last 10)
                if (matched.length > 1) {
                    matched.slice(-10).forEach((mt, i) => {
                        const hs = this.txhu.prev_session - (matched.length - i);
                        if (hs > 200000) {
                            this._emit('HŨ', hs, 
                                mt[1].charCodeAt(0) / 2, 
                                mt[2].charCodeAt(0) / 2, 
                                mt[3].charCodeAt(0) / 2
                            );
                        }
                    });
                }
            }
        }

        // Parse MD5 (mnmdsb)
        if (text.includes('mnmdsb') || text.includes('MD5')) {
            this.md5.last_msg = Date.now();
            const s = this._findSession(raw, 'md5');
            if (s > 40000 && s < 100000) this.md5.prev_session = s;

            // Extract MD5 hash
            const md5M = /([a-fA-F0-9]{32})/.exec(text);
            if (md5M) this.md5.current_md5 = md5M[1];

            // MD5 Dice: Text format
            const tdice = /(\d)[-,\s]+(\d)[-,\s]+(\d)/.exec(text);
            if (tdice && this.md5.prev_session) {
                const d1 = parseInt(tdice[1]);
                const d2 = parseInt(tdice[2]);
                const d3 = parseInt(tdice[3]);
                if (d1 >= 1 && d1 <= 6 && d2 >= 1 && d2 <= 6 && d3 >= 1 && d3 <= 6) {
                    this._emit('MD5', this.md5.prev_session, d1, d2, d3);
                }
            } else {
                // Binary dice for MD5
                const bdice = /\x0a\x03([\x02\x04\x06\x08\x0a\x0c])([\x02\x04\x06\x08\x0a\x0c])([\x02\x04\x06\x08\x0a\x0c])/.exec(rawBin);
                if (bdice && this.md5.prev_session) {
                    this._emit('MD5', this.md5.prev_session, 
                        bdice[1].charCodeAt(0) / 2, 
                        bdice[2].charCodeAt(0) / 2, 
                        bdice[3].charCodeAt(0) / 2
                    );
                }
            }
        }
    }

    _emit(game, s, d1, d2, d3) {
        if (!s || !d1 || !d2 || !d3) return;
        if (d1 < 1 || d1 > 6 || d2 < 1 || d2 > 6 || d3 < 1 || d3 > 6) return;
        
        const sig = `${s}_${d1}${d2}${d3}`;
        const target = game === 'HŨ' ? this.txhu : this.md5;
        if (target.last_sig === sig) return;
        target.last_sig = sig;

        const total = d1 + d2 + d3;
        const res = total > 10 ? "TÀI" : "XỈU";
        const entry = { 
            "Phiên trước": s, 
            "xúc xắc 1": d1, 
            "xúc xắc 2": d2, 
            "xúc xắc 3": d3, 
            "kết quả": res, 
            "time": new Date().toLocaleTimeString('vi-VN') 
        };
        if (game === 'MD5' && this.md5.current_md5) {
            entry["chuỗi md5"] = this.md5.current_md5;
        }

        const hist = game === 'HŨ' ? this.txhu.history : this.md5.history;
        hist.push(entry);
        if (hist.length > 300) hist.shift();
        target.last_result = entry;

        console.log(`🎰 [${game}] #${s} | ${total} ${res} | ${d1}-${d2}-${d3}`);
    }

    isAlive() { 
        return this.ws && this.ws.readyState === WebSocket.OPEN && this.auth_done; 
    }
}

module.exports = Bot68GB;
