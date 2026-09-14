const $ = s => document.querySelector(s);

async function uploadCsv() {
  const file = $('#csv-file').files[0];
  const box = $('#import-result');
  if (!file) { alert('请先选择 CSV 文件'); return; }
  const fd = new FormData();
  fd.append('file', file);
  box.hidden = false;
  box.className = 'import-result info';
  box.textContent = '导入中，请稍候…';

  try {
    const r = await fetch('/api/admin/import', { method: 'POST', body: fd });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || '导入失败');

    const hasFail = data.fail > 0;
    box.className = 'import-result ' + (hasFail ? 'warn' : 'ok');
    box.innerHTML =
      `批次 #${data.batchId}：共 ${data.total} 行，成功 ${data.success} 行，失败 ${data.fail} 行。` +
      (hasFail
        ? ` <a href="${data.reportPath}" download>⬇ 下载错误报告</a>`
        : ' 全部导入成功！');
    loadBatches();
    loadVideos();
  } catch (e) {
    box.className = 'import-result err';
    box.textContent = '导入失败：' + e.message;
  }
}

async function loadBatches() {
  const r = await fetch('/api/admin/batches');
  const { list } = await r.json();
  $('#batch-body').innerHTML = list.length ? list.map(b => `
    <tr>
      <td>#${b.id}</td>
      <td>${esc(b.filename)}</td>
      <td>${b.total_rows}</td>
      <td class="num-ok">${b.success_count}</td>
      <td class="${b.fail_count ? 'num-err' : ''}">${b.fail_count}</td>
      <td>${b.imported_at}</td>
      <td>${b.report_path
        ? `<a href="${b.report_path}" download>⬇ 下载报告</a>`
        : '<span class="muted">—</span>'}</td>
    </tr>`).join('') : '<tr><td colspan="7" class="empty">暂无导入记录</td></tr>';
}

async function loadVideos() {
  const p = new URLSearchParams();
  const st = $('#f-status').value, cat = $('#f-category').value;
  if (st) p.set('status', st);
  if (cat) p.set('category', cat);
  const r = await fetch('/api/admin/videos?' + p.toString());
  const { list } = await r.json();
  $('#video-body').innerHTML = list.length ? list.map(v => `
    <tr class="${v.is_expired ? 'row-expired' : ''}">
      <td>${v.id}</td>
      <td class="td-title"><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title)}</a>
        ${v.expire_reason ? `<div class="muted small">过期原因：${esc(v.expire_reason)}</div>` : ''}
      </td>
      <td>${esc(v.category)}</td>
      <td>${esc(v.crop)}</td>
      <td>${esc(v.seasons || '全年')}</td>
      <td>${esc(v.region || '—')}</td>
      <td>${v.is_expired ? '<span class="badge badge-expired">已过期</span>' : '<span class="badge badge-ok">正常</span>'}</td>
      <td class="actions">
        ${v.is_expired
          ? `<button class="btn btn-sm" data-action="restore" data-id="${v.id}">恢复上架</button>`
          : `<button class="btn btn-sm btn-danger" data-action="expire" data-id="${v.id}">标记过期</button>`}
      </td>
    </tr>`).join('') : '<tr><td colspan="8" class="empty">暂无视频</td></tr>';

  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => toggleExpire(btn.dataset.id, btn.dataset.action));
  });
}

async function toggleExpire(id, action) {
  let reason = null;
  if (action === 'expire') {
    reason = prompt('请输入过期/下架原因（可留空）：', '技术内容已更新，旧版本停止推广');
    if (reason === null) return;
  }
  const r = await fetch(`/api/admin/videos/${id}/expire`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expired: action === 'expire', reason }),
  });
  if (r.ok) { loadVideos(); } else { alert('操作失败'); }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

$('#btn-import').addEventListener('click', uploadCsv);
$('#btn-filter').addEventListener('click', loadVideos);
loadBatches();
loadVideos();
