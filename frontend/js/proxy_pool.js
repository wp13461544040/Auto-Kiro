// ===== 代理池（行内编辑式） =====
// 设计：默认显示一个空输入框；URL 留空=直连。点击「+ 添加代理」追加新行；
// 失焦/回车时持久化。同一时刻可以有多个空行，但保存时空 URL 行不会落库。

var proxyPool = [];        // 来自后端的真实条目（含 id）
var pendingEmptyRows = 1;  // 还未保存的空行数（最少 1 个）
var proxySelectedIds = {}; // 已勾选的代理 id 集合

function escapeProxyHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

async function loadProxyPool() {
  try {
    var list = await window.go.main.App.ListProxyPool();
    proxyPool = list || [];
  } catch (e) {
    proxyPool = [];
  }
  // 清理已删除条目的选中状态
  var existingIds = {};
  proxyPool.forEach(function(p) { existingIds[p.id] = true; });
  Object.keys(proxySelectedIds).forEach(function(id) {
    if (!existingIds[id]) delete proxySelectedIds[id];
  });
  pendingEmptyRows = proxyPool.length ? 0 : 1;
  renderProxyPool();
}

function renderProxyPool() {
  var box = document.getElementById('proxy-pool-list');
  if (!box) return;

  var multi = (proxyPool.length + pendingEmptyRows) > 1;
  var totalSoft = 0;
  var soft = proxyPool.map(function(p) {
    if (!p.url) return 0;
    var w = p.weight > 0 ? p.weight : 1;
    return Math.pow(w, 0.6);
  });
  for (var i = 0; i < soft.length; i++) totalSoft += soft[i];

  var selectedCount = Object.keys(proxySelectedIds).length;
  var allChecked = proxyPool.length > 0 && selectedCount === proxyPool.length;

  var html = '';

  // 批量操作工具栏（有已保存条目时显示）
  if (proxyPool.length > 0) {
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:6px 8px;background:var(--bg-subtle);border-radius:6px;border:1px solid var(--border);">' +
      '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:var(--text-secondary);">' +
        '<input type="checkbox" id="proxy-select-all" ' + (allChecked ? 'checked' : '') + ' onchange="proxyToggleSelectAll(this.checked)" style="cursor:pointer;">' +
        '全选' +
      '</label>' +
      '<span style="font-size:12px;color:var(--text-muted);">已选 ' + selectedCount + '/' + proxyPool.length + '</span>' +
      '<div style="margin-left:auto;display:flex;gap:6px;">' +
        '<button id="btn-batch-test-all" type="button" onclick="batchTestProxies(null)" class="btn btn-secondary btn-sm">测试全部</button>' +
        (selectedCount > 0
          ? '<button id="btn-batch-test-selected" type="button" onclick="batchTestProxies(Object.keys(proxySelectedIds))" class="btn btn-secondary btn-sm">测试选中 (' + selectedCount + ')</button>' +
            '<button type="button" onclick="deleteSelectedProxies()" class="btn btn-sm" style="background:var(--danger);color:#fff;border:none;">删除选中 (' + selectedCount + ')</button>'
          : '') +
      '</div>' +
    '</div>';
  }

  // 已保存条目
  for (var idx = 0; idx < proxyPool.length; idx++) {
    var p = proxyPool[idx];
    var pct = (multi && totalSoft > 0) ? (Math.round(soft[idx] / totalSoft * 1000) / 10) : null;
    var checked = proxySelectedIds[p.id] ? 'checked' : '';
    html += (
      '<div style="display:flex;flex-direction:column;gap:3px;margin-bottom:6px;">' +
        '<div style="display:flex;align-items:center;gap:6px;">' +
          '<input type="checkbox" ' + checked + ' onchange="proxyToggleSelect(\'' + p.id + '\', this.checked)" style="cursor:pointer;flex-shrink:0;">' +
          '<input type="text" value="' + escapeProxyHtml(p.url) + '" placeholder="留空=直连" onchange="updateProxyEntryURL(\'' + p.id + '\', this.value)" class="form-input" style="flex:1;font-family:var(--font-mono);font-size:12px;">' +
          '<input type="number" min="1" max="100" value="' + (p.weight || 1) + '" title="权重 1-100" onchange="updateProxyEntry(\'' + p.id + '\', \'weight\', this.value)" style="width:54px;text-align:center;padding:4px;border:1px solid var(--border);border-radius:4px;background:var(--bg-subtle);font-size:12px;">' +
          (pct != null ? '<span style="font-size:11px;color:var(--text-muted);min-width:42px;text-align:right;">' + pct + '%</span>' : '') +
          '<button type="button" onclick="testProxyEntryByIdx(' + idx + ')" class="btn btn-secondary btn-sm">测试</button>' +
          '<button type="button" onclick="deleteProxyEntry(\'' + p.id + '\')" class="btn btn-secondary btn-sm" style="color:var(--danger);">删除</button>' +
        '</div>' +
        '<span id="proxy-test-status-' + p.id + '" style="display:none;margin-left:24px;font-size:11px;padding:2px 8px;border-radius:4px;font-family:var(--font-mono);align-items:center;max-width:calc(100% - 24px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>' +
      '</div>'
    );
  }

  // 未保存的空行
  for (var j = 0; j < pendingEmptyRows; j++) {
    var rowIdx = j;
    html += (
      '<div data-pending-idx="' + rowIdx + '" style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">' +
        '<input type="checkbox" disabled style="opacity:0;flex-shrink:0;">' +
        '<input type="text" placeholder="留空=直连，或填入代理地址" onblur="savePendingProxyRow(' + rowIdx + ', this.value)" onkeydown="if(event.key===\'Enter\'){this.blur();}" class="form-input" style="flex:1;font-family:var(--font-mono);font-size:12px;">' +
        '<input type="number" min="1" max="100" value="1" data-pending-weight="' + rowIdx + '" title="权重 1-100" style="width:54px;text-align:center;padding:4px;border:1px solid var(--border);border-radius:4px;background:var(--bg-subtle);font-size:12px;">' +
        (proxyPool.length + pendingEmptyRows > 1
          ? '<button type="button" onclick="removePendingProxyRow(' + rowIdx + ')" class="btn btn-secondary btn-sm">移除</button>'
          : '') +
      '</div>'
    );
  }

  box.innerHTML = html;
}

function proxyToggleSelect(id, checked) {
  if (checked) {
    proxySelectedIds[id] = true;
  } else {
    delete proxySelectedIds[id];
  }
  renderProxyPool();
}

function proxyToggleSelectAll(checked) {
  proxySelectedIds = {};
  if (checked) {
    proxyPool.forEach(function(p) { proxySelectedIds[p.id] = true; });
  }
  renderProxyPool();
}

async function deleteSelectedProxies() {
  var ids = Object.keys(proxySelectedIds);
  if (ids.length === 0) return;
  showConfirmModal(
    '批量删除代理',
    '确认删除选中的 ' + ids.length + ' 个代理？',
    '确认删除',
    async function() {
      try {
        var res = await window.go.main.App.DeleteProxyEntries(ids);
        if (res && res.error) {
          showToast(res.error, 'error');
          return;
        }
        proxySelectedIds = {};
        showToast('已删除 ' + (res.removed || ids.length) + ' 个代理');
        await loadProxyPool();
      } catch (e) {
        showToast('删除失败: ' + e.message, 'error');
      }
    }
  );
}

function addEmptyProxyRow() {
  pendingEmptyRows++;
  renderProxyPool();
  // 把焦点放到新追加的行
  setTimeout(function() {
    var box = document.getElementById('proxy-pool-list');
    if (!box) return;
    var rows = box.querySelectorAll('[data-pending-idx] input[type="text"]');
    if (rows.length) rows[rows.length - 1].focus();
  }, 0);
}

// 批量导入代理
async function batchImportProxies() {
  var textarea = document.getElementById('proxy-batch-import-textarea');
  if (!textarea) return;
  
  var text = textarea.value.trim();
  if (!text) {
    showToast('请输入代理地址', 'error');
    return;
  }
  
  var lines = text.split('\n').map(function(line) { return line.trim(); }).filter(Boolean);
  if (lines.length === 0) {
    showToast('未检测到有效代理', 'error');
    return;
  }
  
  showToast('正在导入 ' + lines.length + ' 个代理...');
  
  var successCount = 0;
  var failCount = 0;
  var errors = [];
  
  for (var i = 0; i < lines.length; i++) {
    try {
      var res = await window.go.main.App.AddProxyEntry('', lines[i], 50);
      if (res && res.error) {
        failCount++;
        if (errors.length < 3) {
          errors.push(lines[i] + ': ' + res.error);
        }
      } else {
        successCount++;
      }
    } catch (e) {
      failCount++;
      if (errors.length < 3) {
        errors.push(lines[i] + ': ' + e.message);
      }
    }
  }
  
  await loadProxyPool();
  
  var msg = '导入完成！成功: ' + successCount + ', 失败: ' + failCount;
  if (errors.length > 0) {
    msg += '\n前' + errors.length + '个错误:\n' + errors.join('\n');
  }
  
  showToast(msg, successCount > 0 ? 'success' : 'error');
  
  // 清空输入框并关闭
  textarea.value = '';
  closeBatchImportModal();
}

function showBatchImportModal() {
  var modal = document.getElementById('proxy-batch-import-modal');
  if (modal) {
    modal.classList.add('show');
    setTimeout(function() {
      var textarea = document.getElementById('proxy-batch-import-textarea');
      if (textarea) textarea.focus();
    }, 100);
  }
}

function closeBatchImportModal() {
  var modal = document.getElementById('proxy-batch-import-modal');
  if (modal) {
    modal.classList.remove('show');
  }
}

function removePendingProxyRow(idx) {
  pendingEmptyRows = Math.max(0, pendingEmptyRows - 1);
  // 至少保留一个空行（如果完全没有已保存代理）
  if (proxyPool.length === 0 && pendingEmptyRows === 0) pendingEmptyRows = 1;
  renderProxyPool();
}

async function savePendingProxyRow(idx, rawURL) {
  var url = (rawURL || '').trim();
  if (!url) {
    // 留空不持久化；什么也不做
    return;
  }
  // 从 DOM 拿当前权重
  var box = document.getElementById('proxy-pool-list');
  var weight = 1;
  if (box) {
    var wEl = box.querySelector('[data-pending-weight="' + idx + '"]');
    if (wEl) {
      var w = parseInt(wEl.value, 10);
      if (!isNaN(w) && w >= 1) weight = Math.min(100, w);
    }
  }
  try {
    var res = await window.go.main.App.AddProxyEntry('', url, weight);
    if (res && res.error) {
      showToast(res.error, 'error');
      return;
    }
    pendingEmptyRows = Math.max(0, pendingEmptyRows - 1);
    showToast('已保存');
    await loadProxyPool();
  } catch (e) {
    showToast('保存失败: ' + e.message, 'error');
  }
}

async function updateProxyEntryURL(id, newURL) {
  var entry = proxyPool.find(function(p) { return p.id === id; });
  if (!entry) return;
  var url = (newURL || '').trim();
  if (url === '') {
    // 用户清空了 URL → 删除该条
    await deleteProxyEntry(id, true);
    return;
  }
  if (url === entry.url) return;
  try {
    var res = await window.go.main.App.UpdateProxyEntry(id, '', url, entry.weight || 1, entry.enabled);
    if (res && res.error) {
      showToast(res.error, 'error');
      await loadProxyPool();
      return;
    }
    await loadProxyPool();
  } catch (e) {
    showToast('更新失败: ' + e.message, 'error');
    await loadProxyPool();
  }
}

async function updateProxyEntry(id, field, value) {
  var entry = proxyPool.find(function(p) { return p.id === id; });
  if (!entry) return;
  if (field === 'weight') {
    var w = parseInt(value, 10) || 1;
    if (w < 1) w = 1;
    if (w > 100) w = 100;
    entry.weight = w;
  } else if (field === 'enabled') {
    entry.enabled = !!value;
  }
  try {
    var res = await window.go.main.App.UpdateProxyEntry(id, '', entry.url || '', entry.weight || 1, entry.enabled);
    if (res && res.error) {
      showToast(res.error, 'error');
      await loadProxyPool();
      return;
    }
    renderProxyPool();
  } catch (e) {
    showToast('更新失败: ' + e.message, 'error');
    await loadProxyPool();
  }
}

async function deleteProxyEntry(id, silent) {
  if (silent) {
    try {
      await window.go.main.App.DeleteProxyEntry(id);
    } catch (e) {}
    await loadProxyPool();
    return;
  }
  showConfirmModal('删除代理', '确认从池中删除该代理？', '确认删除', async function() {
    try {
      var res = await window.go.main.App.DeleteProxyEntry(id);
      if (res && res.error) {
        showToast(res.error, 'error');
        return;
      }
      showToast('已删除');
      await loadProxyPool();
    } catch (e) {
      showToast('删除失败: ' + e.message, 'error');
    }
  });
}

async function testProxyEntryByIdx(idx) {
  var p = proxyPool[idx];
  if (!p || !p.url) return;
  // 立即在行内显示 loading 状态
  setProxyRowTestStatus(p.id, 'loading', '测试中…');
  try {
    var info = await window.go.main.App.TestProxyEntry(p.url);
    if (info && info.ok) {
      var loc = [info.country, info.region, info.city].filter(Boolean).join(' · ');
      var label = (info.scheme || '').toUpperCase() + ' · ' + (info.ip || '') + (loc ? ' (' + loc + ')' : '');
      setProxyRowTestStatus(p.id, 'ok', label);
    } else {
      setProxyRowTestStatus(p.id, 'error', (info && info.error) || '不可用');
    }
  } catch (e) {
    setProxyRowTestStatus(p.id, 'error', e.message || '测试失败');
  }
}

// 设置某行的测试状态标签
function setProxyRowTestStatus(id, state, text) {
  var el = document.getElementById('proxy-test-status-' + id);
  if (!el) return;
  el.style.display = 'inline-flex';
  if (state === 'loading') {
    el.style.color = 'var(--text-muted)';
    el.style.background = 'var(--bg-subtle)';
    el.style.border = '1px solid var(--border)';
    el.innerHTML = '<span style="display:inline-block;width:10px;height:10px;border:2px solid var(--text-muted);border-top-color:transparent;border-radius:50%;animation:proxy-spin 0.6s linear infinite;margin-right:4px;flex-shrink:0;"></span>' + escapeProxyHtml(text);
  } else if (state === 'ok') {
    el.style.color = '#059669';
    el.style.background = '#ecfdf5';
    el.style.border = '1px solid #6ee7b7';
    el.innerHTML = '✓ ' + escapeProxyHtml(text);
  } else {
    el.style.color = '#dc2626';
    el.style.background = '#fef2f2';
    el.style.border = '1px solid #fca5a5';
    el.innerHTML = '✗ ' + escapeProxyHtml(text);
  }
}

// 批量测试代理：ids 为空则测试全部，否则只测试指定 id
async function batchTestProxies(idsToTest) {
  if (proxyPool.length === 0) {
    showToast('代理池为空', 'error');
    return;
  }
  var targets = idsToTest && idsToTest.length > 0 ? idsToTest : proxyPool.map(function(p) { return p.id; });
  if (targets.length === 0) {
    showToast('没有可测试的代理', 'error');
    return;
  }

  // 立即把目标行置为 loading
  targets.forEach(function(id) { setProxyRowTestStatus(id, 'loading', '测试中…'); });

  // 禁用批量测试按钮，防止重复触发
  var btn = document.getElementById('btn-batch-test-all');
  var btnSel = document.getElementById('btn-batch-test-selected');
  if (btn) { btn.disabled = true; btn.textContent = '测试中…'; }
  if (btnSel) { btnSel.disabled = true; }

  try {
    var results = await window.go.main.App.BatchTestProxies(targets);
    var ok = 0, fail = 0;
    targets.forEach(function(id) {
      var info = results[id];
      if (!info) {
        setProxyRowTestStatus(id, 'error', '无结果');
        fail++;
        return;
      }
      if (info.ok) {
        var loc = [info.country, info.region, info.city].filter(Boolean).join(' · ');
        var label = (info.scheme || '').toUpperCase() + ' · ' + (info.ip || '') + (loc ? ' (' + loc + ')' : '');
        setProxyRowTestStatus(id, 'ok', label);
        ok++;
      } else {
        setProxyRowTestStatus(id, 'error', info.error || '不可用');
        fail++;
      }
    });
    showToast('测试完成：' + ok + ' 可用，' + fail + ' 不可用');
  } catch (e) {
    targets.forEach(function(id) { setProxyRowTestStatus(id, 'error', '测试失败'); });
    showToast('批量测试失败: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '测试全部'; }
    if (btnSel) { btnSel.disabled = false; }
  }
}
