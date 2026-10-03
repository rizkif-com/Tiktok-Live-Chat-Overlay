const $=s=>document.querySelector(s);let total=0,timer;
const format=n=>new Intl.NumberFormat('id-ID',{notation:n>=10000?'compact':'standard',maximumFractionDigits:1}).format(n||0);
function avatar(data,url=data.avatar){return url?Object.assign(document.createElement('img'),{className:'avatar',src:url,alt:''}):Object.assign(document.createElement('div'),{className:'avatar',textContent:(data.nickname||data.username||'?')[0].toUpperCase()})}
function trimFeed(){while($('#feed').children.length>150)$('#feed').firstElementChild.remove();$('#feed').scrollTop=$('#feed').scrollHeight}
function setStatus(data){const s=$('#status');s.className=`status ${data.state}`;s.querySelector('span').textContent=data.text;const connected=data.state==='connected';$('#disconnect').hidden=!connected;$('#connect').disabled=data.state==='connecting';$('#connect').textContent=data.state==='connecting'?'Menghubungkan…':'Hubungkan';if(!connected)$('#viewers').textContent='—';clearInterval(timer);if(connected){const start=data.connectedAt||Date.now(),tick=()=>{const n=Math.floor((Date.now()-start)/1000);$('#duration').textContent=[Math.floor(n/3600),Math.floor(n%3600/60),n%60].map(v=>String(v).padStart(2,'0')).join(':')};tick();timer=setInterval(tick,1000)}else $('#duration').textContent='00:00:00'}
$('#form').addEventListener('submit',async e=>{e.preventDefault();$('#error').textContent='';const result=await window.overlay.connect($('#username').value);if(!result.ok)$('#error').textContent=/offline|not live|isn't live/i.test(result.error)?'Akun ini sedang tidak LIVE atau LIVE tidak publik.':result.error});
window.overlay.onStatus(setStatus);
window.overlay.onChat(data=>{if(!data.comment)return;$('#empty')?.remove();const item=document.createElement('article');item.className='entry';const body=document.createElement('div');body.className='body';const name=document.createElement('div');name.className='name';const b=document.createElement('b');b.textContent=data.nickname;const handle=document.createElement('span');handle.textContent=`@${data.username}`;const p=document.createElement('p');p.className='text';p.textContent=data.comment;name.append(b,handle);body.append(name,p);item.append(avatar(data),body);$('#feed').append(item);total++;$('#count').textContent=`${total} komentar`;trimFeed()});
window.overlay.onMember(data=>{const box=$('#join'),a=$('#join-avatar');$('#join-name').textContent=data.nickname||`@${data.username}`;a.replaceChildren();if(data.avatar){const img=document.createElement('img');img.src=data.avatar;a.append(img)}else a.textContent=(data.nickname||data.username||'?')[0].toUpperCase();box.hidden=false;box.style.animation='none';requestAnimationFrame(()=>box.style.animation='')});
window.overlay.onStats(data=>{if(Number.isFinite(data.viewers))$('#viewers').textContent=format(data.viewers);if(Number.isFinite(data.likes))$('#likes').textContent=format(data.likes);if(data.topViewers?.length){const list=$('#top-list');list.replaceChildren(...data.topViewers.map(v=>{const x=document.createElement('span');x.className='chip';x.textContent=v.nickname||`@${v.username}`;return x}));$('#top').hidden=false}});
window.overlay.onActivity(data=>{if(!data.nickname)return;$('#empty')?.remove();const item=document.createElement('article');item.className=`entry activity ${data.type}`;const body=document.createElement('div');body.className='body';const p=document.createElement('p');p.className='text';if(data.type==='gift')p.textContent=`${data.nickname} mengirim ${data.giftName} ×${data.amount}`;if(data.type==='share')p.textContent=`${data.nickname} membagikan LIVE`;if(data.type==='follow')p.textContent=`${data.nickname} mulai mengikuti host`;body.append(p);item.append(avatar(data,data.image||data.avatar),body);$('#feed').append(item);trimFeed()});
$('#gear').onclick=()=>$('#settings').hidden=!$('#settings').hidden;
$('#settings-close').onclick=()=>$('#settings').hidden=true;
$('#font').oninput=e=>document.documentElement.style.setProperty('--size',`${e.target.value}px`);
$('#opacity').oninput=e=>document.documentElement.style.setProperty('--opacity',e.target.value/100);
$('#topmost').onchange=e=>window.overlay.alwaysOnTop(e.target.checked);
$('#passthrough').onchange=e=>window.overlay.clickThrough(e.target.checked);
document.querySelectorAll('[data-size]').forEach(button=>button.onclick=()=>window.overlay.setSize(button.dataset.size));
window.overlay.onClickThroughState(enabled=>{
  $('#passthrough').checked=enabled;
  document.body.classList.toggle('passthrough',enabled);
  if(enabled)$('#settings').hidden=true;
});
$('#disconnect').onclick=()=>window.overlay.disconnect();$('#min').onclick=()=>window.overlay.minimize();$('#close').onclick=()=>window.overlay.close();
