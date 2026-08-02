// ===== 订阅页：一键获取支付链接 =====

function _subT(key, varsOrFallback, fallbackMaybe) {
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

var subState = {
  accounts: [],     // [{ email, status, url, error, subscription, time, selected }]
  plans: [],
  planType: '',
  outputDir: '',
  running: false
};

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

async function reloadSubscriptionAccounts() {
  var res;
  try {
    res = await window.go.main.App.LoadOutputAccounts();
  } catch (e) {
    showToast(_subT('subscription.loadFailed', '加载账号失败') + ': ' + e, 'error');
    return;
  }
  var hint = document.getElementById('sub-output-dir');
  if (hint) {
    hint.textContent = res && res.outputDir
      ? _subT('subscription.autoLoadedFrom', { dir: res.outputDir }, '已自动加载：{dir}')
      : _subT('subscription.autoLoaded', '已自动加载输出文件夹中的账号');
  }
  if (!res || !res.success) {
    subState.accounts = [];
    renderSubTable();
    updateSubProgress();
    if (res && res.error) showToast(res.error, 'error');
    return;
  }
  var list = res.accounts || [];
  subState.accounts = list.map(function(a) {
    var hasCached = !!a.cachedUrl;
    return {
      email: a.email || '',
      subscription: a.subscription || '',
      time: a.time || '',
      status: hasCached ? 'success' : 'idle',
      url: a.cachedUrl || '',
      planType: a.cachedPlanType || '',
      fetchedAt: a.cachedFetchedAt || '',
      error: '',
      selected: false
    };
  });
  renderSubTable();
  updateSubProgress();
}

function updateSubProgress() {
  var progress = document.getElementById('sub-progress');
  var total = subState.accounts.length;
  var sel = subState.accounts.filter(function(a) { return a.selected; }).length;
  var success = subState.accounts.filter(function(a) { return a.status === 'success'; }).length;
  var suspended = subState.accounts.filter(function(a) { return a.status === 'suspended'; }).length;
  var failed = subState.accounts.filter(function(a) { return a.status === 'error'; }).length;
  var loading = subState.accounts.filter(function(a) { return a.status === 'loading'; }).length;
  var parts = [_subT('subscription.totalSelected', { total: total, sel: sel }, '共 {total} 个 / 已选 {sel}')];
  if (subState.running) parts.push(_subT('subscription.statRunning', { n: loading }, '进行中 {n}'));
  if (success) parts.push(_subT('subscription.statSuccess', { n: success }, '成功 {n}'));
  if (suspended) parts.push(_subT('subscription.statSuspended', { n: suspended }, '封禁 {n}'));
  if (failed) parts.push(_subT('subscription.statFailed', { n: failed }, '失败 {n}'));
  progress.textContent = parts.join(' · ');
}

function renderSubTable() {
  var body = document.getElementById('sub-table-body');
  if (!subState.accounts.length) {
    body.innerHTML = '<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--muted);font-size:13px;">' + _subT('subscription.emptyOutput', '输出目录下尚无账号，请先注册或调整输出目录。') + '</td></tr>';
    refreshSelectAllChk();
    return;
  }
  var rows = subState.accounts.map(function(a, idx) {
    var statusHtml = '';
    if (a.status === 'idle') statusHtml = '<span style="color:var(--muted);">' + _subT('status.pending', '待获取') + '</span>';
    else if (a.status === 'loading') statusHtml = '<span style="color:#3b82f6;">' + _subT('status.fetching', '获取中…') + '</span>';
    else if (a.status === 'success') statusHtml = '<span style="color:#10b981;">' + _subT('status.ready', '已就绪') + '</span>';
    else if (a.status === 'suspended') statusHtml = '<span style="color:#f59e0b;cursor:pointer;text-decoration:underline;" onclick="showSubErrorDetail(' + idx + ')" title="' + _subT('subscription.clickForDetail', '点击查看详情') + '">' + _subT('status.suspended', '已封禁') + '</span>';
    else if (a.status === 'error') statusHtml = '<span style="color:#ef4444;cursor:pointer;text-decoration:underline;" onclick="showSubErrorDetail(' + idx + ')" title="' + _subT('subscription.clickForResponse', '点击查看详细响应') + '">' + _subT('status.failed', '失败') + '</span>';

    var btnStyle = 'background:transparent;border:1px solid var(--border);border-radius:6px;padding:4px 6px;cursor:pointer;color:var(--text);display:inline-flex;align-items:center;justify-content:center;';
    var iconOpen = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
    var iconCopy = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    var iconFetch = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/></svg>';
    var iconRefetch = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';

    var actions = '';
    if (a.status === 'success' && a.url) {
      actions =
        '<button style="' + btnStyle + '" title="' + _subT('subscription.openLink', '打开链接') + '" onclick="openSubLink(' + idx + ')">' + iconOpen + '</button>' +
        '<button style="' + btnStyle + '" title="' + _subT('subscription.copyLink', '复制链接') + '" onclick="copySubLink(' + idx + ')">' + iconCopy + '</button>';
    }
    var isRefetch = a.status === 'success' || a.status === 'error' || a.status === 'suspended';
    actions +=
      '<button class="btn btn-dark btn-sm" onclick="fetchOneSubLink(' + idx + ')"' + (a.status === 'loading' ? ' disabled' : '') + '>' + (isRefetch ? _subT('subscription.refetch', '重新获取') : _subT('subscription.fetch', '获取')) + '</button>';

    return (
      '<tr style="border-top:1px solid var(--border);">' +
        '<td style="padding:8px 12px;"><input type="checkbox" data-sub-idx="' + idx + '" ' + (a.selected ? 'checked' : '') + ' onchange="toggleSubRow(' + idx + ', this.checked)"></td>' +
        '<td style="padding:8px;color:var(--muted);font-size:12px;">' + (idx + 1) + '</td>' +
        '<td style="padding:8px;">' + escapeHtml(a.email) + '</td>' +
        '<td style="padding:8px;font-size:12px;color:var(--muted);">' + escapeHtml(a.subscription) + '</td>' +
        '<td style="padding:8px;font-size:12px;">' + statusHtml + '</td>' +
        '<td style="padding:8px 12px;text-align:right;display:flex;gap:4px;justify-content:flex-end;">' + actions + '</td>' +
      '</tr>'
    );
  });
  body.innerHTML = rows.join('');
  refreshSelectAllChk();
}

function refreshSelectAllChk() {
  var chk = document.getElementById('sub-select-all');
  if (!chk) return;
  var total = subState.accounts.length;
  var sel = subState.accounts.filter(function(a) { return a.selected; }).length;
  chk.checked = total > 0 && sel === total;
  chk.indeterminate = sel > 0 && sel < total;
}

function toggleSubSelectAll(checked) {
  subState.accounts.forEach(function(a) { a.selected = checked; });
  renderSubTable();
  updateSubProgress();
}

function toggleSubRow(idx, checked) {
  var a = subState.accounts[idx];
  if (!a) return;
  a.selected = checked;
  refreshSelectAllChk();
  updateSubProgress();
}

function getSelectedSubAccounts() {
  return subState.accounts.filter(function(a) { return a.selected; });
}

async function openSubscriptionPlanModal(singleIdx) {
  var isSingle = typeof singleIdx === 'number';
  if (!isSingle) {
    var sel = getSelectedSubAccounts();
    if (!sel.length) {
      showToast(_subT('subscription.pickFirst', '请先勾选要获取的账号'), 'error');
      return;
    }
  }
  subState.pendingSingleIdx = isSingle ? singleIdx : null;

  var refAccount = isSingle ? subState.accounts[singleIdx] : getSelectedSubAccounts()[0];
  if (!refAccount) return;

  document.getElementById('sub-plan-modal').classList.add('show');
  document.getElementById('sub-plan-modal-hint').textContent = isSingle
    ? _subT('subscription.planHintSingle', { email: refAccount.email }, '将使用账号 {email} 加载可用计划，并仅为该账号获取链接。')
    : _subT('subscription.planHintBatch', { email: refAccount.email, n: getSelectedSubAccounts().length }, '将使用账号 {email} 加载可用计划，并对已勾选的 {n} 个账号批量获取链接。');
  document.getElementById('sub-plan-modal-confirm').disabled = true;
  var listBox = document.getElementById('sub-plan-modal-list');

  subState.plans = [];
  subState.planType = '';

  listBox.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:30px 0;color:var(--text-muted);font-size:12px;">' +
    '<div style="width:28px;height:28px;border:3px solid var(--border);border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;"></div>' +
    '<span>' + _subT('common.loading', '加载中…') + '</span>' +
  '</div>';
  try {
    var res = await window.go.main.App.GetSubscriptionPlans(refAccount.email);
    if (!res || !res.success) {
      listBox.innerHTML = '<div style="color:#ef4444;font-size:13px;padding:20px 0;text-align:center;">' + escapeHtml((res && res.error) || _subT('common.loadFailed', '加载失败')) + '</div>';
      return;
    }
    subState.plans = res.plans || [];
    if (!subState.plans.length) {
      listBox.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:20px 0;text-align:center;">' + _subT('subscription.noPlans', '未返回任何可用计划') + '</div>';
      return;
    }
    var def = subState.plans.find(function(p) {
      var t = (p.qSubscriptionType || '').toUpperCase();
      return t.indexOf('PRO') >= 0 && t.indexOf('PLUS') < 0;
    }) || subState.plans[0];
    subState.planType = def.qSubscriptionType;
    renderPlanModalList();
    document.getElementById('sub-plan-modal-confirm').disabled = false;
  } catch (e) {
    listBox.innerHTML = '<div style="color:#ef4444;font-size:13px;padding:20px 0;text-align:center;">' + escapeHtml(String(e)) + '</div>';
  }
}

function renderPlanModalList() {
  var box = document.getElementById('sub-plan-modal-list');
  box.innerHTML = subState.plans.map(function(p) {
    var selected = p.qSubscriptionType === subState.planType;
    var title = (p.description && p.description.title) || p.name || p.qSubscriptionType;
    var amount = p.pricing && p.pricing.amount != null ? '$' + (p.pricing.amount / 100) : '';
    var interval = (p.description && p.description.billingInterval) ? ' / ' + p.description.billingInterval : '';
    var features = (p.description && Array.isArray(p.description.features)) ? p.description.features.slice(0, 3).join(' · ') : '';
    return (
      '<div onclick="selectPlanInModal(\'' + p.qSubscriptionType.replace(/\'/g, "\\'") + '\')" ' +
      'style="border:1px solid ' + (selected ? 'var(--accent, #3b82f6)' : 'var(--border)') + ';' +
      'background:' + (selected ? 'rgba(59,130,246,0.08)' : 'transparent') + ';' +
      'border-radius:8px;padding:12px 14px;cursor:pointer;transition:all 0.15s;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">' +
          '<div style="font-size:13px;font-weight:600;">' + escapeHtml(title) + '</div>' +
          '<div style="font-size:12px;color:var(--muted);">' + escapeHtml(amount + interval) + '</div>' +
        '</div>' +
        (features ? '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">' + escapeHtml(features) + '</div>' : '') +
      '</div>'
    );
  }).join('');
}

function selectPlanInModal(type) {
  subState.planType = type;
  renderPlanModalList();
}

function closeSubscriptionPlanModal() {
  document.getElementById('sub-plan-modal').classList.remove('show');
}

function confirmStartBatchFetch() {
  if (!subState.planType) {
    showToast(_subT('subscription.pickPlan', '请先选择一个计划'), 'error');
    return;
  }
  closeSubscriptionPlanModal();
  if (typeof subState.pendingSingleIdx === 'number') {
    var idx = subState.pendingSingleIdx;
    subState.pendingSingleIdx = null;
    doFetchSubLink(idx);
  } else {
    batchFetchSubscriptionLinks();
  }
}

async function fetchOneSubLink(idx) {
  // 单行点击「获取」始终弹出选计划模态框（不同账号可能需要不同方案，比如已订阅账号选升级）
  openSubscriptionPlanModal(idx);
}

// 真正执行单账号取链接（被模态框确认或批量任务调用）
async function doFetchSubLink(idx) {
  var a = subState.accounts[idx];
  if (!a || !subState.planType) return;
  a.status = 'loading'; a.url = ''; a.error = '';
  renderSubTable(); updateSubProgress();
  try {
    var res = await window.go.main.App.GetSubscriptionLink(a.email, subState.planType);
    if (res && res.success && res.url) {
      a.status = 'success'; a.url = res.url;
    } else if (res && res.suspended) {
      var bannedEmail = a.email;
      showToast(_subT('subscription.bannedRemoved', { email: bannedEmail }, '账号 {email} 已被封禁，已从输出文件移除'), 'error');
      if (res.removed) {
        var rmIdx = subState.accounts.findIndex(function(x) { return x.email === bannedEmail; });
        if (rmIdx >= 0) subState.accounts.splice(rmIdx, 1);
        renderSubTable(); updateSubProgress();
        return;
      }
      a.status = 'suspended';
      a.error = (res && res.error) || _subT('subscription.bannedShort', '账号已被封禁');
    } else {
      a.status = 'error'; a.error = (res && res.error) || _subT('subscription.unknownError', '未知错误');
    }
  } catch (e) {
    a.status = 'error'; a.error = String(e);
  }
  renderSubTable(); updateSubProgress();
}

async function batchFetchSubscriptionLinks() {
  var sel = getSelectedSubAccounts();
  if (!sel.length) { showToast(_subT('subscription.pickFirst', '请先勾选要获取的账号'), 'error'); return; }
  if (!subState.planType) { showToast(_subT('subscription.loadPickPlan', '请先加载并选择计划'), 'error'); return; }
  if (subState.running) return;
  subState.running = true;
  document.getElementById('sub-batch-btn').disabled = true;

  // 用 email 作为任务标识，避免封禁删除时下标错位
  var targetEmails = [];
  subState.accounts.forEach(function(a) {
    if (a.selected) {
      a.status = 'idle'; a.url = ''; a.error = '';
      targetEmails.push(a.email);
    }
  });
  renderSubTable(); updateSubProgress();

  var concurrency = parseInt(document.getElementById('sub-concurrency').value, 10) || 3;
  if (concurrency < 1) concurrency = 1;
  if (concurrency > 20) concurrency = 20;

  var cursor = 0;
  async function worker() {
    while (cursor < targetEmails.length) {
      var email = targetEmails[cursor++];
      var idx = subState.accounts.findIndex(function(a) { return a.email === email; });
      if (idx < 0) continue;
      await doFetchSubLink(idx);
    }
  }
  var workers = [];
  for (var i = 0; i < Math.min(concurrency, targetEmails.length); i++) workers.push(worker());
  await Promise.all(workers);

  subState.running = false;
  document.getElementById('sub-batch-btn').disabled = false;
  updateSubProgress();
}

function openSubLink(idx) {
  var a = subState.accounts[idx];
  if (a && a.url) window.go.main.App.OpenURL(a.url);
}

function copySubLink(idx) {
  var a = subState.accounts[idx];
  if (!a || !a.url) return;
  navigator.clipboard.writeText(a.url).then(function() { showToast(_subT('subscription.linkCopied', '已复制链接')); });
}

function copyAllSubscriptionLinks() {
  var lines = subState.accounts
    .filter(function(a) { return a.selected && a.status === 'success' && a.url; })
    .map(function(a) { return a.email + '\t' + a.url; });
  if (!lines.length) { showToast(_subT('subscription.noLinksToCopy', '暂无可复制的链接（需勾选且已获取成功）'), 'error'); return; }
  navigator.clipboard.writeText(lines.join('\n')).then(function() {
    showToast(_subT('subscription.linksCopied', { n: lines.length }, '已复制 {n} 条链接'));
  });
}

function showSubErrorDetail(idx) {
  var a = subState.accounts[idx];
  if (!a) return;
  var modal = document.getElementById('sub-error-modal');
  document.getElementById('sub-error-modal-email').textContent = a.email;
  document.getElementById('sub-error-modal-body').textContent = a.error || _subT('subscription.noErrorInfo', '(无错误信息)');
  modal.classList.add('show');
}

function closeSubErrorModal() {
  document.getElementById('sub-error-modal').classList.remove('show');
}

function copySubErrorDetail() {
  var text = document.getElementById('sub-error-modal-body').textContent;
  navigator.clipboard.writeText(text).then(function() { showToast(_subT('subscription.errCopied', '已复制错误详情')); });
}

// 语言切换后重新渲染动态内容（表格行、进度条文本）
window.addEventListener('i18n:changed', function() {
  try {
    if (typeof renderSubTable === 'function') renderSubTable();
    if (typeof updateSubProgress === 'function') updateSubProgress();
  } catch (e) {}
});
