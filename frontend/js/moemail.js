// ===== MoeMail 配置管理 =====

let moemailConfigs = [];
let moemailConfigStatus = {}; // 存储每个配置的测试状态

function _mmT(key, varsOrFallback, fallbackMaybe) {
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

// 加载 MoeMail 配置
async function loadMoeMailConfigs() {
  try {
    const configs = await window.go.main.App.GetMoeMailConfigs();
    moemailConfigs = configs || [];
    // 加载状态
    loadMoeMailConfigStatus();
    updateMoeMailUI();
    return configs;
  } catch (e) {
    console.error('[MoeMail] 加载配置失败:', e);
    moemailConfigs = [];
    return [];
  }
}

// 加载 MoeMail 配置状态
function loadMoeMailConfigStatus() {
  try {
    const saved = localStorage.getItem('moemail-config-status');
    if (saved) {
      moemailConfigStatus = JSON.parse(saved);
    }
  } catch (e) {
    console.error('[MoeMail] 加载状态失败:', e);
    moemailConfigStatus = {};
  }
}

// 保存 MoeMail 配置状态
function saveMoeMailConfigStatus() {
  try {
    localStorage.setItem('moemail-config-status', JSON.stringify(moemailConfigStatus));
  } catch (e) {
    console.error('[MoeMail] 保存状态失败:', e);
  }
}

// 更新 MoeMail UI
function updateMoeMailUI() {
  // 计算可用配置数量
  let activeCount = 0;
  moemailConfigs.forEach(cfg => {
    const status = moemailConfigStatus[cfg.name];
    if (status && status.tested && status.success) {
      activeCount++;
    }
  });

  // 更新模态框计数
  const modalCount = document.getElementById('moemail-count');
  if (modalCount) modalCount.textContent = _mmT('moemail.configCount', { n: moemailConfigs.length }, '{n} 个');

  // 更新设置页摘要
  const summaryEl = document.getElementById('settings-moemail-summary');
  if (summaryEl) {
    if (moemailConfigs.length === 0) {
      summaryEl.textContent = _mmT('moemail.summaryNone', '未配置');
    } else {
      summaryEl.textContent = _mmT('moemail.summaryActive', { n: moemailConfigs.length, m: activeCount }, '已配置 {n} 个，可用 {m} 个');
    }
  }

  // 更新配置列表
  renderMoeMailConfigList();
}

// 渲染配置列表（模态框 + 设置页内联）
function renderMoeMailConfigList() {
  // 模态框表格
  const tbody = document.getElementById('moemail-config-body');
  if (tbody) {
    if (moemailConfigs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">' + _mmT('moemail.emptyConfigs', '暂无配置') + '</td></tr>';
    } else {
      tbody.innerHTML = moemailConfigs.map((cfg, idx) => {
        const status = moemailConfigStatus[cfg.name] || { tested: false };
        let statusHtml = '';
        if (!status.tested) {
          statusHtml = '<span style="color:var(--text-muted);font-weight:600;font-size:12px;">' + _mmT('status.untested', '未测试') + '</span>';
        } else if (status.success) {
          statusHtml = '<span style="color:var(--success);font-weight:600;font-size:12px;">' + _mmT('status.available', '可用') + '</span>';
        } else {
          statusHtml = '<span style="color:var(--danger);font-weight:600;font-size:12px;">' + _mmT('status.unavailable', '不可用') + '</span>';
        }
        return `<tr>
          <td>${idx + 1}</td>
          <td>${escapeHtml(cfg.name)}</td>
          <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">${escapeHtml(cfg.url)}</td>
          <td>${statusHtml}</td>
          <td style="text-align:right;white-space:nowrap;">
            <a href="javascript:void(0)" onclick="testMoeMailConfigByIndex(${idx})" style="color:var(--primary);margin-right:12px;font-size:12px;">${_mmT('common.test', '测试')}</a>
            <a href="javascript:void(0)" onclick="deleteMoeMailConfig(${idx})" style="color:var(--danger);font-size:12px;">${_mmT('common.delete', '删除')}</a>
          </td>
        </tr>`;
      }).join('');
    }
  }

  // 设置页内联列表
  const inlineList = document.getElementById('moemail-inline-list');
  if (inlineList) {
    if (moemailConfigs.length === 0) {
      inlineList.innerHTML = `
        <div class="moemail-empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
            <polyline points="22,6 12,13 2,6"></polyline>
          </svg>
          <div>${_mmT('moemail.emptyInline', '暂无配置，请在上方添加 MoeMail 配置')}</div>
        </div>
      `;
    } else {
      inlineList.innerHTML = moemailConfigs.map((cfg, idx) => {
        const status = moemailConfigStatus[cfg.name] || { tested: false };
        let dotClass = 'untested';
        let statusLabel = _mmT('status.untested', '未测试');
        let statusClass = 'untested';
        let domainsHtml = '';

        if (status.tested && status.success) {
          dotClass = 'success';
          statusLabel = _mmT('status.available', '可用');
          statusClass = 'success';
          const domains = status.domains || [];
          if (domains.length > 0) {
            domainsHtml = '<div class="moemail-domain-tags">' +
              domains.map(d => '<span class="moemail-domain-tag">' + escapeHtml(d) + '</span>').join('') +
              '</div>';
          }
        } else if (status.tested) {
          dotClass = 'error';
          statusLabel = _mmT('status.unavailable', '不可用');
          statusClass = 'error';
        }

        return `
          <div class="moemail-config-item">
            <div class="moemail-config-main">
              <div class="moemail-status-dot ${dotClass}"></div>
              <div class="moemail-config-info">
                <div class="moemail-config-name">${escapeHtml(cfg.name)}</div>
                <div class="moemail-config-details">
                  <span class="moemail-config-url">${escapeHtml(cfg.url)}</span>
                  <span class="moemail-config-status ${statusClass}">${statusLabel}</span>
                </div>
                ${domainsHtml}
              </div>
            </div>
            <div class="moemail-config-actions">
              <button onclick="testMoeMailConfigByIndex(${idx})" class="btn btn-secondary btn-sm">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                ${_mmT('common.test', '测试')}
              </button>
              <button onclick="deleteMoeMailConfig(${idx})" class="btn btn-secondary btn-sm" style="color:var(--danger);">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
                ${_mmT('common.delete', '删除')}
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

// 自动生成配置名称
function generateMoeMailName() {
  var prefix = _mmT('moemail.autoNamePrefix', '配置');
  let idx = moemailConfigs.length + 1;
  let name = prefix + ' ' + idx;
  while (moemailConfigs.some(c => c.name === name)) {
    idx++;
    name = prefix + ' ' + idx;
  }
  return name;
}

// 内联添加 MoeMail 配置
async function inlineAddMoeMail() {
  var name = document.getElementById('moemail-inline-name').value.trim();
  var url = document.getElementById('moemail-inline-url').value.trim();
  var apikey = document.getElementById('moemail-inline-apikey').value.trim();
  if (!url || !apikey) {
    showToast(_mmT('moemail.requiredUrlKey', '请填写 API URL 和 API Key'), 'error');
    return;
  }
  if (!name) {
    name = generateMoeMailName();
  }
  if (moemailConfigs.some(c => c.name === name)) {
    showToast(_mmT('moemail.nameExists', '配置名称已存在'), 'error');
    return;
  }

  // 先测试连接，成功后才保存
  var btn = document.getElementById('moemail-inline-test-btn');
  var statusEl = document.getElementById('moemail-inline-status');
  var btnOriginalHTML = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.textContent = _mmT('moemail.testing', '测试中...'); }
  if (statusEl) { statusEl.style.color = ''; statusEl.textContent = ''; }

  var testResult;
  try {
    testResult = await window.go.main.App.TestMoeMailConnection(JSON.stringify({ url: url, apiKey: apikey }));
  } catch (e) {
    testResult = { error: String(e) };
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = btnOriginalHTML; }
  }

  if (!testResult || testResult.error) {
    var errMsg = (testResult && testResult.error) || _mmT('moemail.testFailedShort', '测试失败');
    if (statusEl) { statusEl.style.color = 'var(--danger)'; statusEl.textContent = errMsg; }
    showToast(_mmT('moemail.cannotSaveUntilOk', '连接测试未通过，未保存配置：') + errMsg, 'error');
    return;
  }

  moemailConfigs.push({ name: name, url: url, apiKey: apikey });
  const saveResult = await window.go.main.App.SaveMoeMailConfigs(JSON.stringify(moemailConfigs));
  if (saveResult.error) {
    moemailConfigs.pop();
    showToast(_mmT('toast.operationFailed', '保存失败') + ': ' + saveResult.error, 'error');
    return;
  }

  // 标记已测试通过，避免再次后台二次测试
  moemailConfigStatus[name] = { tested: true, success: true, domains: testResult.domains || [] };
  saveMoeMailConfigStatus();

  document.getElementById('moemail-inline-name').value = '';
  document.getElementById('moemail-inline-url').value = '';
  document.getElementById('moemail-inline-apikey').value = '';
  if (statusEl) { statusEl.style.color = 'var(--success)'; statusEl.textContent = ''; }
  showToast(_mmT('moemail.addedNamed', { name: name }, '已添加: {name}'));
  updateMoeMailUI();
}

// 内联测试 MoeMail 配置
async function inlineTestMoeMail() {
  var url = document.getElementById('moemail-inline-url').value.trim();
  var apikey = document.getElementById('moemail-inline-apikey').value.trim();
  if (!url || !apikey) {
    showToast(_mmT('moemail.requiredUrlKeyShort', '请填写 API URL 和 Key'), 'error');
    return;
  }
  var btn = document.getElementById('moemail-inline-test-btn');
  var statusEl = document.getElementById('moemail-inline-status');
  var btnOriginalHTML = btn ? btn.innerHTML : '';
  btn.disabled = true; btn.textContent = _mmT('moemail.testing', '测试中...');
  statusEl.textContent = '';
  try {
    var result = await window.go.main.App.TestMoeMailConnection(JSON.stringify({url: url, apiKey: apikey}));
    if (result.success) {
      statusEl.style.color = 'var(--success)';
      statusEl.textContent = _mmT('moemail.connectedDomains', { n: (result.domainCount || 0) }, '连接成功，{n} 个域名');
    } else {
      statusEl.style.color = 'var(--danger)';
      statusEl.textContent = result.error || _mmT('moemail.testFailed', '连接失败');
    }
  } catch(e) {
    statusEl.style.color = 'var(--danger)';
    statusEl.textContent = _mmT('moemail.testFailedShort', '测试失败');
  }
  btn.disabled = false; btn.innerHTML = btnOriginalHTML;
}

// 打开 MoeMail 模态框
function openMoeMailModal() {
  loadMoeMailConfigs();
  document.getElementById('moemail-modal').classList.add('show');
  // 清空输入框
  document.getElementById('moemail-name').value = '';
  document.getElementById('moemail-url').value = 'https://moemail.app';
  document.getElementById('moemail-apikey').value = '';
  document.getElementById('moemail-test-result').style.display = 'none';
}

// 关闭 MoeMail 模态框
function closeMoeMailModal() {
  document.getElementById('moemail-modal').classList.remove('show');
}

// 测试连接
async function testMoeMailConnection() {
  const name = document.getElementById('moemail-name').value.trim();
  const url = document.getElementById('moemail-url').value.trim();
  const apiKey = document.getElementById('moemail-apikey').value.trim();
  const resultDiv = document.getElementById('moemail-test-result');

  if (!url || !apiKey) {
    resultDiv.style.display = 'block';
    resultDiv.style.color = 'var(--danger)';
    resultDiv.textContent = _mmT('moemail.requiredUrlKey2', '请填写 URL 和 API Key');
    return;
  }

  resultDiv.style.display = 'block';
  resultDiv.style.color = 'var(--text-muted)';
  resultDiv.textContent = _mmT('moemail.testing', '测试中...');

  try {
    const config = { name: name || _mmT('common.test', '测试'), url, apiKey };
    const result = await window.go.main.App.TestMoeMailConnection(JSON.stringify(config));

    if (result.error) {
      resultDiv.style.color = 'var(--danger)';
      let errorMsg = result.error;
      if (errorMsg.includes('403')) {
        errorMsg = _mmT('moemail.err403', 'API Key 权限不足，请检查账号权限或购买 API 调用额度');
      } else if (errorMsg.includes('401')) {
        errorMsg = _mmT('moemail.err401', 'API Key 无效，请检查是否正确');
      } else if (errorMsg.includes('404')) {
        errorMsg = _mmT('moemail.err404', 'API 地址错误，请检查 URL 是否正确');
      } else if (errorMsg.includes('timeout') || errorMsg.includes('连接')) {
        errorMsg = _mmT('moemail.errTimeout', '连接超时，请检查网络或 URL 是否正确');
      }
      resultDiv.textContent = errorMsg;
    } else {
      resultDiv.style.color = 'var(--success)';
      const domains = result.domains || [];
      if (domains.length > 0) {
        resultDiv.textContent = _mmT('moemail.connectedOkDomains', { d: domains.join(', ') }, '连接成功！可用域名: {d}');
      } else {
        resultDiv.textContent = _mmT('moemail.connectedOk', '连接成功！');
      }
    }
  } catch (e) {
    resultDiv.style.color = 'var(--danger)';
    resultDiv.textContent = _mmT('moemail.testFailedShort', '测试失败') + ': ' + e;
  }
}

// 添加配置
async function addMoeMailConfig() {
  const name = document.getElementById('moemail-name').value.trim();
  const url = document.getElementById('moemail-url').value.trim();
  const apiKey = document.getElementById('moemail-apikey').value.trim();
  const resultDiv = document.getElementById('moemail-test-result');

  if (!name) {
    resultDiv.style.display = 'block';
    resultDiv.style.color = 'var(--danger)';
    resultDiv.textContent = _mmT('moemail.requiredName', '请填写配置名称');
    return;
  }

  if (!url || !apiKey) {
    resultDiv.style.display = 'block';
    resultDiv.style.color = 'var(--danger)';
    resultDiv.textContent = _mmT('moemail.requiredUrlKey2', '请填写 URL 和 API Key');
    return;
  }

  if (moemailConfigs.some(cfg => cfg.name === name)) {
    resultDiv.style.display = 'block';
    resultDiv.style.color = 'var(--danger)';
    resultDiv.textContent = _mmT('moemail.nameExists', '配置名称已存在');
    return;
  }

  resultDiv.style.display = 'block';
  resultDiv.style.color = 'var(--text-muted)';
  resultDiv.textContent = _mmT('moemail.testingConnection', '正在测试连接...');

  const newConfig = { name, url, apiKey };

  try {
    const testResult = await window.go.main.App.TestMoeMailConnection(JSON.stringify(newConfig));

    if (testResult.error) {
      resultDiv.style.color = 'var(--danger)';
      let errorMsg = testResult.error;
      if (errorMsg.includes('403')) {
        errorMsg = _mmT('moemail.err403', 'API Key 权限不足，请检查账号权限或购买 API 调用额度');
      } else if (errorMsg.includes('401')) {
        errorMsg = _mmT('moemail.err401', 'API Key 无效，请检查是否正确');
      } else if (errorMsg.includes('404')) {
        errorMsg = _mmT('moemail.err404', 'API 地址错误，请检查 URL 是否正确');
      } else if (errorMsg.includes('timeout') || errorMsg.includes('连接')) {
        errorMsg = _mmT('moemail.errTimeout', '连接超时，请检查网络或 URL 是否正确');
      }
      resultDiv.textContent = _mmT('moemail.testFailedAddDeny', { err: errorMsg }, '测试失败: {err}，无法添加配置');
      return;
    }

    moemailConfigs.push(newConfig);

    const result = await window.go.main.App.SaveMoeMailConfigs(JSON.stringify(moemailConfigs));
    if (result.error) {
      moemailConfigs.pop();
      resultDiv.style.color = 'var(--danger)';
      resultDiv.textContent = _mmT('toast.operationFailed', '保存失败') + ': ' + result.error;
      return;
    }

    const domains = testResult.domains || [];
    moemailConfigStatus[name] = {
      tested: true,
      success: true,
      domains: domains,
      domainCount: domains.length
    };
    saveMoeMailConfigStatus();

    document.getElementById('moemail-name').value = '';
    document.getElementById('moemail-url').value = 'https://moemail.app';
    document.getElementById('moemail-apikey').value = '';

    resultDiv.style.color = 'var(--success)';
    if (domains.length > 0) {
      resultDiv.textContent = _mmT('moemail.addedDomains', { n: domains.length }, '添加成功，可用域名 {n} 个');
    } else {
      resultDiv.textContent = _mmT('moemail.addedOk', '添加成功');
    }

    updateMoeMailUI();

    setTimeout(() => {
      resultDiv.style.display = 'none';
    }, 2000);
  } catch (e) {
    resultDiv.style.color = 'var(--danger)';
    resultDiv.textContent = _mmT('moemail.testFailedAddDeny', { err: e }, '测试失败: {err}，无法添加配置');
  }
}

// 测试指定配置
async function testMoeMailConfigByIndex(index) {
  if (index < 0 || index >= moemailConfigs.length) return;

  const config = moemailConfigs[index];
  try {
    const result = await window.go.main.App.TestMoeMailConnection(JSON.stringify(config));
    if (result.error) {
      moemailConfigStatus[config.name] = { tested: true, success: false, domains: [] };
      saveMoeMailConfigStatus();
      renderMoeMailConfigList();
      updateMoeMailUI();

      let errorMsg = result.error;
      if (errorMsg.includes('403')) {
        errorMsg = _mmT('moemail.err403Short', 'API Key 权限不足');
      } else if (errorMsg.includes('401')) {
        errorMsg = _mmT('moemail.err401Short', 'API Key 无效');
      } else if (errorMsg.includes('404')) {
        errorMsg = _mmT('moemail.err404Short', 'API 地址错误');
      } else if (errorMsg.includes('timeout') || errorMsg.includes('连接')) {
        errorMsg = _mmT('moemail.errTimeoutShort', '连接超时');
      }
      showToast(config.name + ': ' + errorMsg, 'error');
    } else {
      const domains = result.domains || [];
      moemailConfigStatus[config.name] = {
        tested: true,
        success: true,
        domains: domains,
        domainCount: domains.length
      };
      saveMoeMailConfigStatus();
      renderMoeMailConfigList();
      updateMoeMailUI();

      if (domains.length > 0) {
        showToast(config.name + ': ' + _mmT('moemail.testOkWithDomains', { n: domains.length }, '连接成功，可用域名 {n} 个'), 'success');
      } else {
        showToast(config.name + ': ' + _mmT('moemail.testOkNoDomain', '连接成功，但未返回可用域名'), 'warning');
      }
    }
  } catch (e) {
    moemailConfigStatus[config.name] = { tested: true, success: false, domains: [] };
    saveMoeMailConfigStatus();
    renderMoeMailConfigList();
    updateMoeMailUI();
    showToast(config.name + ': ' + _mmT('moemail.testFailedShort', '测试失败'), 'error');
  }
}

// 删除配置
async function deleteMoeMailConfig(index) {
  if (index < 0 || index >= moemailConfigs.length) return;

  const configName = moemailConfigs[index].name;
  showConfirmModal(
    _mmT('moemail.deleteConfigTitle', '删除配置'),
    _mmT('moemail.deleteConfigMsg', { name: configName }, '确认删除配置 "{name}" 吗？'),
    _mmT('accounts.deleteConfirm', '确认删除'),
    async function() {
      moemailConfigs.splice(index, 1);

      try {
        const result = await window.go.main.App.SaveMoeMailConfigs(JSON.stringify(moemailConfigs));
        if (result.error) {
          showToast(_mmT('toast.deleteFailed', '删除失败') + ': ' + result.error, 'error');
          await loadMoeMailConfigs();
          return;
        }

        updateMoeMailUI();
        showToast(_mmT('toast.deleteOk', '删除成功'), 'success');
      } catch (e) {
        showToast(_mmT('toast.deleteFailed', '删除失败') + ': ' + e, 'error');
        await loadMoeMailConfigs();
      }
    }
  );
}

// 清空所有配置
async function clearAllMoeMailConfigs() {
  if (moemailConfigs.length === 0) {
    showToast(_mmT('moemail.nothingToClear', '没有配置可清空'), 'info');
    return;
  }

  showConfirmModal(
    _mmT('moemail.clearAllTitle', '清空 MoeMail 配置'),
    _mmT('moemail.clearAllMsg', '确认清空所有 MoeMail 配置吗？此操作不可恢复。'),
    _mmT('accounts.clearAllConfirm', '确认清空'),
    async function() {
      moemailConfigs = [];

      try {
        const result = await window.go.main.App.SaveMoeMailConfigs(JSON.stringify(moemailConfigs));
        if (result.error) {
          showToast(_mmT('toast.clearFailed', '清空失败') + ': ' + result.error, 'error');
          await loadMoeMailConfigs();
          return;
        }

        updateMoeMailUI();
        showToast(_mmT('moemail.allCleared', '已清空所有配置'), 'success');
      } catch (e) {
        showToast(_mmT('toast.clearFailed', '清空失败') + ': ' + e, 'error');
        await loadMoeMailConfigs();
      }
    }
  );
}

// 启动时自动测试所有配置
async function autoTestAllMoeMailConfigs() {
  if (moemailConfigs.length === 0) return;
  console.log('[MoeMail] 启动自动测试，共 ' + moemailConfigs.length + ' 个配置');
  for (let i = 0; i < moemailConfigs.length; i++) {
    const config = moemailConfigs[i];
    try {
      const result = await window.go.main.App.TestMoeMailConnection(JSON.stringify(config));
      if (result.error) {
        moemailConfigStatus[config.name] = { tested: true, success: false, domains: [] };
      } else {
        const domains = result.domains || [];
        moemailConfigStatus[config.name] = { tested: true, success: true, domains: domains, domainCount: domains.length };
      }
    } catch (e) {
      moemailConfigStatus[config.name] = { tested: true, success: false, domains: [] };
    }
  }
  saveMoeMailConfigStatus();
  updateMoeMailUI();
  console.log('[MoeMail] 自动测试完成');
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', async function() {
  await loadMoeMailConfigs();
  autoTestAllMoeMailConfigs();
});

// 语言切换后重新渲染 MoeMail UI（状态/摘要/空态等动态文本）
window.addEventListener('i18n:changed', function() {
  try { if (typeof updateMoeMailUI === 'function') updateMoeMailUI(); } catch (e) {}
});
