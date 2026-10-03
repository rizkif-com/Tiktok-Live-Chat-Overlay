import { app, BrowserWindow, ipcMain, screen, globalShortcut } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';

const here = path.dirname(fileURLToPath(import.meta.url));
let win;
let live;
let intentionalDisconnect = false;
let clickThrough = false;

const send = (channel, payload) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
};

function normalizeUser(user = {}) {
  const image = user.profilePicture || user.avatarThumb || user.avatarMedium || user.avatarLarge;
  return {
    username: user.uniqueId || user.displayId || user.display_id || 'penonton',
    nickname: user.nickname || user.uniqueId || user.displayId || 'Penonton',
    avatar: image?.urlList?.[0] || image?.url?.[0] || ''
  };
}

function createWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    width: 440, height: Math.min(760, area.height - 70),
    x: area.x + area.width - 475, y: area.y + 35,
    minWidth: 320, minHeight: 300,
    transparent: true, frame: false, resizable: true,
    alwaysOnTop: true, backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(here, 'index.html'));
}

function setClickThrough(enabled) {
  clickThrough = Boolean(enabled);
  win?.setIgnoreMouseEvents(clickThrough, { forward: true });
  send('window:click-through-state', clickThrough);
}

function setWindowSize(preset) {
  if (!win) return;
  const sizes = { small: [320, 420], medium: [440, 680], large: [560, 820] };
  const requested = sizes[preset] || sizes.medium;
  const area = screen.getDisplayMatching(win.getBounds()).workArea;
  const width = Math.min(requested[0], area.width);
  const height = Math.min(requested[1], area.height);
  win.setSize(width, height, true);
  const bounds = win.getBounds();
  win.setPosition(
    Math.min(Math.max(bounds.x, area.x), area.x + area.width - width),
    Math.min(Math.max(bounds.y, area.y), area.y + area.height - height),
    true
  );
}

async function disconnect() {
  intentionalDisconnect = true;
  const current = live;
  live = undefined;
  if (current) try { await current.disconnect(); } catch {}
  send('live:status', { state: 'idle', text: 'Terputus' });
}

function bindEvents(connection) {
  connection.on(WebcastEvent.CHAT, data => send('live:chat', {
    ...normalizeUser(data.user), comment: data.comment || data.content || ''
  }));

  connection.on(WebcastEvent.MEMBER, data => {
    send('live:member', normalizeUser(data.user));
  });

  connection.on(WebcastEvent.ROOM_USER, data => {
    // ROOM_USER is TikTok's periodic snapshot. `memberCount` is deliberately
    // not used because it can represent accumulated joins rather than current viewers.
    const currentViewers = data.viewerCount ?? data.total;
    const ranks = data.ranksList ?? data.ranks ?? data.topViewers ?? [];
    send('live:stats', {
      viewers: Number(currentViewers ?? 0),
      topViewers: ranks.slice(0, 3).map(item => normalizeUser(item.user || item)),
      updatedAt: Date.now()
    });
  });

  connection.on(WebcastEvent.LIKE, data => send('live:stats', {
    likes: Number(data.totalLikeCount || data.total || 0)
  }));

  connection.on(WebcastEvent.GIFT, data => {
    const giftType = data.giftDetails?.giftType ?? data.gift?.type;
    if (giftType === 1 && !data.repeatEnd) return;
    send('live:activity', {
      type: 'gift', ...normalizeUser(data.user),
      giftName: data.giftDetails?.giftName || data.gift?.name || 'Gift',
      amount: Number(data.repeatCount || data.comboCount || 1),
      image: data.giftDetails?.giftPictureUrl || data.gift?.image?.urlList?.[0] || data.gift?.icon?.urlList?.[0] || ''
    });
  });

  connection.on(WebcastEvent.SHARE, data => send('live:activity', {
    type: 'share', ...normalizeUser(data.user)
  }));
  connection.on(WebcastEvent.FOLLOW, data => send('live:activity', {
    type: 'follow', ...normalizeUser(data.user)
  }));
  connection.on(WebcastEvent.STREAM_END, () => send('live:status', {
    state: 'ended', text: 'LIVE telah selesai'
  }));
  connection.on(ControlEvent.DISCONNECTED, () => {
    if (!intentionalDisconnect) send('live:status', { state: 'error', text: 'Koneksi LIVE terputus' });
  });
  connection.on('error', error => send('live:debug', String(error?.message || error)));
}

ipcMain.handle('live:connect', async (_event, input) => {
  const username = String(input || '').trim().replace(/^https?:\/\/[^/]+\/@/, '').replace(/\/live.*$/, '').replace(/^@/, '');
  if (!username) return { ok: false, error: 'Masukkan username TikTok.' };
  await disconnect();
  intentionalDisconnect = false;
  send('live:status', { state: 'connecting', text: `Menghubungkan @${username}…` });
  const connection = new TikTokLiveConnection(username, { processInitialData: true, fetchRoomInfoOnConnect: true });
  live = connection;
  bindEvents(connection);
  try {
    const state = await connection.connect();
    send('live:status', { state: 'connected', text: `LIVE @${username}`, connectedAt: Date.now() });
    return { ok: true, roomId: state.roomId };
  } catch (error) {
    if (live === connection) live = undefined;
    const message = error?.message || 'Tidak dapat terhubung.';
    send('live:status', { state: 'error', text: message });
    return { ok: false, error: message };
  }
});

ipcMain.handle('live:disconnect', disconnect);
ipcMain.on('window:close', () => win?.close());
ipcMain.on('window:minimize', () => win?.minimize());
ipcMain.on('window:click-through', (_e, enabled) => setClickThrough(enabled));
ipcMain.on('window:top', (_e, enabled) => win?.setAlwaysOnTop(Boolean(enabled), enabled ? 'screen-saver' : 'normal'));
ipcMain.on('window:size', (_e, preset) => setWindowSize(preset));

app.whenReady().then(() => {
  createWindow();
  globalShortcut.register('CommandOrControl+Shift+X', () => setClickThrough(!clickThrough));
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { disconnect(); if (process.platform !== 'darwin') app.quit(); });
