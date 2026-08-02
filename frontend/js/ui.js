// ===== UI工具：Toast / 窗口控制 / 主题 / 健康检查 / 邮箱提供商 =====

// Toast 通知
function showToast(msg, type) {
  // 容器
  var container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  var toast = document.createElement('div');
  toast.className = 'toast-item' + (type === 'error' ? ' toast-error' : ' toast-success');

  // 图标
  var icon = type === 'error'
    ? '<svg viewBox="0 0 24 24" class="toast-icon"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>'
    : '<svg viewBox="0 0 24 24" class="toast-icon"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>';

  toast.innerHTML = icon + '<span class="toast-msg">' + msg + '</span>' +
    '<div class="toast-progress"><div class="toast-progress-bar"></div></div>';

  container.appendChild(toast);

  // 触发入场动画
  requestAnimationFrame(function() { toast.classList.add('show'); });

  // 自动消失
  setTimeout(function() {
    toast.classList.remove('show');
    toast.classList.add('hide');
    setTimeout(function() { toast.remove(); }, 400);
  }, 3000);
}

// 窗口控制
function closeApp() {
  try {
    if (window.runtime && window.runtime.Quit) { window.runtime.Quit(); }
    else { window.close(); }
  } catch (e) { console.error('关闭窗口失败:', e); }
}

function minimizeApp() {
  try {
    if (window.runtime && window.runtime.WindowMinimise) { window.runtime.WindowMinimise(); }
  } catch (e) { console.error('最小化窗口失败:', e); }
}

function maximizeApp() {
  try {
    if (window.runtime && window.runtime.WindowToggleMaximise) { window.runtime.WindowToggleMaximise(); }
  } catch (e) { console.error('最大化窗口失败:', e); }
}

// 主题切换（View Transition 圆形扩展动画）
function toggleTheme(e) {
  // 注入样式禁用所有 transition，防止主题切换闪烁
  var lockStyle = document.createElement('style');
  lockStyle.textContent = '*, *::before, *::after { transition-duration: 0s !important; }';
  document.head.appendChild(lockStyle);

  var applyTheme = function() {
    var html = document.documentElement;
    var isDark = html.getAttribute('data-theme') === 'dark';
    if (isDark) {
      html.removeAttribute('data-theme');
      localStorage.setItem('kiro-theme', 'light');
      document.getElementById('theme-icon-light').style.display = '';
      document.getElementById('theme-icon-dark').style.display = 'none';
    } else {
      html.setAttribute('data-theme', 'dark');
      localStorage.setItem('kiro-theme', 'dark');
      document.getElementById('theme-icon-light').style.display = 'none';
      document.getElementById('theme-icon-dark').style.display = '';
    }
  };

  var unlockTransitions = function() {
    setTimeout(function() { lockStyle.remove(); }, 100);
  };

  // 不支持 View Transition 时直接切换
  if (!document.startViewTransition) {
    applyTheme();
    unlockTransitions();
    return;
  }

  var transition = document.startViewTransition(applyTheme);
  transition.finished.then(unlockTransitions);
  transition.ready.then(function() {
    var clientX = 0;
    var clientY = innerHeight;
    var radius = Math.hypot(
      Math.max(clientX, innerWidth - clientX),
      Math.max(clientY, innerHeight - clientY)
    );
    document.documentElement.animate(
      { clipPath: [
        'circle(0% at ' + clientX + 'px ' + clientY + 'px)',
        'circle(' + radius + 'px at ' + clientX + 'px ' + clientY + 'px)'
      ]},
      {
        duration: 500,
        easing: 'ease-in-out',
        pseudoElement: '::view-transition-new(root)'
      }
    );
  });
}

// 恢复主题
(function() {
  var saved = localStorage.getItem('kiro-theme');
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    var light = document.getElementById('theme-icon-light');
    var dark = document.getElementById('theme-icon-dark');
    if (light) light.style.display = 'none';
    if (dark) dark.style.display = '';
  }
})();

// 快捷键
document.addEventListener('keydown', function(e) {
  // Ctrl+Enter 开始任务
  if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault();
    if (!document.getElementById('btn-start').disabled) startTask();
  }
  // Esc 停止任务
  if (e.key === 'Escape') {
    if (!document.getElementById('btn-stop').disabled) stopTask();
  }
});

// 当前选中的邮箱提供商
var selectedEmailProvider = 'outlook';
var selectedMoeMailDomains = [];
var allMoeMailDomains = []; // 存储所有可用域名及其配置映射
var selectedCloudMailDomains = [];
var allCloudMailDomains = []; // 存储所有 cloud-mail 域名及对应配置

// HTML 转义函数
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 初始化邮箱提供商选择（页面加载时调用）
function initEmailProviderSelection() {
  // 默认选中 Outlook
  selectEmailProvider('outlook');
}

// 选择邮箱提供商
function selectEmailProvider(provider) {
  selectedEmailProvider = provider;

  // 更新按钮样式
  const outlookBtn = document.querySelector('label[onclick*="outlook"]');
  const moemailBtn = document.querySelector('label[onclick*="moemail"]');
  const cloudmailBtn = document.querySelector('label[onclick*="cloudmail"]');
  const mailnestBtn = document.querySelector('label[onclick*="mailnest"]');
  const remailBtn = document.querySelector('label[onclick*="remail"]');

  // 全部还原
  [outlookBtn, moemailBtn, cloudmailBtn, mailnestBtn, remailBtn].forEach(b => {
    if (b) { b.style.borderColor = 'var(--border)'; b.style.background = 'transparent'; }
  });

  let activeBtn = outlookBtn;
  if (provider === 'moemail') activeBtn = moemailBtn;
  else if (provider === 'cloudmail') activeBtn = cloudmailBtn;
  else if (provider === 'mailnest') activeBtn = mailnestBtn;
  else if (provider === 'remail') activeBtn = remailBtn;
  if (activeBtn) {
    activeBtn.style.borderColor = 'var(--primary)';
    activeBtn.style.background = 'rgba(59, 130, 246, 0.1)';
  }

  // 显示/隐藏配置块
  const moemailConfigDiv = document.getElementById('moemail-config-select');
  const cloudmailConfigDiv = document.getElementById('cloudmail-config-select');
  const hintDiv = document.getElementById('email-provider-hint');

  if (moemailConfigDiv) moemailConfigDiv.style.display = (provider === 'moemail') ? 'block' : 'none';
  if (cloudmailConfigDiv) cloudmailConfigDiv.style.display = (provider === 'cloudmail') ? 'block' : 'none';

  if (provider === 'moemail') {
    hintDiv.removeAttribute('data-i18n');
    hintDiv.textContent = _uiT('register.moemailHint', '使用 MoeMail 临时邮箱进行注册，每次任务会自动生成新邮箱。');
    hintDiv.setAttribute('data-i18n', 'register.moemailHint');
    loadMoeMailDomainsToList();
  } else if (provider === 'cloudmail') {
    hintDiv.removeAttribute('data-i18n');
    hintDiv.textContent = _uiT('register.cloudmailHint', '使用 Cloud-Mail 自部署邮箱注册。⚠️ 每次注册会创建永久账号，需手动清理。');
    hintDiv.setAttribute('data-i18n', 'register.cloudmailHint');
    loadCloudMailDomainsToList();
  } else if (provider === 'outlook') {
    hintDiv.removeAttribute('data-i18n');
    hintDiv.textContent = _uiT('register.outlookHintFull', '使用微软邮箱进行注册，代理配置请在设置页设置。');
    hintDiv.setAttribute('data-i18n', 'register.outlookHintFull');
  } else if (provider === 'remail') {
    hintDiv.removeAttribute('data-i18n');
    hintDiv.textContent = '使用 Remail 临时邮箱进行注册，支持接包模式和购买模式。请先在邮箱池页面配置 API Key。';
    hintDiv.setAttribute('data-i18n', 'register.remailHint');
  } else {
    hintDiv.removeAttribute('data-i18n');
    hintDiv.textContent = _uiT('register.mailnestHintFull', '使用 MailNest 提供的临时 Outlook 邮箱进行注册，代理配置请在设置页设置。');
    hintDiv.setAttribute('data-i18n', 'register.mailnestHintFull');
  }
}

function _uiT(key, fallback) {
  if (window.I18N && typeof window.I18N.t === 'function') {
    var v = window.I18N.t(key);
    if (v && v !== key) return v;
  }
  return fallback;
}

// 加载 MoeMail 域名到列表
async function loadMoeMailDomainsToList() {
  const listDiv = document.getElementById('cfg-moemail-domains-list');
  if (!listDiv) return;

  listDiv.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:12px;">' + _uiT('common.loading', '加载中...') + '</div>';

  try {
    const configs = await window.go.main.App.GetMoeMailConfigs();

    if (!configs || configs.length === 0) {
      listDiv.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:12px;">' + _uiT('moemail.noDomainsHint', '暂无配置，请先在设置页添加') + '</div>';
      return;
    }

    let configStatus = {};
    try {
      const saved = localStorage.getItem('moemail-config-status');
      if (saved) configStatus = JSON.parse(saved);
    } catch (e) {}

    allMoeMailDomains = [];
    const domainConfigMap = {};

    for (const cfg of configs) {
      const status = configStatus[cfg.name];
      if (status && status.tested && status.success && status.domains && status.domains.length > 0) {
        for (const domain of status.domains) {
          if (!domainConfigMap[domain]) domainConfigMap[domain] = [];
          domainConfigMap[domain].push(cfg);
        }
      }
    }

    allMoeMailDomains = Object.keys(domainConfigMap).map(domain => ({
      domain: domain,
      configs: domainConfigMap[domain]
    }));

    if (allMoeMailDomains.length === 0) {
      listDiv.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:12px;">暂无可用域名，请先测试配置</div>';
      return;
    }

    let html = `
      <div class="domain-mode-row">
        <div class="domain-mode-btn selected" data-domain="__random__" onclick="toggleMoeMailDomain('__random__')">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
          随机
        </div>
        <div class="domain-mode-btn" data-domain="__all__" onclick="toggleMoeMailDomain('__all__')">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
          轮询
        </div>
      </div>
      <div class="domain-chips-wrap">
    `;

    html += allMoeMailDomains.map((item) => {
      return `<div class="domain-chip" data-domain="${escapeHtml(item.domain)}" onclick="toggleMoeMailDomain('${escapeHtml(item.domain)}')" title="${item.configs.length} 个配置">${escapeHtml(item.domain)}</div>`;
    }).join('');

    html += '</div>';

    listDiv.innerHTML = html;
    selectedMoeMailDomains = ['__random__'];
    updateDomainOptionStyles();

  } catch (e) {
    console.error('加载 MoeMail 域名失败:', e);
    listDiv.innerHTML = '<div style="text-align:center;color:var(--danger);font-size:12px;padding:12px;">加载失败</div>';
  }
}

// 更新域名选项的视觉状态
function updateDomainOptionStyles() {
  document.querySelectorAll('.domain-mode-btn').forEach(el => {
    const domain = el.getAttribute('data-domain');
    el.classList.toggle('selected', selectedMoeMailDomains.includes(domain));
  });
  document.querySelectorAll('.domain-chip').forEach(el => {
    const domain = el.getAttribute('data-domain');
    el.classList.toggle('selected', selectedMoeMailDomains.includes(domain));
  });
}

// 切换域名选择
function toggleMoeMailDomain(domain, el) {
  const isSelected = selectedMoeMailDomains.includes(domain);

  if (domain === '__random__' || domain === '__all__') {
    if (isSelected) {
      selectedMoeMailDomains = selectedMoeMailDomains.filter(d => d !== domain);
    } else {
      selectedMoeMailDomains = [domain];
    }
  } else {
    // 点击具体域名：先清除 __random__ 和 __all__
    selectedMoeMailDomains = selectedMoeMailDomains.filter(d => d !== '__random__' && d !== '__all__');
    if (isSelected) {
      selectedMoeMailDomains = selectedMoeMailDomains.filter(d => d !== domain);
    } else {
      selectedMoeMailDomains.push(domain);
    }
  }

  updateDomainOptionStyles();
}

// 全选域名
function selectAllMoeMailDomains() {
  selectedMoeMailDomains = allMoeMailDomains.map(item => item.domain);
  updateDomainOptionStyles();
}

// ===== Cloud-Mail 域名加载/选择 =====
async function loadCloudMailDomainsToList() {
  const listDiv = document.getElementById('cfg-cloudmail-domains-list');
  if (!listDiv) return;

  listDiv.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:12px;">' + _uiT('common.loading', '加载中...') + '</div>';

  try {
    const configs = await window.go.main.App.GetCloudMailConfigs();
    if (!configs || configs.length === 0) {
      listDiv.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:12px;">' + _uiT('cloudmail.noDomainsHint', '暂无配置，请先在邮箱池页添加') + '</div>';
      return;
    }

    let configStatus = {};
    try {
      const saved = localStorage.getItem('cloudmail-config-status');
      if (saved) configStatus = JSON.parse(saved);
    } catch (e) {}

    allCloudMailDomains = [];
    const domainConfigMap = {};

    for (const cfg of configs) {
      const status = configStatus[cfg.name];
      // 只展示已通过测试的配置（与 moemail 一致）
      if (!status || !status.tested || !status.success) continue;
      // 优先用服务器自动拉到的域名，否则回退到配置里手填的
      const domains = (status.domains && status.domains.length > 0) ? status.domains : (cfg.domains || []);
      for (const domain of domains) {
        if (!domainConfigMap[domain]) domainConfigMap[domain] = [];
        domainConfigMap[domain].push(cfg);
      }
    }

    allCloudMailDomains = Object.keys(domainConfigMap).map(domain => ({
      domain: domain,
      configs: domainConfigMap[domain]
    }));

    if (allCloudMailDomains.length === 0) {
      listDiv.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:12px;">' + _uiT('cloudmail.noActiveDomain', '暂无可用域名，请先测试 Cloud-Mail 配置') + '</div>';
      return;
    }

    let html = `
      <div class="domain-mode-row">
        <div class="domain-mode-btn selected" data-domain="__random__" onclick="toggleCloudMailDomain('__random__')">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
          ${_uiT('register.modeRandom', '随机')}
        </div>
        <div class="domain-mode-btn" data-domain="__all__" onclick="toggleCloudMailDomain('__all__')">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
          ${_uiT('register.modeRoundRobin', '轮询')}
        </div>
      </div>
      <div class="domain-chips-wrap">
    `;

    html += allCloudMailDomains.map((item) => {
      return `<div class="domain-chip" data-domain="${escapeHtml(item.domain)}" onclick="toggleCloudMailDomain('${escapeHtml(item.domain)}')" title="${item.configs.length} 个配置">${escapeHtml(item.domain)}</div>`;
    }).join('');

    html += '</div>';
    listDiv.innerHTML = html;
    selectedCloudMailDomains = ['__random__'];
    updateCloudMailDomainStyles();
  } catch (e) {
    console.error('加载 Cloud-Mail 域名失败:', e);
    listDiv.innerHTML = '<div style="text-align:center;color:var(--danger);font-size:12px;padding:12px;">加载失败</div>';
  }
}

function updateCloudMailDomainStyles() {
  const container = document.getElementById('cfg-cloudmail-domains-list');
  if (!container) return;
  container.querySelectorAll('.domain-mode-btn').forEach(el => {
    const d = el.getAttribute('data-domain');
    el.classList.toggle('selected', selectedCloudMailDomains.includes(d));
  });
  container.querySelectorAll('.domain-chip').forEach(el => {
    const d = el.getAttribute('data-domain');
    el.classList.toggle('selected', selectedCloudMailDomains.includes(d));
  });
}

function toggleCloudMailDomain(domain) {
  const isSelected = selectedCloudMailDomains.includes(domain);
  if (domain === '__random__' || domain === '__all__') {
    if (isSelected) {
      selectedCloudMailDomains = selectedCloudMailDomains.filter(d => d !== domain);
    } else {
      selectedCloudMailDomains = [domain];
    }
  } else {
    selectedCloudMailDomains = selectedCloudMailDomains.filter(d => d !== '__random__' && d !== '__all__');
    if (isSelected) {
      selectedCloudMailDomains = selectedCloudMailDomains.filter(d => d !== domain);
    } else {
      selectedCloudMailDomains.push(domain);
    }
  }
  updateCloudMailDomainStyles();
}

function selectAllCloudMailDomains() {
  selectedCloudMailDomains = allCloudMailDomains.map(item => item.domain);
  updateCloudMailDomainStyles();
}

// 关闭任务模态框
function closeKiroTaskModal() {
  document.getElementById('kiro-task-modal').classList.remove('show');
}

// ===== 模态框遮罩层关闭逻辑（仅当 mousedown 和 mouseup 都在遮罩层上时才关闭） =====
(function() {
  var modalCloseMap = {
    'kiro-task-modal': function() { closeKiroTaskModal(); },
    'outlook-modal': function() { if (typeof closeOutlookModal === 'function') closeOutlookModal(); },
    'moemail-modal': function() { if (typeof closeMoeMailModal === 'function') closeMoeMailModal(); }
  };

  var mouseDownTarget = null;

  Object.keys(modalCloseMap).forEach(function(id) {
    var overlay = document.getElementById(id);
    if (!overlay) return;

    overlay.addEventListener('mousedown', function(e) {
      mouseDownTarget = e.target;
    });

    overlay.addEventListener('mouseup', function(e) {
      if (mouseDownTarget === overlay && e.target === overlay) {
        modalCloseMap[id]();
      }
      mouseDownTarget = null;
    });
  });
})();

