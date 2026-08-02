// ===== 邮箱提供商显示管理 =====

// 默认邮箱提供商配置
var defaultEmailProviders = [
  { id: 'moemail', name: 'MoeMail', icon: 'moemail-icon', visible: true, color: '#8b5cf6' },
  { id: 'mailnest', name: 'MailNest', icon: 'mailnest-icon', visible: true, color: '#f59e0b' },
  { id: 'remail', name: 'Remail', icon: 'remail-icon', visible: true, color: '#10b981' },
  { id: 'outlook', name: 'Outlook', icon: 'outlook-img', visible: true, color: '#0078d4' },
  { id: 'cloudmail', name: 'Cloud-Mail', icon: 'cloudmail-icon', visible: false, color: '#0ea5e9' }
];

// 加载邮箱提供商配置
function loadEmailProvidersConfig() {
  try {
    var saved = localStorage.getItem('kiro-email-providers');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('[EmailProviders] 加载配置失败:', e);
  }
  return defaultEmailProviders;
}

// 保存邮箱提供商配置
function saveEmailProvidersConfig(providers) {
  try {
    localStorage.setItem('kiro-email-providers', JSON.stringify(providers));
    return true;
  } catch (e) {
    console.error('[EmailProviders] 保存配置失败:', e);
    return false;
  }
}

// 渲染设置页面的提供商列表
function renderEmailProvidersSettings() {
  var container = document.getElementById('email-providers-list');
  if (!container) return;
  
  var providers = loadEmailProvidersConfig();
  
  var html = '';
  providers.forEach(function(provider, index) {
    html += '<div class="email-provider-item" data-index="' + index + '" draggable="true" ';
    html += 'ondragstart="handleProviderDragStart(event)" ';
    html += 'ondragover="handleProviderDragOver(event)" ';
    html += 'ondrop="handleProviderDrop(event)" ';
    html += 'ondragend="handleProviderDragEnd(event)">';
    html += '  <div style="display:flex;align-items:center;gap:12px;flex:1;">';
    html += '    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--text-muted)" stroke-width="2" style="cursor:grab;">';
    html += '      <line x1="3" y1="9" x2="21" y2="9"/>';
    html += '      <line x1="3" y1="15" x2="21" y2="15"/>';
    html += '    </svg>';
    
    // 渲染图标
    html += '    <div style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;">';
    html += getProviderIconHTML(provider);
    html += '    </div>';
    
    html += '    <span style="font-size:13px;font-weight:600;color:var(--text);">' + provider.name + '</span>';
    html += '  </div>';
    html += '  <label style="cursor:pointer;display:flex;align-items:center;">';
    html += '    <div class="toggle-switch">';
    html += '      <input type="checkbox" ' + (provider.visible ? 'checked' : '') + ' onchange="toggleProviderVisibility(' + index + ')">';
    html += '      <span class="toggle-slider"></span>';
    html += '    </div>';
    html += '  </label>';
    html += '</div>';
  });
  
  container.innerHTML = html;
}

// 获取提供商图标HTML
function getProviderIconHTML(provider) {
  if (provider.id === 'outlook') {
    return '<img src="assets/outlook.png" style="width:20px;height:20px;border-radius:4px;">';
  }
  
  if (provider.id === 'moemail') {
    return '<svg viewBox="0 0 32 32" width="20" height="20" fill="none" style="color:' + provider.color + ';">' +
           '<path d="M16 4L4 10v12c0 7.5 5.2 11.5 12 13 6.8-1.5 12-5.5 12-13V10L16 4z" stroke="currentColor" stroke-width="2" fill="currentColor" opacity="0.2"/>' +
           '<path d="M16 4L4 10v12c0 7.5 5.2 11.5 12 13 6.8-1.5 12-5.5 12-13V10L16 4z" stroke="currentColor" stroke-width="2" fill="none"/>' +
           '<circle cx="16" cy="15" r="3" fill="currentColor"/>' +
           '</svg>';
  }
  
  if (provider.id === 'mailnest') {
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="' + provider.color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
           '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>' +
           '<polyline points="22,6 12,13 2,6"/>' +
           '</svg>';
  }
  
  if (provider.id === 'remail') {
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="' + provider.color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
           '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>' +
           '<polyline points="22,6 12,13 2,6"/>' +
           '</svg>';
  }
  
  if (provider.id === 'cloudmail') {
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="' + provider.color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
           '<path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/>' +
           '</svg>';
  }
  
  return '';
}

// 切换提供商显示/隐藏
function toggleProviderVisibility(index) {
  var providers = loadEmailProvidersConfig();
  providers[index].visible = !providers[index].visible;
  saveEmailProvidersConfig(providers);
  
  // 重新渲染注册页面和邮箱池页面的提供商选项
  renderEmailProvidersOnRegisterPage();
  renderEmailProvidersOnAccountsPage();
}

// 拖拽事件处理
var draggedProviderIndex = null;

function handleProviderDragStart(e) {
  draggedProviderIndex = parseInt(e.currentTarget.getAttribute('data-index'));
  e.currentTarget.style.opacity = '0.4';
  e.dataTransfer.effectAllowed = 'move';
}

function handleProviderDragOver(e) {
  if (e.preventDefault) e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleProviderDrop(e) {
  if (e.stopPropagation) e.stopPropagation();
  
  var dropIndex = parseInt(e.currentTarget.getAttribute('data-index'));
  
  if (draggedProviderIndex !== null && draggedProviderIndex !== dropIndex) {
    var providers = loadEmailProvidersConfig();
    
    // 交换位置
    var temp = providers[draggedProviderIndex];
    providers.splice(draggedProviderIndex, 1);
    providers.splice(dropIndex, 0, temp);
    
    saveEmailProvidersConfig(providers);
    renderEmailProvidersSettings();
    renderEmailProvidersOnRegisterPage();
    renderEmailProvidersOnAccountsPage();
  }
  
  return false;
}

function handleProviderDragEnd(e) {
  e.currentTarget.style.opacity = '1';
  draggedProviderIndex = null;
}

// 在注册页面渲染邮箱提供商
function renderEmailProvidersOnRegisterPage() {
  var container = document.querySelector('#page-register .form-group [style*="display:flex;gap:8px"]');
  if (!container) return;
  
  var providers = loadEmailProvidersConfig();
  var visibleProviders = providers.filter(function(p) { return p.visible; });
  
  if (visibleProviders.length === 0) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">未配置可见的邮箱提供商</div>';
    return;
  }
  
  var html = '';
  visibleProviders.forEach(function(provider, index) {
    var isFirst = index === 0;
    html += '<label style="flex:1;display:flex;align-items:center;justify-content:center;padding:10px;border:2px solid var(--border);border-radius:var(--radius);cursor:pointer;transition:all 0.2s;" onclick="selectEmailProvider(\'' + provider.id + '\')">';
    html += '  <input type="radio" name="email-provider" value="' + provider.id + '"' + (isFirst ? ' checked' : '') + ' style="display:none;">';
    html += '  <div id="provider-' + provider.id + '" style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--text);">';
    html += getProviderIconHTML(provider);
    html += '    <span>' + provider.name + '</span>';
    html += '  </div>';
    html += '</label>';
  });
  
  container.innerHTML = html;
  
  // 重新初始化选择状态
  if (visibleProviders.length > 0 && typeof selectEmailProvider === 'function') {
    selectEmailProvider(visibleProviders[0].id);
  }
}

// 在邮箱池页面渲染邮箱提供商卡片
function renderEmailProvidersOnAccountsPage() {
  var pageAccounts = document.getElementById('page-accounts');
  if (!pageAccounts) return;
  
  var scrollContainer = pageAccounts.querySelector('.page-scroll');
  if (!scrollContainer) return;
  
  var providers = loadEmailProvidersConfig();
  
  // 获取所有卡片的映射
  var cardMap = {
    'moemail': scrollContainer.querySelector('.card:has(#settings-moemail-summary)'),
    'cloudmail': scrollContainer.querySelector('.card:has(#settings-cloudmail-summary)'),
    'outlook': scrollContainer.querySelector('.card:has(#outlook-count)'),
    'mailnest': scrollContainer.querySelector('.card:has(#settings-mailnest-summary)'),
    'remail': scrollContainer.querySelector('.card:has(#remail-configs-list)')
  };
  
  // 保存所有卡片到临时数组
  var cards = {};
  for (var id in cardMap) {
    if (cardMap[id]) {
      cards[id] = cardMap[id];
      cardMap[id].remove(); // 从 DOM 中移除
    }
  }
  
  // 按配置的顺序重新添加可见的卡片
  providers.forEach(function(provider) {
    if (provider.visible && cards[provider.id]) {
      scrollContainer.appendChild(cards[provider.id]);
    }
  });
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function() {
  // 切换到设置页面时渲染提供商设置
  var originalSwitchPage = window.switchPage;
  if (originalSwitchPage) {
    window.switchPage = function(pageId) {
      originalSwitchPage(pageId);
      if (pageId === 'settings') {
        setTimeout(renderEmailProvidersSettings, 100);
      } else if (pageId === 'accounts') {
        setTimeout(renderEmailProvidersOnAccountsPage, 100);
      }
    };
  }
  
  // 初始化注册页面
  renderEmailProvidersOnRegisterPage();
  
  // 初始化邮箱池页面
  renderEmailProvidersOnAccountsPage();
});
