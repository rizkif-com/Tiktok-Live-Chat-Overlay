const $ = selector => document.querySelector(selector);
let total = 0;
let startedAt = 0;
let timer;
let activeSources = [];

const format = value => new Intl.NumberFormat('id-ID', { notation: value >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value || 0);
const platformName = { tiktok: 'TikTok', youtube: 'YouTube', twitch: 'Twitch' };

function avatar(data, url = data.avatar) {
  return url
    ? Object.assign(document.createElement('img'), { className: 'avatar', src: url, alt: '' })
    : Object.assign(document.createElement('div'), { className: 'avatar', textContent: (data.nickname || data.username || '?')[0].toUpperCase() });
}

function badge(platform) {
  const element = document.createElement('span');
  element.className = `platform-badge ${platform}`;
  element.textContent = platformName[platform] || platform;
  return element;
}

function trimFeed() {
  while ($('#feed').children.length > 60) $('#feed').firstElementChild.remove();
  $('#feed').scrollTop = $('#feed').scrollHeight;
}

function richText(parts, fallback) {
  const container = document.createElement('div');
  container.className = 'rich-text';
  const usable = Array.isArray(parts) && parts.length ? parts : [{ type: 'text', text: fallback || '' }];
  usable.forEach(part => {
    if (part.type === 'image' && part.url) {
      const image = document.createElement('img');
      image.className = 'chat-emoji'; image.src = part.url; image.alt = part.alt || 'emoji'; image.title = part.alt || '';
      container.append(image);
    } else if (part.text) container.append(document.createTextNode(part.text));
  });
  return container;
}

function ensureTimer(active) {
  clearInterval(timer);
  if (!active) { $('#duration').textContent = '00:00:00'; return; }
  if (!startedAt) startedAt = Date.now();
  const tick = () => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    $('#duration').textContent = [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(value => String(value).padStart(2, '0')).join(':');
  };
  tick(); timer = setInterval(tick, 1000);
}

function renderPlatformStats() {
  const container = $('#platform-stats');
  container.replaceChildren(...activeSources.map(source => {
    const card = document.createElement('div'); card.className = `stat-card ${source.platform}`; card.dataset.sourceId = source.id;
    const title = document.createElement('strong'); title.textContent = `${platformName[source.platform]} · ${source.label}`;
    const values = document.createElement('div'); values.className = 'stat-values';
    const viewers = document.createElement('span'); viewers.title = 'Penonton aktif saat ini'; viewers.append('👁 ');
    const viewerValue = document.createElement('b'); viewerValue.textContent = Number.isFinite(source.stats?.viewers) ? format(source.stats.viewers) : '—'; viewers.append(viewerValue);
    values.append(viewers);
    if (source.platform === 'tiktok' || source.platform === 'youtube') {
      const likes = document.createElement('span'); likes.title = 'Total like'; likes.append('♥ ');
      const likeValue = document.createElement('b'); likeValue.textContent = Number.isFinite(source.stats?.likes) ? format(source.stats.likes) : '—'; likes.append(likeValue); values.append(likes);
    }
    card.append(title, values); return card;
  }));
  container.hidden = activeSources.length === 0;
}

function addChat(data) {
  if (!data.comment) return;
  $('#empty')?.remove();
  const item = document.createElement('article');
  item.className = 'entry multi';
  const body = document.createElement('div'); body.className = 'body';
  const name = document.createElement('div'); name.className = 'name';
  const strong = document.createElement('b'); strong.textContent = data.nickname;
  const handle = document.createElement('span'); handle.textContent = data.username ? `@${data.username}` : '';
  name.append(strong, handle); body.append(name, richText(data.parts, data.comment)); item.append(avatar(data), body, badge(data.platform));
  $('#feed').append(item); total += 1; $('#count').textContent = `${total} komentar`; trimFeed();
}

function addActivity(data) {
  if (!data.nickname) return;
  $('#empty')?.remove();
  const item = document.createElement('article'); item.className = `entry activity multi ${data.type}`;
  const body = document.createElement('div'); body.className = 'body';
  const text = document.createElement('p'); text.className = 'text';
  const messages = {
    gift: `${data.nickname} mengirim ${data.giftName} ×${data.amount}`,
    share: `${data.nickname} membagikan LIVE`,
    follow: `${data.nickname} mulai mengikuti host`,
    superchat: `${data.nickname} mengirim Super Chat ${data.amountText}`,
    membership: `${data.nickname} menjadi member`,
    cheer: `${data.nickname} mengirim ${data.amountText}${data.comment ? ` — ${data.comment}` : ''}`,
    subscription: `${data.nickname} berlangganan channel`
  };
  text.textContent = messages[data.type] || `${data.nickname}: ${data.comment || data.type}`;
  body.append(text);
  if (data.parts?.length) body.append(richText(data.parts, data.comment));
  if (data.stickerUrl) {
    const sticker = document.createElement('img'); sticker.className = 'super-sticker'; sticker.src = data.stickerUrl; sticker.alt = 'Super Sticker'; body.append(sticker);
  }
  item.append(avatar(data, data.image || data.avatar), body, badge(data.platform));
  $('#feed').append(item); trimFeed();
}

$('#platform').addEventListener('change', event => {
  const hints = { tiktok: 'Username atau URL TikTok LIVE', youtube: 'URL LIVE, video ID, atau channel ID', twitch: 'Nama channel atau URL Twitch' };
  $('#target').placeholder = hints[event.target.value];
});

$('#form').addEventListener('submit', async event => {
  event.preventDefault(); $('#error').textContent = ''; $('#connect').disabled = true;
  const result = await window.overlay.connect($('#platform').value, $('#target').value);
  $('#connect').disabled = false;
  if (!result.ok) $('#error').textContent = result.error;
  else { $('#target').value = ''; $('#setup').classList.add('collapsed'); }
});

window.overlay.onSources(sources => {
  activeSources = sources;
  const container = $('#sources');
  container.replaceChildren(...sources.map(source => {
    const pill = document.createElement('div'); pill.className = `source-pill ${source.platform}`;
    const text = document.createElement('span'); text.textContent = `${platformName[source.platform]} · ${source.label}`;
    const close = document.createElement('button'); close.textContent = '×'; close.title = 'Putuskan sumber'; close.onclick = () => window.overlay.disconnect(source.id);
    pill.append(text, close); return pill;
  }));
  const active = sources.length > 0;
  const status = $('#status'); status.className = `status ${active ? 'connected' : 'idle'}`;
  status.querySelector('span').textContent = active ? `${sources.length} stream aktif` : 'Belum ada stream';
  $('#disconnect-all').hidden = !active;
  if (!active) { startedAt = 0; $('#top').hidden = true; }
  renderPlatformStats();
  ensureTimer(active);
});

window.overlay.onChat(addChat);
window.overlay.onActivity(addActivity);
window.overlay.onMember(data => {
  const box = $('#join'), element = $('#join-avatar');
  $('#join-name').textContent = `${data.nickname} · TikTok`;
  element.replaceChildren();
  if (data.avatar) { const image = document.createElement('img'); image.src = data.avatar; element.append(image); }
  else element.textContent = (data.nickname || '?')[0].toUpperCase();
  box.hidden = false; box.style.animation = 'none'; requestAnimationFrame(() => box.style.animation = '');
});
window.overlay.onStats(data => {
  const source = activeSources.find(item => item.id === data.sourceId);
  if (source) { source.stats = { ...source.stats, viewers: data.viewers, likes: data.likes }; renderPlatformStats(); }
  if (data.topViewers?.length) {
    $('#top').querySelector('label').textContent = `TOP VIEWERS · ${data.sourceLabel}`;
    $('#top-list').replaceChildren(...data.topViewers.map(viewer => { const chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = viewer.nickname || `@${viewer.username}`; return chip; }));
    $('#top').hidden = false;
  }
});
window.overlay.onSourceError(data => { $('#error').textContent = `${platformName[data.platform]}: ${data.error}`; });
window.overlay.onNotice(data => { $('#error').textContent = data.text; });

$('#gear').onclick = () => $('#settings').hidden = !$('#settings').hidden;
$('#setup-toggle').onclick = () => $('#setup').classList.toggle('collapsed');
async function showMobileInfo(info) { if (info?.url) $('#mobile-url').textContent = info.url; }
window.overlay.getMobileInfo().then(showMobileInfo);
window.overlay.onMobileInfo(showMobileInfo);
$('#copy-mobile-url').onclick = async () => { try { await navigator.clipboard.writeText($('#mobile-url').textContent); $('#copy-mobile-url').textContent = 'Disalin'; setTimeout(() => $('#copy-mobile-url').textContent = 'Salin link', 1200); } catch {} };
$('#settings-close').onclick = () => $('#settings').hidden = true;
$('#font').oninput = event => document.documentElement.style.setProperty('--size', `${event.target.value}px`);
$('#opacity').oninput = event => document.documentElement.style.setProperty('--opacity', event.target.value / 100);
$('#topmost').onchange = event => window.overlay.alwaysOnTop(event.target.checked);
$('#passthrough').onchange = event => window.overlay.clickThrough(event.target.checked);
document.querySelectorAll('[data-size]').forEach(button => button.onclick = () => window.overlay.setSize(button.dataset.size));
window.overlay.onClickThroughState(enabled => { $('#passthrough').checked = enabled; document.body.classList.toggle('passthrough', enabled); if (enabled) $('#settings').hidden = true; });
$('#disconnect-all').onclick = () => window.overlay.disconnectAll();
$('#min').onclick = () => window.overlay.minimize();
$('#close').onclick = () => window.overlay.close();
