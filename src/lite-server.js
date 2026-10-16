import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { LiveChat } from 'youtube-chat';
import tmi from 'tmi.js';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'mobile');
const clients = new Set(), sources = new Map();
const port = Number(process.env.OVERLAY_PORT || 19876);
const token = process.env.OVERLAY_TOKEN || 'lite';
const send = (channel, payload) => { const message = JSON.stringify({ channel, payload }); for (const socket of clients) if (socket.readyState === 1) socket.send(message); };
const publicSources = () => [...sources.values()].map(({ id, platform, label, stats }) => ({ id, platform, label, stats }));
const publish = () => send('sources:update', publicSources());
const data = (s, extra = {}) => ({ sourceId: s.id, platform: s.platform, sourceLabel: s.label, ...extra });
const stats = (s, update) => { s.stats = { ...s.stats, ...update }; send('live:stats', data(s, s.stats)); };
const user = (u = {}) => ({ username: u.uniqueId || u.displayId || 'penonton', nickname: u.nickname || u.uniqueId || u.displayId || 'Penonton', avatar: u.profilePicture?.urlList?.[0] || u.avatarThumb?.urlList?.[0] || '' });
const localIp = () => Object.values(networkInterfaces()).flat().find(x => x?.family === 'IPv4' && !x.internal)?.address || '127.0.0.1';

function youtubeOptions(value) {
  for (const re of [/youtu\.be\/([\w-]{11})/, /[?&]v=([\w-]{11})/, /youtube\.com\/live\/([\w-]{11})/]) { const m = value.match(re); if (m) return { liveId: m[1] }; }
  if (/^UC[\w-]+$/.test(value)) return { channelId: value };
  if (/^[\w-]{11}$/.test(value)) return { liveId: value };
  throw new Error('URL/ID YouTube tidak valid');
}
async function fetchYouTubeHtml(id) {
  const response = await fetch(`https://www.youtube.com/watch?v=${id}&hl=en&gl=US`, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9' } });
  if (!response.ok) throw new Error(`YouTube HTTP ${response.status}`); return response.text();
}
function readYouTubeIdentity(html) {
  const raw = html.match(/"videoDetails"\s*:\s*\{[\s\S]{0,5000}?"author"\s*:\s*"((?:\\.|[^"\\])*)"/)?.[1] || html.match(/"author"\s*:\s*"((?:\\.|[^"\\])*)"/)?.[1]; let channelName = 'Channel YouTube';
  if (raw) try { channelName = JSON.parse(`"${raw}"`); } catch { channelName = raw; }
  return { isLive: /"isLiveNow"\s*:\s*true/.test(html), channelName };
}
async function ytStats(s) {
  if (!s.liveId || !sources.has(s.id)) return;
  try { const html = await fetchYouTubeHtml(s.liveId); const identity = readYouTubeIdentity(html); const label = `YouTube Live · ${identity.channelName}`; if (s.label !== label) { s.label = label; publish(); } const v = html.match(/"concurrentViewers"\s*:\s*"(\d+)"/) || html.match(/"videoViewCountRenderer"\s*:\s*\{[\s\S]{0,1000}?"originalViewCount"\s*:\s*"(\d+)"/) || html.match(/"originalViewCount"\s*:\s*"(\d+)"/), l = html.match(/"likeCount"\s*:\s*"(\d+)"/); const rolling = parseYouTubeRollingNumber(html); stats(s, { ...(v ? { viewers: Number(v[1]) } : rolling !== null ? { viewers: rolling } : {}), ...(l && { likes: Number(l[1]) }) }); } catch {}
}
function parseYouTubeRollingNumber(html) {
  const host = html.match(/<yt-animated-rolling-number\b[^>]*>[\s\S]*?<\/yt-animated-rolling-number>/i)?.[0]; if (!host) return null;
  const chars = [...host.matchAll(/<animated-rolling-character\b[^>]*style="[^"]*margin-top:\s*(-?\d+(?:\.\d+)?)px[^"]*"[^>]*>([\s\S]*?)<\/animated-rolling-character>/gi)]; if (!chars.length) return null;
  const value = chars.map(([, offset, body]) => { const items = [...body.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/gi)].map(x => x[1].replace(/<[^>]+>/g, '').replace(/&nbsp;|&#160;/gi, ' ').trim()); return items[Math.round(Math.abs(Number(offset)) / 20)] ?? ''; }).join('');
  const digits = value.replace(/\D/g, ''); return digits ? Number(digits) : null;
}
async function twitchStats(s) {
  try { const response = await fetch('https://gql.twitch.tv/gql', { method: 'POST', headers: { 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'query($login:String!){user(login:$login){stream{viewersCount}}}', variables: { login: s.channel } }) }); const n = (await response.json())?.data?.user?.stream?.viewersCount; stats(s, { viewers: Number.isFinite(n) ? n : 0 }); } catch {}
}
async function addTikTok(target) {
  const name = target.trim().replace(/^@/, '').replace(/^https?:\/\/[^/]+\/@/, '').replace(/\/live.*$/, '');
  const s = { id: `tiktok:${name.toLowerCase()}`, platform: 'tiktok', label: `@${name}`, stats: { viewers: null, likes: 0 } }; if (sources.has(s.id)) return;
  const c = new TikTokLiveConnection(name, { processInitialData: true, fetchRoomInfoOnConnect: true }); s.stop = () => c.disconnect(); sources.set(s.id, s);
  c.on(WebcastEvent.CHAT, x => send('live:chat', data(s, { ...user(x.user), comment: x.comment || x.content || '' })));
  c.on(WebcastEvent.MEMBER, x => send('live:member', data(s, user(x.user)))); c.on(WebcastEvent.ROOM_USER, x => stats(s, { viewers: Number(x.viewerCount ?? x.total ?? 0) })); c.on(WebcastEvent.LIKE, x => stats(s, { likes: Number(x.totalLikeCount || x.total || 0) }));
  c.on(WebcastEvent.GIFT, x => { if ((x.giftDetails?.giftType ?? x.gift?.type) === 1 && !x.repeatEnd) return; send('live:activity', data(s, { type: 'gift', ...user(x.user), giftName: x.giftDetails?.giftName || x.gift?.name || 'Gift', amount: Number(x.repeatCount || 1), image: x.giftDetails?.giftPictureUrl || '' })); });
  c.on(WebcastEvent.SHARE, x => send('live:activity', data(s, { type: 'share', ...user(x.user) }))); c.on(WebcastEvent.FOLLOW, x => send('live:activity', data(s, { type: 'follow', ...user(x.user) }))); c.on(ControlEvent.DISCONNECTED, () => remove(s.id));
  try { await c.connect(); publish(); } catch (e) { sources.delete(s.id); throw e; }
}
async function addYouTube(target) {
  const opts = youtubeOptions(target.trim()), key = opts.liveId || opts.channelId; let identity = null; if (opts.liveId) { identity = readYouTubeIdentity(await fetchYouTubeHtml(opts.liveId)); if (!identity.isLive) throw new Error('Video YouTube ini tidak sedang LIVE'); } const s = { id: `youtube:${key}`, platform: 'youtube', label: `YouTube Live · ${identity?.channelName || 'menghubungkan…'}`, liveId: opts.liveId, stats: { viewers: null, likes: null } }; if (sources.has(s.id)) return;
  const c = new LiveChat(opts); s.stop = () => { clearInterval(s.timer); c.stop(); }; sources.set(s.id, s);
  c.on('start', id => { s.liveId = id; ytStats(s); s.timer = setInterval(() => ytStats(s), 10000); publish(); });
  c.on('chat', x => { const u = { username: x.author?.channelId || 'youtube-user', nickname: x.author?.name || 'Penonton YouTube', avatar: x.author?.thumbnail?.url || '' }; const parts = (x.message || []).map(p => p.url ? { type: 'image', url: p.url, alt: p.alt || 'emoji' } : { type: 'text', text: p.text || '' }); const comment = parts.map(p => p.text || '').join(''); send(x.superchat || x.isMembership ? 'live:activity' : 'live:chat', data(s, { ...u, type: x.superchat ? 'superchat' : x.isMembership ? 'membership' : undefined, amountText: x.superchat?.amount, stickerUrl: x.superchat?.sticker?.url || '', comment, parts })); });
  c.on('end', () => remove(s.id)); if (!await c.start()) { sources.delete(s.id); throw new Error('YouTube LIVE tidak ditemukan'); }
}
async function addTwitch(target) {
  const channel = target.trim().replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '').split(/[/?#]/)[0].toLowerCase(); const s = { id: `twitch:${channel}`, platform: 'twitch', label: `#${channel}`, channel, stats: { viewers: null } }; if (sources.has(s.id)) return;
  const c = new tmi.Client({ connection: { secure: true, reconnect: true }, channels: [channel] }); s.stop = () => { clearInterval(s.timer); return c.disconnect(); }; sources.set(s.id, s);
  c.on('message', (_c, tags, message, self) => { if (!self) send('live:chat', data(s, { username: tags.username, nickname: tags['display-name'] || tags.username, avatar: '', comment: message })); }); await c.connect(); await twitchStats(s); s.timer = setInterval(() => twitchStats(s), 15000); publish();
}
async function remove(id) { const s = sources.get(id); if (!s) return; sources.delete(id); try { await s.stop?.(); } catch {} publish(); }
const add = (platform, target) => ({ tiktok: addTikTok, youtube: addYouTube, twitch: addTwitch }[platform]?.(target) ?? Promise.reject(new Error('Platform tidak didukung')));

const server = createServer(async (req, res) => {
  try { const url = new URL(req.url, 'http://localhost'); if (url.pathname === '/api/sources') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(publicSources())); return; }
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1), allowed = new Set(['index.html', 'app.js', 'mobile.css', 'manifest.json', 'icon.svg']); if (!allowed.has(file)) { res.writeHead(404); res.end('Not found'); return; }
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }[path.extname(file)]; res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8`, 'Cache-Control': 'no-cache' }); res.end(await readFile(path.join(root, file)));
  } catch { res.writeHead(500); res.end('Server error'); }
});
const wss = new WebSocketServer({ server, path: '/ws' }); wss.on('connection', (socket, request) => { if (new URL(request.url, 'http://localhost').searchParams.get('token') !== token) return socket.close(1008, 'Token salah'); clients.add(socket); socket.send(JSON.stringify({ channel: 'sources:update', payload: publicSources() })); socket.on('close', () => clients.delete(socket)); });
server.listen(port, '0.0.0.0', async () => { console.log(`Multi Live Chat Lite: http://${localIp()}:${port}/?token=${encodeURIComponent(token)}`); const args = process.argv.slice(2); for (let i = 0; i < args.length; i += 2) { const platform = args[i]?.replace(/^--/, ''), target = args[i + 1]; if (target) try { await add(platform, target); console.log(`${platform}: ${target} terhubung`); } catch (e) { console.error(`${platform}: ${e.message}`); } } console.log(`RAM: ${Math.round(process.memoryUsage().rss / 1048576)} MB`); });
process.on('SIGINT', async () => { await Promise.all([...sources.keys()].map(remove)); server.close(() => process.exit()); });
