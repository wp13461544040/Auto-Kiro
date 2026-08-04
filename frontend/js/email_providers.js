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
    return '<img src="assets/outlook.png" style="width:18px;height:18px;border-radius:4px;">';
  }

  if (provider.id === 'moemail') {
    return '<svg viewBox="0 0 32 32" width="18" height="18" fill="none" style="color:' + provider.color + ';">' +
           '<path d="M4 8h24v16H4V8z" fill="currentColor" opacity="0.2"/>' +
           '<path d="M4 8h24v2H4V8zM4 22h24v2H4v-2z" fill="currentColor"/>' +
           '<path d="M14 12h4v4h-4v-4zM12 14h2v4h-2v-4zM18 14h2v4h-2v-4zM14 18h4v2h-4v-2z" fill="currentColor"/>' +
           '<path d="M4 8l12 8 12-8" stroke="currentColor" stroke-width="2" fill="none"/>' +
           '<path d="M8 18h2v2H8v-2zM22 18h2v2h-2v-2z" fill="currentColor" opacity="0.6"/>' +
           '<path d="M8 14h2v2H8v-2zM22 14h2v2h-2v-2z" fill="currentColor" opacity="0.4"/>' +
           '</svg>';
  }

  if (provider.id === 'mailnest') {
    return '<svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 183 173" style="flex-shrink:0;">' +
           '<path d="M149.29,152.09c-16.99,7.44-19.61,1.05-28.15,5.87h17.22c-7.73,11-24.54,5.73-31.95,6.26-8.68.63-17.04,3.96-25.77,3.51-11.01-.57-20.76-4.18-30.16-9.4,16.2-1.43,20.85,5.07,39.15,2.43l-5.93-2.86c14.19-5.88,8.11-3.03,22.62-1.69,8.27-3.06,15.4-6.74,22.41-11.75l-19.65.99,5.51-4.62c-4.63.86-7.93,1.92-11.89,3.47-22.53,8.79-60.2,19.3-79.17-.74-1.04-1.09-1.52-4.01-.78-4.95,3.43-4.37,13.59,10.32,27.37,8.15l-6.75-5.27,13.19.98c5.01.37,4.36,7.31,26.37-.05-6.52-1.27-11.58-2.21-17.42-3.01-12.25-1.67-16.05,1.93-28.43-9.57l3.62-.97c-12.1-8.44-28.76-16.76-34.65-31.51-.49-1.23.6-4.19,1.66-4.68,5.44-2.51,6.15,8.09,13.18,13-3.34-10.4-5.8-19.32-3.53-29.91.84-3.91,3.24-9.34,7.74-8.95,1.06.09,2.5,2.52,1.94,3.69-8.03,16.58.35,38.17,15.9,48.74l.29-29.62c.04-4.01,3.2-7.6,7.5-7.6l81.48.08c4.65,0,7.12,3.11,7.09,7.33l-.17,24.63c-18.29,15.4-37.32,18.58-60.21,18.12,28.74,5.65,67.93-8.09,76.11-39.1,1.89-7.15.77-14.66-1.69-21.33-.45-1.21,2.22-3.57,3.23-3.14s3.32,1.9,3.77,2.96c5.89,13.56,2.83,28.3-5.65,40.51-8.18,11.78-20.76,18.68-33.44,25.04,23.17-1.26,23.3-7.35,34.97-22.79,10.5-13.91,7.61-24.11,12.27-23.33,6.01,1,1.6,13.83-.06,16.73l-9.57,16.73c7.52-2.13,7.92-11.3,12.46-11.23,3.22.05,3.7,6.68-3.5,13.77-11.39,11.21-19.4,7.63-30.89,20.99,12.72.91,21.15-11.29,25.45-11.38,2.92-.06-1.84,10.52-13.1,15.45ZM96.46,124.22l35.23-31.84c-13.24,7.1-23.58,16.45-35.65,24.57-3.48,2.34-7.17,1.7-10.45-.71-10.33-7.59-19.95-14.88-31.19-22.15,5.52,7.01,11.97,11.55,17.92,17.54s17.22,18.84,24.14,12.59Z"/>' +
           '<path d="M102.05,78.43c4.96-7.1,7.92-14.67,3.81-23.18-.95,8.35-4.11,15.1-11.91,18.81-4.73,2.25-10.86,4.11-16.45,4.15l-34.33.23,32.63-31.47c17.05-16.44,16.03-36.89,37.55-39.73,9.66-1.27,18.53,3.02,23.35,11.39l13.59,1.32c-4.22,3.93-8.6,5.43-11.16,9.71-3.41,5.7,7.62,30.02-10.64,49.16-8.72.08-16.29.11-26.43-.39ZM126.67,24.47c0-2.33-1.89-4.22-4.22-4.22s-4.22,1.89-4.22,4.22,1.89,4.22,4.22,4.22,4.22-1.89,4.22-4.22Z"/>' +
           '<path d="M36.3,135.84c-8.93-.4-18.07-4.1-24.22-10.39-3.67-3.75-4.98-10.13.21-13.51,6.98,15.26,12.1,8.42,24.01,23.89Z"/>' +
           '</svg>';
  }

  if (provider.id === 'remail') {
    return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
           '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>' +
           '<polyline points="22,6 12,13 2,6"/>' +
           '</svg>';
  }

  if (provider.id === 'cloudmail') {
    return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="' + provider.color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
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

  // 用 data-provider-id 属性定位卡片，改为 display 控制显隐 + order 控制顺序
  // 避免 remove/appendChild 破坏已初始化的 DOM 状态
  var cardIds = {
    'moemail':   'accounts-card-moemail',
    'cloudmail': 'accounts-card-cloudmail',
    'outlook':   'accounts-card-outlook',
    'mailnest':  'accounts-card-mailnest',
    'remail':    'accounts-card-remail'
  };

  // 先确保 scrollContainer 是 flex 容器，支持 order
  scrollContainer.style.display = 'flex';
  scrollContainer.style.flexDirection = 'column';

  providers.forEach(function(provider, index) {
    var cardId = cardIds[provider.id];
    if (!cardId) return;
    var card = document.getElementById(cardId);
    if (!card) return;
    card.style.display = provider.visible ? '' : 'none';
    card.style.order = index;
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
