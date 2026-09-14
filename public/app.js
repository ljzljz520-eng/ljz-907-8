const $ = s => document.querySelector(s);
const CAT_COLORS = {
  '种植': 'tag-green', '养殖': 'tag-blue',
  '病虫害': 'tag-red', '农机操作': 'tag-orange',
};

async function loadFilters() {
  const r = await fetch('/api/filters');
  const { crops } = await r.json();
  $('#f-crop').innerHTML = '<option value="">全部作物</option>' +
    crops.map(c => `<option value="${esc(c.crop)}">${esc(c.crop)}（${c.count}）</option>`).join('');
}

async function loadList() {
  const p = new URLSearchParams();
  const cat = $('#f-category').value, crop = $('#f-crop').value;
  const season = $('#f-season').value, q = $('#f-q').value.trim();
  if (cat) p.set('category', cat);
  if (crop) p.set('crop', crop);
  if (season) p.set('season', season);
  if (q) p.set('q', q);

  $('#grid').innerHTML = '<div class="loading">加载中…</div>';
  const r = await fetch('/api/videos?' + p.toString());
  const { list } = await r.json();
  $('#meta').textContent = `共找到 ${list.length} 个视频`;

  if (!list.length) {
    $('#grid').innerHTML = '<div class="empty">没有符合条件的视频，试试调整筛选条件</div>';
    return;
  }
  $('#grid').innerHTML = list.map(cardHtml).join('');
  document.querySelectorAll('.card-video').forEach(el => {
    el.addEventListener('click', () => openDetail(el.dataset.id));
  });
}

function cardHtml(v) {
  const seasons = (v.seasons || '').split(',').filter(Boolean)
    .map(s => `<span class="tag tag-season">${esc(s)}</span>`).join('');
  return `
  <article class="card card-video" data-id="${v.id}">
    <div class="thumb">
      <span class="play">▶</span>
      <span class="tag tag-cat ${CAT_COLORS[v.category] || ''}">${esc(v.category)}</span>
      ${v.duration ? `<span class="dur">${fmtDuration(v.duration)}</span>` : ''}
    </div>
    <div class="card-body">
      <h3 title="${esc(v.title)}">${esc(v.title)}</h3>
      <div class="tags">${seasons}</div>
      <p class="crop-line">📌 ${esc(v.crop)} · ${esc(v.region || '未标注地区')}</p>
      ${v.source ? `<p class="source">来源：${esc(v.source)}</p>` : ''}
    </div>
  </article>`;
}

async function openDetail(id) {
  $('#modal-mask').hidden = false;
  $('#modal-body').innerHTML = '<div class="loading">加载中…</div>';
  const r = await fetch('/api/videos/' + id);
  if (!r.ok) {
    $('#modal-body').innerHTML = '<div class="empty">视频不存在或已下架</div>';
    return;
  }
  const v = await r.json();
  const seasons = (v.seasons || '').split(',').filter(Boolean)
    .map(s => `<span class="tag tag-season">${esc(s)}季</span>`).join('') || '全年';
  $('#modal-body').innerHTML = `
    <h2>${esc(v.title)}</h2>
    <div class="detail-meta">
      <span class="tag tag-cat ${CAT_COLORS[v.category] || ''}">${esc(v.category)}</span>
      ${seasons}
      ${v.duration ? `<span class="muted">时长 ${fmtDuration(v.duration)}</span>` : ''}
    </div>
    <video controls preload="none" src="${esc(v.url)}"></video>
    <dl class="detail-list">
      <dt>作物 / 养殖对象</dt><dd>${esc(v.crop)}</dd>
      <dt>适用地区</dt><dd>📍 ${esc(v.region || '未标注')}</dd>
      <dt>注意事项</dt>
      <dd class="precautions">${esc(v.precautions || '暂无')}</dd>
      ${v.description ? `<dt>内容简介</dt><dd>${esc(v.description)}</dd>` : ''}
      ${v.source ? `<dt>来源 / 讲师</dt><dd>${esc(v.source)}</dd>` : ''}
    </dl>
    <a class="btn btn-primary ext-link" href="${esc(v.url)}" target="_blank" rel="noopener">前往观看原视频 ↗</a>`;
}

function fmtDuration(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

$('#btn-search').addEventListener('click', loadList);
$('#btn-reset').addEventListener('click', () => {
  $('#f-category').value = ''; $('#f-crop').value = '';
  $('#f-season').value = ''; $('#f-q').value = '';
  loadList();
});
$('#f-q').addEventListener('keydown', e => { if (e.key === 'Enter') loadList(); });
$('#modal-close').addEventListener('click', () => $('#modal-mask').hidden = true);
$('#modal-mask').addEventListener('click', e => {
  if (e.target.id === 'modal-mask') $('#modal-mask').hidden = true;
});

loadFilters().then(loadList);
