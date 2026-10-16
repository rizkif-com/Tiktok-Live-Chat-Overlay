import { app, BrowserWindow, ipcMain, screen, globalShortcut } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { LiveChat } from 'youtube-chat';
import tmi from 'tmi.js';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';

// Low-memory defaults: remove hardware GPU allocation and cap V8 heap.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('renderer-process-limit', '1');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=64 --max-semi-space-size=4');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-domain-reliability');
app.commandLine.appendSwitch('disable-breakpad');
app.commandLine.appendSwitch('disable-features', 'MediaRouter,OptimizationHints,AutofillServerCommunication,HardwareMediaKeyHandling,MediaSessionService,Translate');

const here = path.dirname(fileURLToPath(import.meta.url));
const connections = new Map();
let win;
let clickThrough = false;
let alwaysOnTopEnabled = true;
let manualMinimize = false;
let fullscreenWatch;
const mobileClients = new Set();
const mobileToken = randomBytes(16).toString('hex');
let mobileInfo = { url: '', port: 19876 };

const send = (channel, payload) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  const message = JSON.stringify({ channel, payload });
  mobileClients.forEach(client => { if (client.readyState === 1) client.send(message); });
};

function localIPv4() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses || []) if (address.family === 'IPv4' && !address.internal) return address.address;
  }
  return '127.0.0.1';
}

function startMobileServer() {
  const mobileRoot = path.join(here, '..', 'mobile');
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, 'http://localhost');
      const fileName = requestUrl.pathname === '/' ? 'index.html' : requestUrl.pathname.replace(/^\//, '');
      const allowed = new Set(['index.html', 'app.js', 'mobile.css', 'manifest.json', 'icon.svg']);
      if (!allowed.has(fileName)) { response.writeHead(404); response.end('Not found'); return; }
      const data = await readFile(path.join(mobileRoot, fileName));
      response.writeHead(200, { 'Content-Type': types[path.extname(fileName)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); response.end(data);
    } catch { response.writeHead(500); response.end('Server error'); }
  });
  const wsServer = new WebSocketServer({ server, path: '/ws' });
  wsServer.on('connection', (socket, request) => {
    const token = new URL(request.url, 'http://localhost').searchParams.get('token');
    if (token !== mobileToken) { socket.close(1008, 'Token salah'); return; }
    mobileClients.add(socket);
    socket.send(JSON.stringify({ channel: 'sources:update', payload: [...connections.values()].map(({ id, platform, label, stats }) => ({ id, platform, label, stats })) }));
    socket.on('close', () => mobileClients.delete(socket));
  });
  server.listen(mobileInfo.port, '0.0.0.0', () => { mobileInfo.url = `http://${localIPv4()}:${mobileInfo.port}/?token=${mobileToken}`; send('mobile:info', mobileInfo); });
}

function sourceData(source, extra = {}) {
  return { sourceId: source.id, platform: source.platform, sourceLabel: source.label, ...extra };
}

function normalizeTikTokUser(user = {}) {
  const image = user.profilePicture || user.avatarThumb || user.avatarMedium || user.avatarLarge;
  return {
    username: user.uniqueId || user.displayId || user.display_id || 'penonton',
    nickname: user.nickname || user.uniqueId || user.displayId || 'Penonton',
    avatar: image?.urlList?.[0] || image?.url?.[0] || ''
  };
}

function publishSources() {
  send('sources:update', [...connections.values()].map(({ id, platform, label, stats }) => ({ id, platform, label, stats })));
}

function publishStats(source, updates) {
  source.stats = { ...source.stats, ...updates };
  send('live:stats', sourceData(source, source.stats));
}

function createWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    width: 460, height: Math.min(780, area.height - 70),
    x: area.x + area.width - 495, y: area.y + 35,
    minWidth: 320, minHeight: 300, transparent: true, frame: false,
    resizable: true, alwaysOnTop: true, backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(here, 'preload.cjs'), contextIsolation: true,
      nodeIntegration: false, sandbox: true, devTools: false,
      spellcheck: false, backgroundThrottling: true
    }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.on('restore', () => { manualMinimize = false; reinforceOverlay(); });
  win.on('minimize', () => {
    if (!manualMinimize && alwaysOnTopEnabled) setTimeout(reinforceOverlay, 150);
  });
  win.loadFile(path.join(here, 'index.html'));
  clearInterval(fullscreenWatch);
  fullscreenWatch = setInterval(() => {
    if (win && !win.isDestroyed() && win.isMinimized() && !manualMinimize && alwaysOnTopEnabled) reinforceOverlay();
  }, 1000);
}

function reinforceOverlay() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  if (alwaysOnTopEnabled) win.setAlwaysOnTop(true, 'screen-saver');
  win.showInactive();
  win.moveTop();
}

function setClickThrough(enabled) {
  clickThrough = Boolean(enabled);
  win?.setIgnoreMouseEvents(clickThrough, { forward: true });
  send('window:click-through-state', clickThrough);
}

function setWindowSize(preset) {
  if (!win) return;
  const sizes = { small: [320, 420], medium: [460, 700], large: [600, 850] };
  const requested = sizes[preset] || sizes.medium;
  const area = screen.getDisplayMatching(win.getBounds()).workArea;
  const width = Math.min(requested[0], area.width);
  const height = Math.min(requested[1], area.height);
  win.setSize(width, height, true);
  const bounds = win.getBounds();
  win.setPosition(Math.min(Math.max(bounds.x, area.x), area.x + area.width - width), Math.min(Math.max(bounds.y, area.y), area.y + area.height - height), true);
}

function cleanTikTokTarget(input) {
  return String(input).trim().replace(/^https?:\/\/[^/]+\/@/, '').replace(/\/live.*$/, '').replace(/^@/, '');
}

function youtubeOptions(input) {
  const value = String(input).trim();
  const patterns = [/youtu\.be\/([\w-]{11})/, /[?&]v=([\w-]{11})/, /youtube\.com\/live\/([\w-]{11})/, /youtube\.com\/shorts\/([\w-]{11})/];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return { liveId: match[1] };
  }
  if (/^UC[\w-]+$/.test(value)) return { channelId: value };
  if (/^[\w-]{11}$/.test(value)) return { liveId: value };
  throw new Error('Gunakan URL LIVE, video ID, atau channel ID YouTube (diawali UC).');
}

function cleanTwitchTarget(input) {
  return String(input).trim().replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '').split(/[/?#]/)[0].replace(/^#/, '').toLowerCase();
}

async function fetchYouTubeHtml(liveId) {
  const response = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(liveId)}&hl=en&gl=US`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9' }
  });
  if (!response.ok) throw new Error(`YouTube merespons HTTP ${response.status}.`);
  return response.text();
}

function readYouTubeIdentity(html) {
  const authorRaw = html.match(/"videoDetails"\s*:\s*\{[\s\S]{0,5000}?"author"\s*:\s*"((?:\\.|[^"\\])*)"/)?.[1]
    || html.match(/"author"\s*:\s*"((?:\\.|[^"\\])*)"/)?.[1];
  let channelName = 'Channel YouTube';
  if (authorRaw) try { channelName = JSON.parse(`"${authorRaw}"`); } catch { channelName = authorRaw; }
  return { isLive: /"isLiveNow"\s*:\s*true/.test(html), channelName };
}

async function updateYouTubeViewers(source) {
  if (!source.liveId || !connections.has(source.id)) return;
  try {
    const html = await fetchYouTubeHtml(source.liveId);
    const identity = readYouTubeIdentity(html);
    const nextLabel = `YouTube Live · ${identity.channelName}`;
    if (source.label !== nextLabel) { source.label = nextLabel; publishSources(); }
    const viewerMatch = html.match(/"concurrentViewers"\s*:\s*"(\d+)"/)
      || html.match(/\\"concurrentViewers\\"\s*:\s*\\"(\d+)\\"/)
      || html.match(/"videoViewCountRenderer"\s*:\s*\{[\s\S]{0,1000}?"originalViewCount"\s*:\s*"(\d+)"/)
      || html.match(/"originalViewCount"\s*:\s*"(\d+)"/);
    const rollingViewers = parseYouTubeRollingNumber(html);
    const likeMatch = html.match(/"likeCount"\s*:\s*"(\d+)"/)
      || html.match(/"label"\s*:\s*"([\d.,KMkm]+)\s+(?:likes?|suka)"/i)
      || html.match(/\\"label\\"\s*:\s*\\"([\d.,]+)\s+(?:likes?|suka)\\"/i);
    const updates = {};
    if (viewerMatch) updates.viewers = Number(viewerMatch[1]);
    else if (rollingViewers !== null) updates.viewers = rollingViewers;
    if (likeMatch) updates.likes = parsePublicCount(likeMatch[1]);
    if (Object.keys(updates).length) publishStats(source, updates);
  } catch {
    // Keep the last valid value; YouTube may temporarily throttle page requests.
  }
}

// YouTube sometimes renders the viewer count as vertically shifted characters.
// Each 20px step selects one child; digits repeat after 0 for a smooth animation.
function parseYouTubeRollingNumber(html) {
  const host = html.match(/<yt-animated-rolling-number\b[^>]*>[\s\S]*?<\/yt-animated-rolling-number>/i)?.[0];
  if (!host) return null;
  const chars = [...host.matchAll(/<animated-rolling-character\b[^>]*style="[^"]*margin-top:\s*(-?\d+(?:\.\d+)?)px[^"]*"[^>]*>([\s\S]*?)<\/animated-rolling-character>/gi)];
  if (!chars.length) return null;
  const value = chars.map(([, offset, body]) => {
    const items = [...body.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/gi)].map(x => x[1].replace(/<[^>]+>/g, '').replace(/&nbsp;|&#160;/gi, ' ').trim());
    const index = Math.round(Math.abs(Number(offset)) / 20);
    return items[index] ?? '';
  }).join('');
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) : null;
}

function parsePublicCount(input) {
  const value = String(input || '').trim().toUpperCase().replace(/\s/g, '');
  const suffix = value.endsWith('K') ? 1e3 : value.endsWith('M') ? 1e6 : 1;
  const number = Number(value.replace(/[KM]$/, '').replace(/(?<=\d)[.,](?=\d{3}(?:\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(number) ? Math.round(number * suffix) : 0;
}

async function updateTwitchViewers(source) {
  if (!connections.has(source.id)) return;
  try {
    const response = await fetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: { 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'query($login:String!){user(login:$login){stream{viewersCount}}}', variables: { login: source.channel } })
    });
    const payload = await response.json();
    const viewers = payload?.data?.user?.stream?.viewersCount;
    publishStats(source, { viewers: Number.isFinite(viewers) ? viewers : 0 });
  } catch {
    // Keep the last valid value when Twitch temporarily rejects the public request.
  }
}

async function connectTikTok(target) {
  const username = cleanTikTokTarget(target);
  if (!username) throw new Error('Masukkan username TikTok.');
  const source = { id: `tiktok:${username.toLowerCase()}`, platform: 'tiktok', label: `@${username}`, stats: { viewers: null, likes: 0 } };
  if (connections.has(source.id)) throw new Error('TikTok ini sudah terhubung.');
  const client = new TikTokLiveConnection(username, { processInitialData: true, fetchRoomInfoOnConnect: true });
  let stopped = false;
  source.stop = async () => { stopped = true; try { await client.disconnect(); } catch {} };
  connections.set(source.id, source);

  client.on(WebcastEvent.CHAT, data => {
    const comment = data.comment || data.content || '';
    const emotes = (data.emotes || []).map(item => item.emote || item).map(emote => ({
      type: 'image',
      url: emote.image?.urlList?.[0] || emote.image?.url?.[0] || emote.emoteImageUrl || '',
      alt: emote.uuid || emote.emoteId || 'emote'
    })).filter(part => part.url);
    send('live:chat', sourceData(source, { ...normalizeTikTokUser(data.user), comment, parts: [{ type: 'text', text: comment }, ...emotes] }));
  });
  client.on(WebcastEvent.EMOTE, data => {
    const parts = (data.emoteList || data.emotes || []).map(item => item.emote || item).map(emote => ({
      type: 'image', url: emote.image?.urlList?.[0] || emote.image?.url?.[0] || emote.emoteImageUrl || '', alt: emote.uuid || emote.emoteId || 'emote'
    })).filter(part => part.url);
    if (parts.length) send('live:chat', sourceData(source, { ...normalizeTikTokUser(data.user), comment: 'Emote', parts }));
  });
  client.on(WebcastEvent.MEMBER, data => send('live:member', sourceData(source, normalizeTikTokUser(data.user))));
  client.on(WebcastEvent.ROOM_USER, data => {
    const ranks = data.ranksList ?? data.ranks ?? data.topViewers ?? [];
    publishStats(source, { viewers: Number(data.viewerCount ?? data.total ?? 0), topViewers: ranks.slice(0, 3).map(item => normalizeTikTokUser(item.user || item)) });
  });
  client.on(WebcastEvent.LIKE, data => publishStats(source, { likes: Number(data.totalLikeCount || data.total || 0) }));
  client.on(WebcastEvent.GIFT, data => {
    const giftType = data.giftDetails?.giftType ?? data.gift?.type;
    if (giftType === 1 && !data.repeatEnd) return;
    send('live:activity', sourceData(source, { type: 'gift', ...normalizeTikTokUser(data.user), giftName: data.giftDetails?.giftName || data.gift?.name || 'Gift', amount: Number(data.repeatCount || data.comboCount || 1), image: data.giftDetails?.giftPictureUrl || data.gift?.image?.urlList?.[0] || '' }));
  });
  client.on(WebcastEvent.SHARE, data => send('live:activity', sourceData(source, { type: 'share', ...normalizeTikTokUser(data.user) })));
  client.on(WebcastEvent.FOLLOW, data => send('live:activity', sourceData(source, { type: 'follow', ...normalizeTikTokUser(data.user) })));
  client.on(WebcastEvent.STREAM_END, () => removeSource(source.id, 'LIVE TikTok selesai'));
  client.on(ControlEvent.DISCONNECTED, () => { if (!stopped) removeSource(source.id, 'TikTok terputus'); });

  try { await client.connect(); } catch (error) { connections.delete(source.id); throw error; }
  return source;
}

async function connectYouTube(target) {
  const options = youtubeOptions(target);
  let identity = null;
  if (options.liveId) {
    identity = readYouTubeIdentity(await fetchYouTubeHtml(options.liveId));
    if (!identity.isLive) throw new Error('Video YouTube ini tidak sedang LIVE. Masukkan URL siaran YouTube Live yang aktif.');
  }
  const label = `YouTube Live · ${identity?.channelName || 'menghubungkan…'}`;
  const id = `youtube:${options.liveId || options.channelId}`;
  if (connections.has(id)) throw new Error('YouTube LIVE ini sudah terhubung.');
  const source = { id, platform: 'youtube', label, stats: { viewers: null }, liveId: options.liveId || null };
  const client = new LiveChat(options);
  source.stop = async () => { clearInterval(source.poller); client.stop(); };
  connections.set(id, source);
  client.on('start', liveId => {
    source.liveId = liveId; publishSources();
    updateYouTubeViewers(source);
    source.poller = setInterval(() => updateYouTubeViewers(source), 10000);
  });
  client.on('chat', item => {
    const user = { username: item.author?.channelId || 'youtube-user', nickname: item.author?.name || 'Penonton YouTube', avatar: item.author?.thumbnail?.url || '' };
    const parts = (item.message || []).map(part => part.url
      ? { type: 'image', url: part.url, alt: part.alt || part.emojiText || 'emoji' }
      : { type: 'text', text: part.text || '' });
    const comment = (item.message || []).map(part => part.text ?? part.emojiText ?? part.alt ?? '').join('');
    if (item.superchat) send('live:activity', sourceData(source, { type: 'superchat', ...user, amountText: item.superchat.amount, comment, parts, stickerUrl: item.superchat.sticker?.url || '' }));
    else if (item.isMembership) send('live:activity', sourceData(source, { type: 'membership', ...user, comment, parts }));
    else send('live:chat', sourceData(source, { ...user, comment: comment || 'Emoji', parts }));
  });
  client.on('end', reason => removeSource(id, reason || 'YouTube LIVE selesai'));
  client.on('error', error => send('source:error', sourceData(source, { error: String(error?.message || error) })));
  const ok = await client.start();
  if (!ok) { connections.delete(id); throw new Error('YouTube LIVE tidak ditemukan atau chat dinonaktifkan.'); }
  return source;
}

async function connectTwitch(target) {
  const channel = cleanTwitchTarget(target);
  if (!channel) throw new Error('Masukkan nama channel atau URL Twitch.');
  const source = { id: `twitch:${channel}`, platform: 'twitch', label: `#${channel}`, channel, stats: { viewers: null } };
  if (connections.has(source.id)) throw new Error('Channel Twitch ini sudah terhubung.');
  const client = new tmi.Client({ connection: { secure: true, reconnect: true }, channels: [channel] });
  source.stop = async () => { clearInterval(source.poller); try { await client.disconnect(); } catch {} };
  connections.set(source.id, source);
  client.on('message', (_channel, tags, message, self) => {
    if (self) return;
    send('live:chat', sourceData(source, { username: tags.username || 'twitch-user', nickname: tags['display-name'] || tags.username || 'Penonton Twitch', avatar: '', comment: message }));
  });
  client.on('cheer', (_channel, tags, message) => send('live:activity', sourceData(source, { type: 'cheer', username: tags.username || '', nickname: tags['display-name'] || tags.username || 'Penonton Twitch', avatar: '', amountText: `${tags.bits || 0} Bits`, comment: message })));
  client.on('subscription', (_channel, username) => send('live:activity', sourceData(source, { type: 'subscription', username, nickname: username, avatar: '' })));
  try { await client.connect(); } catch (error) { connections.delete(source.id); throw error; }
  updateTwitchViewers(source);
  source.poller = setInterval(() => updateTwitchViewers(source), 15000);
  return source;
}

async function removeSource(id, reason) {
  const source = connections.get(id);
  if (!source) return;
  connections.delete(id);
  try { await source.stop?.(); } catch {}
  publishSources();
  if (reason) send('source:notice', { text: `${source.label}: ${reason}` });
}

async function disconnectAll() {
  await Promise.all([...connections.keys()].map(id => removeSource(id)));
}

ipcMain.handle('source:connect', async (_event, { platform, target }) => {
  try {
    const connector = { tiktok: connectTikTok, youtube: connectYouTube, twitch: connectTwitch }[platform];
    if (!connector) throw new Error('Platform belum didukung.');
    const source = await connector(target);
    publishSources();
    return { ok: true, source: { id: source.id, platform: source.platform, label: source.label } };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});
ipcMain.handle('source:disconnect', (_event, id) => removeSource(id));
ipcMain.handle('source:disconnect-all', disconnectAll);
ipcMain.handle('mobile:info', () => mobileInfo);
ipcMain.on('window:close', () => win?.close());
ipcMain.on('window:minimize', () => { manualMinimize = true; win?.minimize(); });
ipcMain.on('window:click-through', (_e, enabled) => setClickThrough(enabled));
ipcMain.on('window:top', (_e, enabled) => {
  alwaysOnTopEnabled = Boolean(enabled);
  win?.setAlwaysOnTop(alwaysOnTopEnabled, alwaysOnTopEnabled ? 'screen-saver' : 'normal');
  if (alwaysOnTopEnabled) reinforceOverlay();
});
ipcMain.on('window:size', (_e, preset) => setWindowSize(preset));

app.whenReady().then(() => {
  startMobileServer(); createWindow();
  globalShortcut.register('CommandOrControl+Shift+X', () => setClickThrough(!clickThrough));
  globalShortcut.register('CommandOrControl+Shift+O', reinforceOverlay);
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { disconnectAll(); if (process.platform !== 'darwin') app.quit(); });
