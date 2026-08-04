// ===== Outlook 账号管理 =====

var outlookCurrentPage = 1;
var outlookPageSize = 10;
var outlookAllAccounts = [];

function _accT(key, varsOrFallback, fallbackMaybe) {
  var vars = null, fallback = null;
  if (typeof varsOrFallback === 'string') {
    fallback = varsOrFallback;
  } else if (varsOrFallback && typeof varsOrFallback === 'object') {
    vars = varsOrFallback;
    if (typeof fallbackMaybe === 'string') fallback = fallbackMaybe;
  }
  if (window.I18N && typeof window.I18N.t === 'function') {
    var v = window.I18N.t(key, vars);
    if (v && v !== key) return v;
  }
  if (fallback != null) {
    if (vars) {
      return fallback.replace(/\{(\w+)\}/g, function(_, k) {
        return vars[k] != null ? vars[k] : '{' + k + '}';
      });
    }
    return fallback;
  }
  return key;
}

function openAddOutlookModal() {
  document.getElementById('add-outlook-modal').classList.add('show');
}

function closeAddOutlookModal() {
  document.getElementById('add-outlook-modal').classList.remove('show');
  document.getElementById('cfg-outlook-data').value = '';
}

async function addOutlookAccounts() {
  var data = document.getElementById('cfg-outlook-data').value.trim();
  if (!data) {
    showToast(_accT('accounts.inputRequired', '请先输入 Outlook 账号数据'), 'error');
    return;
  }
  try {
    var result = await window.go.main.App.AddOutlookAccounts(data);
    if (result.error) {
      showToast(result.error, 'error');
      return;
    }

    closeAddOutlookModal();
    await loadOutlookAccountsList();
    showToast(_accT('accounts.addedSummary', { n: result.added, total: result.total }, '成功添加 {n} 个账号，当前共 {total} 个'));
  } catch(e) {
    showToast(_accT('toast.addFailed', '添加失败') + ': ' + e.message, 'error');
  }
}

async function importOutlookFile() {
  try {
    var filePath = await window.go.main.App.SelectOutlookFile();
    if (!filePath) {
      return;
    }

    var result = await window.go.main.App.ImportOutlookFile(filePath);
    if (result.error) {
      showToast(result.error, 'error');
      return;
    }

    await loadOutlookAccountsList();
    closeAddOutlookModal();
    showToast(_accT('accounts.importSummary', { n: result.added, total: result.total }, '成功导入 {n} 个账号，当前共 {total} 个'));
  } catch(e) {
    showToast(_accT('accounts.importFailed', '导入失败') + ': ' + e.message, 'error');
  }
}

async function loadOutlookAccountsList() {
  try {
    var accounts = await window.go.main.App.GetOutlookAccounts();
    outlookAllAccounts = accounts || [];
    renderOutlookPage();
  } catch(e) {
    console.error('加载账号列表失败:', e);
  }
}

function renderOutlookPage() {
  var accounts = outlookAllAccounts;
  var tbody = document.getElementById('parsed-outlook-body');
  var pager = document.getElementById('outlook-pager');
  var countEl = document.getElementById('outlook-count');

  if (countEl) countEl.textContent = accounts ? accounts.length : 0;

  if (accounts && accounts.length > 0) {
    var total = accounts.length;
    var totalPages = Math.ceil(total / outlookPageSize);
    if (outlookCurrentPage > totalPages) outlookCurrentPage = totalPages;
    if (outlookCurrentPage < 1) outlookCurrentPage = 1;

    var start = (outlookCurrentPage - 1) * outlookPageSize;
    var end = Math.min(start + outlookPageSize, total);
    var pageAccounts = accounts.slice(start, end);

    var html = '';
    pageAccounts.forEach(function(acc, i) {
      var globalIdx = start + i;
      var status = acc.registered
        ? (acc.success ? _accT('status.success', '成功') : _accT('status.failed', '失败'))
        : _accT('status.unregistered', '未注册');
      var statusColor = acc.registered ? (acc.success ? 'var(--success)' : 'var(--danger)') : 'var(--text-muted)';
      var addedTime = acc.addedAt ? acc.addedAt.substring(5, 16) : '-';
      var emailEscaped = acc.email.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      var isAlias = (acc.email.split('@')[0] || '').indexOf('+') !== -1;
      html += '<tr><td>' + (globalIdx+1) + '</td><td>' + acc.email + '</td>';
      html += '<td style="color:' + statusColor + ';font-weight:600;">' + status + '</td>';
      html += '<td style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono);">' + addedTime + '</td>';
      html += '<td style="text-align:right;white-space:nowrap;">' +
        (!isAlias ? '<a href="javascript:void(0)" onclick="splitOutlookAccount(\'' + emailEscaped + '\')" style="color:var(--accent);margin-right:10px;">' + _accT('accounts.split', '分裂') + '</a>' : '') +
        '<a href="javascript:void(0)" onclick="deleteOutlookAccount(\'' + emailEscaped + '\')" style="color:var(--danger);">' + _accT('common.delete', '删除') + '</a>' +
        '</td></tr>';
    });
    tbody.innerHTML = html;

    if (totalPages > 1) {
      pager.style.display = 'flex';
      document.getElementById('outlook-pager-info').textContent = _accT('accounts.pagerInfo', { cur: outlookCurrentPage, total: totalPages, n: total }, '第 {cur} / {total} 页 (共 {n} 个)');
      document.getElementById('outlook-pager-prev').disabled = outlookCurrentPage <= 1;
      document.getElementById('outlook-pager-next').disabled = outlookCurrentPage >= totalPages;
    } else {
      pager.style.display = 'none';
    }
  } else {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">' + _accT('accounts.emptyRow', '暂无邮箱账号') + '</td></tr>';
    pager.style.display = 'none';
  }
}

function changeOutlookPage(delta) {
  outlookCurrentPage += delta;
  if (outlookCurrentPage < 1) outlookCurrentPage = 1;
  renderOutlookPage();
}

async function deleteOutlookAccount(email) {
  showConfirmModal(
    _accT('accounts.deleteTitle', '删除账号'),
    _accT('accounts.deleteMsg', { email: email }, '确认删除账号 {email} ?'),
    _accT('accounts.deleteConfirm', '确认删除'),
    async function() {
      try {
        var result = await window.go.main.App.DeleteOutlookAccount(email);
        if (result.error) {
          showToast(result.error, 'error');
          return;
        }
        showToast(_accT('accounts.deletedOne', '账号已删除'));
        await loadOutlookAccountsList();
      } catch(e) {
        showToast(_accT('toast.deleteFailed', '删除失败') + ': ' + e.message, 'error');
      }
    }
  );
}

function clearAllOutlookAccounts() {
  showConfirmModal(
    _accT('accounts.clearAllTitle', '清空微软邮箱'),
    _accT('accounts.clearAllMsg', '确认清空所有微软邮箱账号？此操作不可恢复！'),
    _accT('accounts.clearAllConfirm', '确认清空'),
    async function() {
      try {
        var result = await window.go.main.App.ClearOutlookAccounts();
        if (result.error) {
          showToast(result.error, 'error');
          return;
        }
        showToast(_accT('accounts.allCleared', '已清空所有账号'));
        await loadOutlookAccountsList();
      } catch(e) {
        showToast(_accT('toast.clearFailed', '清空失败') + ': ' + e.message, 'error');
      }
    }
  );
}

function clearRegisteredOutlookAccounts() {
  var registered = outlookAllAccounts.filter(function(a) { return a.registered; }).length;
  if (!registered) {
    showToast(_accT('accounts.noRegistered', '没有已注册的账号'));
    return;
  }
  showConfirmModal(
    _accT('accounts.clearRegisteredTitle', '清除已注册'),
    _accT('accounts.clearRegisteredMsg', { n: registered }, '确认删除 {n} 个已注册（成功/失败）的账号？'),
    _accT('accounts.deleteConfirm', '确认删除'),
    async function() {
      try {
        var result = await window.go.main.App.ClearRegisteredOutlookAccounts();
        if (result.error) {
          showToast(result.error, 'error');
          return;
        }
        showToast(_accT('toast.accountsDeleted', { n: (result.removed || 0) }, '已删除 {n} 个账号'));
        await loadOutlookAccountsList();
      } catch(e) {
        showToast(_accT('toast.deleteFailed', '删除失败') + ': ' + e.message, 'error');
      }
    }
  );
}

function openOutlookModal() {
  switchPage('accounts');
  loadOutlookAccountsList();
}

// ===== 分裂账号 =====

function splitOutlookAccount(email) {
  // 弹出分裂数量输入框
  var modalHtml = '<div id="split-outlook-modal" class="modal-overlay show" style="z-index:1200;">' +
    '<div style="width:100%;max-width:380px;padding:24px;">' +
    '<div class="card" style="padding:28px;">' +
    '<div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:6px;">' + _accT('accounts.splitTitle', '分裂账号') + '</div>' +
    '<div style="font-size:12px;color:var(--text-muted);margin-bottom:16px;line-height:1.5;">' +
      _accT('accounts.splitDesc', { email: email }, '将 {email} 分裂为多个别名账号（最多 50 个），别名账号共享同一收件箱。') +
    '</div>' +
    '<div style="margin-bottom:16px;">' +
    '<label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px;">' + _accT('accounts.splitCount', '分裂数量') + ' (1 - 100)</label>' +
    '<input type="number" id="split-count-input" value="10" min="1" max="100" class="form-input" style="width:100%;">' +
    '</div>' +
    '<div class="btn-row">' +
    '<button onclick="closeSplitModal()" class="btn btn-secondary" style="flex:1;justify-content:center;" data-i18n="common.cancel">取消</button>' +
    '<button onclick="doSplitOutlookAccount(\'' + email.replace(/'/g, "\\'") + '\')" class="btn btn-dark" style="flex:1;justify-content:center;">' + _accT('accounts.splitConfirm', '确认分裂') + '</button>' +
    '</div>' +
    '</div></div></div>';

  var container = document.createElement('div');
  container.id = 'split-modal-container';
  container.innerHTML = modalHtml;
  document.body.appendChild(container);
}

function closeSplitModal() {
  var el = document.getElementById('split-modal-container');
  if (el) el.remove();
}

async function doSplitOutlookAccount(email) {
  var countInput = document.getElementById('split-count-input');
  var count = parseInt(countInput ? countInput.value : '10', 10);
  if (isNaN(count) || count < 1) count = 1;
  if (count > 100) count = 100;

  closeSplitModal();

  try {
    var result = await window.go.main.App.SplitOutlookAccount(email, count);
    if (result.error) {
      showToast(result.error, 'error');
      return;
    }
    await loadOutlookAccountsList();
    var msg = _accT('accounts.splitSuccess', { n: result.added, total: result.total }, '已分裂 {n} 个别名账号，当前共 {total} 个');
    if (result.splitCount && result.remainingSlot !== undefined) {
      msg += ' (' + _accT('accounts.splitQuota', { used: result.splitCount, remaining: result.remainingSlot }, '已用 {used}/100，剩余 {remaining}') + ')';
    }
    showToast(msg);
  } catch(e) {
    showToast(_accT('accounts.splitFailed', '分裂失败') + ': ' + e.message, 'error');
  }
}

// ===== 自动刷新（停留在邮箱池页时每 3 秒刷新状态） =====
var outlookRefreshTimer = null;

function startOutlookAutoRefresh() {
  stopOutlookAutoRefresh();
  outlookRefreshTimer = setInterval(loadOutlookAccountsList, 3000);
}

function stopOutlookAutoRefresh() {
  if (outlookRefreshTimer) {
    clearInterval(outlookRefreshTimer);
    outlookRefreshTimer = null;
  }
}

// 语言切换后重新渲染表格行（状态/操作链接等动态文本）
window.addEventListener('i18n:changed', function() {
  try { if (typeof renderOutlookPage === 'function') renderOutlookPage(); } catch (e) {}
});
