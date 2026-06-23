/**
 * WhatsApp Bot Service
 * 
 * Connects to WhatsApp Web via QR scan, then exposes:
 *  - sendMessage(phone, message) → sends a text message
 *  - getStatus() → returns current status, QR, last activity
 *  - logout() → disconnects the bot
 *
 * IMPORTANT:
 *  - First time you need to scan a QR code from the admin panel
 *  - Session is stored in /tmp/wwebjs_auth (ephemeral on Render)
 *  - On Render free tier the app sleeps after 15min, session may disconnect
 *  - For 24/7 operation upgrade to Render paid plan ($7/month)
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

// In-memory state
const state = {
  status: 'disconnected', // 'disconnected' | 'initializing' | 'qr' | 'authenticated' | 'ready' | 'auth_failure' | 'disconnected'
  qr: null,             // base64 data URL of current QR
  qrRaw: null,          // raw QR string
  phoneNumber: null,    // connected phone number (e.g. "905551234567")
  pushName: null,       // connected account name
  lastError: null,
  lastActivity: null,
  messageLog: [],       // last 20 sent messages
};

let client = null;
let reconnectTimer = null;
let isShuttingDown = false;

const SESSION_DIR = path.join('/tmp', 'wwebjs_auth');
const MESSAGE_LOG_MAX = 20;

function logMessage(direction, phone, message, status) {
  const entry = {
    time: new Date().toISOString(),
    direction, // 'sent' | 'received' | 'system'
    phone: phone || null,
    message: (message || '').toString().slice(0, 200),
    status: status || 'ok',
  };
  state.messageLog.unshift(entry);
  if (state.messageLog.length > MESSAGE_LOG_MAX) {
    state.messageLog = state.messageLog.slice(0, MESSAGE_LOG_MAX);
  }
  state.lastActivity = entry.time;
}

async function createClient() {
  if (client) {
    try { await client.destroy(); } catch {}
    client = null;
  }

  state.status = 'initializing';
  state.qr = null;
  state.qrRaw = null;

  // Ensure session dir exists (only relevant on first run / if wiped)
  try { fs.mkdirSync(SESSION_DIR, { recursive: true }); } catch {}

  // Try to find Chrome / Chromium in common locations (Render, Heroku, local)
  const fs = require('fs');
  const path = require('path');

  // Build a list of all possible Chrome locations
  const possibleChromePaths = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    // Standard system Chrome locations (from apt install)
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium-browser-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/snap/bin/chromium',
  ];

  let executablePath = null;
  for (const p of possibleChromePaths) {
    try {
      if (fs.existsSync(p)) { executablePath = p; break; }
    } catch {}
  }

  // Check puppeteer cache for Chrome 146 (whatsapp-web.js needs it)
  if (!executablePath) {
    const cacheDirs = ['/opt/render/.cache/puppeteer/chrome', '/root/.cache/puppeteer/chrome'];
    for (const dir of cacheDirs) {
      try {
        if (fs.existsSync(dir)) {
          // Prefer version 146 (needed by whatsapp-web.js 1.34.7)
          const versions = fs.readdirSync(dir)
            .filter(v => v.startsWith('linux-'))
            .sort((a, b) => {
              // Prefer 146.0.7680.31
              if (a.startsWith('linux-146')) return -1;
              if (b.startsWith('linux-146')) return 1;
              return b.localeCompare(a);
            });
          for (const v of versions) {
            const candidate = path.join(dir, v, 'chrome-linux64', 'chrome');
            if (fs.existsSync(candidate)) { executablePath = candidate; break; }
          }
        }
      } catch {}
      if (executablePath) break;
    }
  }

  console.log('[bot] Chrome executable path:', executablePath || '(not found, will use puppeteer default)');

  const puppeteerConfig = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
    ],
  };
  if (executablePath) {
    puppeteerConfig.executablePath = executablePath;
    console.log('[bot] Using Chrome at:', executablePath);
  } else {
    console.log('[bot] No system Chrome found, will use bundled Chromium');
  }

  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: SESSION_DIR,
    }),
    puppeteer: puppeteerConfig,
  });

  client.on('qr', async (qr) => {
    state.status = 'qr';
    state.qrRaw = qr;
    try {
      state.qr = await QRCode.toDataURL(qr, { width: 320, margin: 2 });
    } catch (e) {
      state.qr = null;
    }
    state.lastError = null;
    logMessage('system', null, 'QR code generated — please scan', 'info');
  });

  client.on('authenticated', () => {
    state.status = 'authenticated';
    state.qr = null;
    state.qrRaw = null;
    logMessage('system', null, 'Authenticated successfully', 'info');
  });

  client.on('auth_failure', (msg) => {
    state.status = 'auth_failure';
    state.lastError = msg || 'Authentication failed';
    logMessage('system', null, 'Auth failure: ' + (msg || 'unknown'), 'error');
  });

  client.on('ready', async () => {
    state.status = 'ready';
    state.qr = null;
    state.qrRaw = null;
    try {
      const info = client.info;
      state.phoneNumber = info?.wid?._serialized?.split('@')[0] || null;
      state.pushName = info?.pushname || null;
    } catch {}
    logMessage('system', null, `Bot ready as ${state.pushName || state.phoneNumber || 'unknown'}`, 'info');
  });

  client.on('disconnected', (reason) => {
    state.status = 'disconnected';
    state.phoneNumber = null;
    state.pushName = null;
    logMessage('system', null, 'Disconnected: ' + (reason || 'unknown'), 'warn');
    // Auto-reconnect after 5s (but not if we're shutting down)
    if (!isShuttingDown) {
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        logMessage('system', null, 'Auto-reconnecting...', 'info');
        createClient().then(() => client.initialize().catch((e) => {
          state.lastError = e.message;
          logMessage('system', null, 'Reconnect failed: ' + e.message, 'error');
        }));
      }, 5000);
    }
  });

  try {
    await client.initialize();
  } catch (e) {
    state.status = 'auth_failure';
    state.lastError = e.message;
    logMessage('system', null, 'Init failed: ' + e.message, 'error');
  }
}

async function sendMessage(phone, message) {
  if (state.status !== 'ready') {
    const err = `Bot not ready (status: ${state.status})`;
    logMessage('sent', phone, message, 'fail');
    return { ok: false, error: err };
  }
  if (!client) return { ok: false, error: 'No client' };

  // Normalize phone number to WhatsApp JID format
  let cleanPhone = (phone || '').toString().replace(/[^0-9]/g, '');
  if (!cleanPhone) return { ok: false, error: 'Invalid phone' };

  // Remove leading zeros, add country code if missing
  // Heuristic: if starts with 90 (Turkey) keep, else if 10-12 digits assume OK
  if (!cleanPhone.startsWith('90') && cleanPhone.length <= 10) {
    // Maybe add 90 prefix (Turkey default)
    if (cleanPhone.startsWith('0')) cleanPhone = '9' + cleanPhone.substring(1);
    cleanPhone = '90' + cleanPhone;
  }

  const jid = `${cleanPhone}@c.us`;

  try {
    await client.sendMessage(jid, message);
    logMessage('sent', cleanPhone, message, 'ok');
    return { ok: true, jid };
  } catch (e) {
    logMessage('sent', cleanPhone, message, 'fail');
    return { ok: false, error: e.message };
  }
}

async function logout() {
  if (client) {
    try { await client.logout(); } catch {}
    try { await client.destroy(); } catch {}
  }
  client = null;
  state.status = 'disconnected';
  state.qr = null;
  state.qrRaw = null;
  state.phoneNumber = null;
  state.pushName = null;
  // Wipe session
  try {
    if (fs.existsSync(SESSION_DIR)) {
      fs.rmSync(SESSION_DIR, { recursive: true, force: true });
    }
  } catch (e) {
    state.lastError = e.message;
  }
  logMessage('system', null, 'Logged out and cleared session', 'info');
  // Auto-restart to generate a new QR
  setTimeout(() => createClient(), 2000);
}

function getStatus() {
  return {
    status: state.status,
    qr: state.qr,
    phoneNumber: state.phoneNumber,
    pushName: state.pushName,
    lastError: state.lastError,
    lastActivity: state.lastActivity,
    messageLog: state.messageLog,
  };
}

async function init() {
  isShuttingDown = false;
  logMessage('system', null, 'Bot service starting...', 'info');
  await createClient();
}

async function shutdown() {
  isShuttingDown = true;
  clearTimeout(reconnectTimer);
  if (client) {
    try { await client.destroy(); } catch {}
  }
}

module.exports = {
  init,
  shutdown,
  sendMessage,
  getStatus,
  logout,
};
