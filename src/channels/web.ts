import crypto from 'crypto';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';

import { getMessagesSince } from '../db.js';
import { readEnvFile } from '../env.js';
import { logger } from '../logger.js';
import { registerChannel, ChannelOpts } from './registry.js';
import {
  Channel,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
} from '../types.js';

const WEB_JID = 'web:default';

// Inline chat UI
function buildHtml(hasPassword: boolean): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>NanoClaw</title>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #1a1a1a; --surface: #242424; --surface2: #2e2e2e;
    --accent: #7c6af7; --text: #e8e8e8; --muted: #888;
    --user-bg: #7c6af7; --bot-bg: #2e2e2e;
    --radius: 18px; --font: system-ui, -apple-system, sans-serif;
  }
  html, body { height: 100%; background: var(--bg); color: var(--text); font-family: var(--font); }
  #login {
    display: flex; align-items: center; justify-content: center; height: 100%;
  }
  #login form {
    background: var(--surface); padding: 2rem; border-radius: 12px;
    display: flex; flex-direction: column; gap: 1rem; width: 320px;
  }
  #login h2 { text-align: center; font-size: 1.2rem; }
  #login input {
    padding: 0.75rem 1rem; border: 1px solid #444; border-radius: 8px;
    background: var(--surface2); color: var(--text); font-size: 1rem;
  }
  #login button {
    padding: 0.75rem; background: var(--accent); color: #fff; border: none;
    border-radius: 8px; font-size: 1rem; cursor: pointer;
  }
  #login .error { color: #f87171; font-size: 0.85rem; text-align: center; }
  #app { display: none; flex-direction: column; height: 100%; }
  #header {
    padding: 1rem 1.25rem; background: var(--surface);
    border-bottom: 1px solid #333; display: flex; align-items: center; gap: 0.75rem;
  }
  #header .dot { width: 10px; height: 10px; border-radius: 50%; background: #4ade80; }
  #header h1 { font-size: 1rem; font-weight: 600; }
  #messages {
    flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem;
    scroll-behavior: smooth;
  }
  .msg { display: flex; flex-direction: column; max-width: 75%; }
  .msg.user { align-self: flex-end; align-items: flex-end; }
  .msg.bot { align-self: flex-start; align-items: flex-start; }
  .bubble {
    padding: 0.65rem 0.95rem; border-radius: var(--radius);
    line-height: 1.5; font-size: 0.95rem; word-break: break-word;
  }
  .msg.user .bubble { background: var(--user-bg); color: #fff; border-bottom-right-radius: 4px; }
  .msg.bot .bubble  { background: var(--bot-bg); border-bottom-left-radius: 4px; }
  .msg.bot .bubble p { margin: 0 0 0.5em; } .msg.bot .bubble p:last-child { margin: 0; }
  .msg.bot .bubble pre { background: #1a1a1a; padding: 0.75rem; border-radius: 8px; overflow-x: auto; margin: 0.5em 0; }
  .msg.bot .bubble code { font-family: monospace; font-size: 0.88em; }
  .msg.bot .bubble :not(pre) > code { background: #111; padding: 0.15em 0.4em; border-radius: 4px; }
  .msg.bot .bubble ul, .msg.bot .bubble ol { padding-left: 1.4em; }
  .meta { font-size: 0.72rem; color: var(--muted); margin-top: 0.25rem; padding: 0 4px; }
  #typing { align-self: flex-start; padding: 0.5rem 0.95rem; background: var(--bot-bg);
    border-radius: var(--radius); border-bottom-left-radius: 4px; color: var(--muted);
    font-size: 0.85rem; display: none; }
  #inputbar {
    padding: 0.75rem 1rem; background: var(--surface);
    border-top: 1px solid #333; display: flex; gap: 0.5rem;
  }
  #input {
    flex: 1; padding: 0.65rem 1rem; background: var(--surface2);
    border: 1px solid #444; border-radius: 24px; color: var(--text);
    font-size: 0.95rem; resize: none; max-height: 150px; overflow-y: auto;
    font-family: var(--font);
  }
  #input:focus { outline: none; border-color: var(--accent); }
  #send {
    width: 40px; height: 40px; border-radius: 50%; background: var(--accent);
    border: none; color: #fff; font-size: 1.1rem; cursor: pointer;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    align-self: flex-end;
  }
  #send:disabled { opacity: 0.4; cursor: default; }
  @media (max-width: 600px) { .msg { max-width: 90%; } }
</style>
</head>
<body>
${hasPassword ? `
<div id="login">
  <form id="loginForm">
    <h2>NanoClaw</h2>
    <input type="password" id="pw" placeholder="Password" autofocus />
    <button type="submit">Sign in</button>
    <div class="error" id="loginErr"></div>
  </form>
</div>` : ''}
<div id="app">
  <div id="header"><div class="dot"></div><h1>Andy</h1></div>
  <div id="messages"></div>
  <div id="typing">Andy is typing…</div>
  <div id="inputbar">
    <textarea id="input" rows="1" placeholder="Message Andy…"></textarea>
    <button id="send">&#10148;</button>
  </div>
</div>
<script>
(function() {
  const HAS_PASSWORD = ${hasPassword};
  let token = sessionStorage.getItem('wc_token') || '';
  let ws;

  function fmtTime(iso) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function appendMsg(sender, content, timestamp, fromMe) {
    const msgs = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = 'msg ' + (fromMe ? 'user' : 'bot');
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    if (fromMe) {
      bubble.textContent = content;
    } else {
      bubble.innerHTML = marked.parse(content);
    }
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = timestamp ? fmtTime(timestamp) : '';
    div.appendChild(bubble);
    div.appendChild(meta);
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function connectWs() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(proto + '//' + location.host + '/ws?token=' + encodeURIComponent(token));

    ws.onopen = () => {
      document.querySelector('#header .dot').style.background = '#4ade80';
      fetch('/api/history?token=' + encodeURIComponent(token))
        .then(r => r.json())
        .then(msgs => msgs.forEach(m => appendMsg(m.sender_name, m.content, m.timestamp, !!m.is_from_me)));
    };

    ws.onclose = () => {
      document.querySelector('#header .dot').style.background = '#f87171';
      setTimeout(connectWs, 3000);
    };

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'message') {
        document.getElementById('typing').style.display = 'none';
        appendMsg(data.sender_name, data.content, data.timestamp, !!data.is_from_me);
      } else if (data.type === 'typing') {
        document.getElementById('typing').style.display = data.value ? 'block' : 'none';
        document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
      }
    };
  }

  function showApp() {
    if (HAS_PASSWORD) document.getElementById('login').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    connectWs();
    const input = document.getElementById('input');
    const send = document.getElementById('send');

    function sendMsg() {
      const text = input.value.trim();
      if (!text || !ws || ws.readyState !== 1) return;
      ws.send(JSON.stringify({ type: 'message', content: text }));
      input.value = '';
      input.style.height = 'auto';
      send.disabled = false;
    }

    send.addEventListener('click', sendMsg);
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 150) + 'px';
    });
  }

  if (!HAS_PASSWORD || token) {
    showApp();
  }

  if (HAS_PASSWORD) {
    document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pw = document.getElementById('pw').value;
      const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      if (res.ok) {
        const { token: t } = await res.json();
        token = t;
        sessionStorage.setItem('wc_token', t);
        showApp();
      } else {
        document.getElementById('loginErr').textContent = 'Incorrect password';
      }
    });
  }
})();
</script>
</body>
</html>`;
}

export class WebChannel implements Channel {
  name = 'web';

  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private opts: {
    onMessage: OnInboundMessage;
    onChatMetadata: OnChatMetadata;
    registeredGroups: () => Record<string, RegisteredGroup>;
  };
  private port: number;
  private password: string;
  private sessionToken: string;
  private clients = new Set<WebSocket>();
  private connected = false;

  constructor(
    port: number,
    password: string,
    opts: {
      onMessage: OnInboundMessage;
      onChatMetadata: OnChatMetadata;
      registeredGroups: () => Record<string, RegisteredGroup>;
    },
  ) {
    this.port = port;
    this.password = password;
    this.opts = opts;
    // Generate a random session token at startup
    this.sessionToken = crypto.randomBytes(24).toString('hex');
  }

  private isValidToken(token: string): boolean {
    if (!this.password) return true;
    return token === this.sessionToken;
  }

  async connect(): Promise<void> {
    const hasPassword = !!this.password;
    const html = buildHtml(hasPassword);

    this.server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost`);

      // Login endpoint
      if (req.method === 'POST' && url.pathname === '/login') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const { password } = JSON.parse(body);
            if (password === this.password) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ token: this.sessionToken }));
            } else {
              res.writeHead(401, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid password' }));
            }
          } catch {
            res.writeHead(400);
            res.end();
          }
        });
        return;
      }

      // Message history API
      if (req.method === 'GET' && url.pathname === '/api/history') {
        const token = url.searchParams.get('token') || '';
        if (!this.isValidToken(token)) {
          res.writeHead(401);
          res.end();
          return;
        }
        try {
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const messages = getMessagesSince(WEB_JID, since, 'Andy', 50);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(messages));
        } catch {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('[]');
        }
        return;
      }

      // Serve chat UI for all other GET requests
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      res.writeHead(404);
      res.end();
    });

    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url || '/', `http://localhost`);
      const token = url.searchParams.get('token') || '';

      if (!this.isValidToken(token)) {
        ws.close(4001, 'Unauthorized');
        return;
      }

      this.clients.add(ws);
      logger.info({ clientCount: this.clients.size }, 'Web chat client connected');

      // Notify the channel so the chat is "alive"
      this.opts.onChatMetadata(WEB_JID, new Date().toISOString(), 'Web Chat', 'web', false);

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'message' && typeof msg.content === 'string' && msg.content.trim()) {
            const id = crypto.randomUUID();
            const timestamp = new Date().toISOString();
            this.opts.onMessage(WEB_JID, {
              id,
              chat_jid: WEB_JID,
              sender: 'web_user',
              sender_name: 'You',
              content: msg.content.trim(),
              timestamp,
              is_from_me: false,
              is_bot_message: false,
            });
          }
        } catch {
          // ignore malformed messages
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        logger.debug({ clientCount: this.clients.size }, 'Web chat client disconnected');
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(this.port, '127.0.0.1', () => {
        this.connected = true;
        const url = `http://localhost:${this.port}`;
        logger.info({ url }, 'Web chat started');
        console.log(`\n  Web chat: ${url}\n`);
        resolve();
      });
      this.server!.once('error', reject);
    });
  }

  async sendMessage(_jid: string, text: string): Promise<void> {
    const payload = JSON.stringify({
      type: 'message',
      sender_name: 'Andy',
      content: text,
      timestamp: new Date().toISOString(),
      is_from_me: false,
    });
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  async setTyping(_jid: string, isTyping: boolean): Promise<void> {
    const payload = JSON.stringify({ type: 'typing', value: isTyping });
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('web:');
  }

  async disconnect(): Promise<void> {
    for (const ws of this.clients) ws.close();
    this.clients.clear();
    this.wss?.close();
    this.server?.close();
    this.connected = false;
    logger.info('Web chat stopped');
  }
}

registerChannel('web', (opts: ChannelOpts) => {
  const envVars = readEnvFile(['WEB_CHAT_PORT', 'WEB_CHAT_PASSWORD']);
  const portStr =
    process.env.WEB_CHAT_PORT || envVars.WEB_CHAT_PORT || '3002';
  const password =
    process.env.WEB_CHAT_PASSWORD || envVars.WEB_CHAT_PASSWORD || '';
  const port = parseInt(portStr, 10);

  if (isNaN(port)) {
    logger.warn({ portStr }, 'Web chat: invalid WEB_CHAT_PORT');
    return null;
  }

  return new WebChannel(port, password, opts);
});
