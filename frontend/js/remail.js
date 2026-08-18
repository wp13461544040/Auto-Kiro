// ===== Remail 配置管理 =====

var remailConfigs = [];
var remailInitialized = false;

// 初始化 Remail 按钮事件
function initRemailButtons() {
  var addBtn = document.getElementById('btn-add-remail-config');
  if (addBtn && !remailInitialized) {
    addBtn.onclick = function(e) {
      e.preventDefault();
      showAddRemailModal();
    };
  }

  var closeXBtn = document.getElementById('btn-close-remail-modal-x');
  if (closeXBtn && !remailInitialized) {
    closeXBtn.onclick = function(e) { e.preventDefault(); closeRemailModal(); };
  }

  var cancelBtn = document.getElementById('btn-cancel-remail-config');
  if (cancelBtn && !remailInitialized) {
    cancelBtn.onclick = function(e) { e.preventDefault(); closeRemailModal(); };
  }

  var saveBtn = document.getElementById('btn-save-remail-config');
  if (saveBtn && !remailInitialized) {
    saveBtn.onclick = function(e) { e.preventDefault(); saveRemailConfig(); };
  }

  var refreshBtn = document.getElementById('btn-refresh-remail-projects');
  if (refreshBtn && !remailInitialized) {
    refreshBtn.onclick = function(e) { e.preventDefault(); refreshRemailProjects(); };
  }

  var projectSelect = document.getElementById('remail-form-project');
  if (projectSelect && !remailInitialized) {
    projectSelect.onchange = function() { onRemailProjectChange(); };
  }

  if (!remailInitialized) {
    remailInitialized = true;
  }
}

async function loadRemailConfigs() {
  initRemailButtons();

  try {
    if (!window.go || !window.go.main || !window.go.main.App) {
      remailConfigs = [];
      renderRemailConfigs();
      return;
    }
    remailConfigs = await window.go.main.App.GetRemailConfigs() || [];
    renderRemailConfigs();
  } catch (e) {
    console.error('[Remail] 加载配置失败:', e);
    remailConfigs = [];
    renderRemailConfigs();
  }
}

function renderRemailConfigs() {
  var container = document.getElementById('remail-configs-list');
  if (!container) return;

  if (remailConfigs.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:13px;">暂无配置，点击上方按钮添加</div>';
    return;
  }

  var html = '';
  remailConfigs.forEach(function(cfg, idx) {
    var modeName = cfg.mode === 'package' ? '接包模式' : '购买模式';
    var splitInfo = '';
    html += '<div class="moemail-config-item" style="margin-bottom:12px;">';
    html += '  <div style="display:flex;align-items:center;gap:12px;">';
    html += '    <div style="flex:1;">';
    html += '      <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px;">' + escapeHtml(cfg.name || '未命名') + '</div>';
    html += '      <div style="font-size:11px;color:var(--text-muted);">';
    html += '        项目: ' + escapeHtml(cfg.project || '-') + ' | ';
    html += '        产品: ' + escapeHtml(cfg.product || '-') + ' | ';
    html += '        ' + modeName + splitInfo;
    html += '      </div>';
    html += '    </div>';
    html += '    <button type="button" class="btn btn-secondary btn-sm btn-edit-remail" data-index="' + idx + '">编辑</button>';
    html += '    <button type="button" class="btn btn-secondary btn-sm btn-test-remail" data-index="' + idx + '">测试</button>';
    html += '    <button type="button" class="btn btn-secondary btn-sm btn-delete-remail" data-index="' + idx + '" style="color:var(--danger);">删除</button>';
    html += '  </div>';
    html += '</div>';
  });

  container.innerHTML = html;

  container.querySelectorAll('.btn-edit-remail').forEach(function(btn) {
    btn.onclick = function() { editRemailConfig(parseInt(this.getAttribute('data-index'))); };
  });
  container.querySelectorAll('.btn-test-remail').forEach(function(btn) {
    btn.onclick = function() { testRemailConfig(parseInt(this.getAttribute('data-index'))); };
  });
  container.querySelectorAll('.btn-delete-remail').forEach(function(btn) {
    btn.onclick = function() { deleteRemailConfig(parseInt(this.getAttribute('data-index'))); };
  });
}

function escapeHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showAddRemailModal() {
  document.getElementById('remail-modal-title').textContent = '添加 Remail 配置';
  document.getElementById('remail-form-name').value = '';
  document.getElementById('remail-form-apikey').value = '';
  document.getElementById('remail-form-apiurl').value = 'https://remail.aishop6.com';
  document.getElementById('remail-form-project').innerHTML = '<option value="">请先刷新加载项目列表</option>';
  document.getElementById('remail-form-product').innerHTML = '<option value="">请先选择项目</option>';
  var suffixSelect = document.getElementById('remail-form-suffix-select');
  if (suffixSelect) {
    suffixSelect.innerHTML = '<option value="">自动分配</option>';
    suffixSelect.disabled = true;
  }
  document.getElementById('remail-form-mode').value = 'package';
  document.getElementById('remail-form-timeout').value = '300';
  document.getElementById('remail-form-poll').value = '3';
  document.getElementById('remail-edit-index').value = '-1';
  document.getElementById('remail-modal').classList.add('show');
}

function editRemailConfig(index) {
  var cfg = remailConfigs[index];
  if (!cfg) return;

  document.getElementById('remail-modal-title').textContent = '编辑 Remail 配置';
  document.getElementById('remail-form-name').value = cfg.name || '';
  document.getElementById('remail-form-apikey').value = cfg.apiKey || '';
  document.getElementById('remail-form-apiurl').value = cfg.apiUrl || 'https://remail.aishop6.com';
  document.getElementById('remail-form-project').value = cfg.project || '';
  document.getElementById('remail-form-product').value = cfg.product || '';
  var suffixSelect = document.getElementById('remail-form-suffix-select');
  if (suffixSelect) {
    suffixSelect.value = cfg.suffix || '';
  }
  document.getElementById('remail-form-mode').value = cfg.mode || 'package';
  document.getElementById('remail-form-timeout').value = cfg.timeout || 300;
  document.getElementById('remail-form-poll').value = cfg.pollPeriod || 3;
  document.getElementById('remail-edit-index').value = index;
  document.getElementById('remail-modal').classList.add('show');
}

function closeRemailModal() {
  document.getElementById('remail-modal').classList.remove('show');
}

async function saveRemailConfig() {
  var name = document.getElementById('remail-form-name').value.trim();
  var apiKey = document.getElementById('remail-form-apikey').value.trim();
  var apiUrl = document.getElementById('remail-form-apiurl').value.trim();
  var projectSelect = document.getElementById('remail-form-project');
  var productSelect = document.getElementById('remail-form-product');
  var suffixSelect = document.getElementById('remail-form-suffix-select');
  var projectId = parseInt(projectSelect.value);
  var productId = 0;
  var projectName = projectSelect.options[projectSelect.selectedIndex] ? projectSelect.options[projectSelect.selectedIndex].text : '';
  var productType = productSelect.value.trim();
  var suffix = suffixSelect ? suffixSelect.value.trim() : '';
  var mode = document.getElementById('remail-form-mode').value;
  var timeout = parseInt(document.getElementById('remail-form-timeout').value) || 300;
  var pollPeriod = parseInt(document.getElementById('remail-form-poll').value) || 3;
  var editIndex = parseInt(document.getElementById('remail-edit-index').value);
  if (!name) { showToast('请输入配置名称', 'error'); return; }
  if (!apiKey) { showToast('请输入 API Key', 'error'); return; }
  if (!projectId) { showToast('请选择项目', 'error'); return; }
  if (!productType) { showToast('请选择产品', 'error'); return; }

  // ProductType 直接使用产品的 type 字段(新API)
  // ProductID 使用默认映射(兼容旧版,实际不使用)
  var productId = 1; // 保留字段兼容性
  
  console.log('[Remail] 使用 ProductType:', productType);

  var config = {
    name: name,
    apiKey: apiKey,
    apiUrl: apiUrl,
    project: projectName,
    projectId: projectId,
    product: productType,
    productType: productType,  // 新增: 传递 type 字段给后端
    productId: productId,      // 保留: 兼容旧版本
    mode: mode,
    suffix: suffix,
    timeout: timeout,
    pollPeriod: pollPeriod
  };

  if (editIndex >= 0) {
    remailConfigs[editIndex] = config;
  } else {
    remailConfigs.push(config);
  }

  try {
    var result = await window.go.main.App.SaveRemailConfigs(JSON.stringify(remailConfigs));
    if (result.error) { showToast(result.error, 'error'); return; }
    showToast('保存成功');
    closeRemailModal();
    await loadRemailConfigs();
  } catch (e) {
    showToast('保存失败: ' + e.message, 'error');
  }
}

async function deleteRemailConfig(index) {
  if (!confirm('确定要删除该配置吗？')) return;
  remailConfigs.splice(index, 1);
  try {
    var result = await window.go.main.App.SaveRemailConfigs(JSON.stringify(remailConfigs));
    if (result.error) { showToast(result.error, 'error'); return; }
    showToast('删除成功');
    await loadRemailConfigs();
  } catch (e) {
    showToast('删除失败: ' + e.message, 'error');
  }
}

async function testRemailConfig(index) {
  var cfg = remailConfigs[index];
  if (!cfg) return;
  showToast('正在测试连接...');
  try {
    var result = await window.go.main.App.TestRemailConnection(JSON.stringify(cfg));
    if (result.success) {
      showToast('测试成功！测试邮箱: ' + result.email);
    } else {
      showToast('测试失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (e) {
    showToast('测试失败: ' + e.message, 'error');
  }
}

// 刷新项目和产品列表
async function refreshRemailProjects() {
  var apiKey = document.getElementById('remail-form-apikey').value.trim();
  var apiUrl = document.getElementById('remail-form-apiurl').value.trim() || 'https://remail.aishop6.com';

  if (!apiKey) { showToast('请先输入 API Key', 'error'); return; }

  var btn = document.getElementById('btn-refresh-remail-projects');
  var originalHTML = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite;"><path d="M21 12a9 9 0 11-6.22-8.56"/><path d="M21 3v6h-6"/></svg>';
  }

  showToast('正在加载项目列表...');

  try {
    var result = await window.go.main.App.GetRemailProjects(apiUrl, apiKey);
    if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }

    if (!result.success) {
      showToast('加载失败: ' + (result.error || '未知错误'), 'error');
      return;
    }
    populateRemailProjects(result.data);
    showToast('项目列表加载成功');
  } catch (e) {
    if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }
    showToast('加载失败: ' + e.message, 'error');
  }
}

function populateRemailProjects(data) {
  var projectSelect = document.getElementById('remail-form-project');
  var productSelect = document.getElementById('remail-form-product');
  if (!projectSelect || !productSelect) return;

  projectSelect.innerHTML = '<option value="">请选择项目</option>';
  productSelect.innerHTML = '<option value="">请先选择项目</option>';

  var projects = [];
  if (data.items && Array.isArray(data.items)) {
    projects = data.items;
  } else if (data.data && Array.isArray(data.data)) {
    projects = data.data;
  } else if (Array.isArray(data)) {
    projects = data;
  }

  if (projects.length === 0) { showToast('未找到可用项目', 'error'); return; }

  window.remailProjectsCache = {};
  projects.forEach(function(project) {
    var option = document.createElement('option');
    option.value = project.id;
    option.textContent = project.name + ' (' + project.productCount + '个产品)';
    projectSelect.appendChild(option);
    window.remailProjectsCache[project.id] = project;
  });
}

async function onRemailProjectChange() {
  var projectSelect = document.getElementById('remail-form-project');
  var productSelect = document.getElementById('remail-form-product');
  if (!projectSelect || !productSelect) return;

  var projectId = projectSelect.value;
  if (!projectId) {
    productSelect.innerHTML = '<option value="">请先选择项目</option>';
    return;
  }

  // 始终调用项目详情接口获取完整的产品信息(包含productId)
  var apiKey = document.getElementById('remail-form-apikey').value.trim();
  var apiUrl = document.getElementById('remail-form-apiurl').value.trim() || 'https://remail.aishop6.com';

  productSelect.innerHTML = '<option value="">加载产品详情...</option>';
  productSelect.disabled = true;

  try {
    var result = await window.go.main.App.GetRemailProjectDetail(apiUrl, apiKey, parseInt(projectId));
    productSelect.disabled = false;
    if (!result.success) {
      productSelect.innerHTML = '<option value="">加载失败</option>';
      showToast('加载产品列表失败: ' + (result.error || '未知错误'), 'error');
      return;
    }
    console.log('[Remail] 项目详情响应:', result.data);
    
    // 更新缓存中的项目数据为详情版本
    if (window.remailProjectsCache && window.remailProjectsCache[projectId]) {
      window.remailProjectsCache[projectId] = result.data;
    }
    
    populateRemailProducts(result.data);
  } catch (e) {
    productSelect.disabled = false;
    productSelect.innerHTML = '<option value="">加载失败</option>';
    showToast('加载产品列表失败: ' + e.message, 'error');
  }
}

function populateRemailProducts(data) {
  var productSelect = document.getElementById('remail-form-product');
  var suffixSelect = document.getElementById('remail-form-suffix-select');
  if (!productSelect) return;

  productSelect.innerHTML = '<option value="">请选择产品</option>';
  if (suffixSelect) {
    suffixSelect.innerHTML = '<option value="">自动分配</option>';
    suffixSelect.disabled = true;
  }

  var products = [];
  if (data.products && Array.isArray(data.products)) {
    products = data.products;
  } else if (data.data && data.data.products && Array.isArray(data.data.products)) {
    products = data.data.products;
  } else if (Array.isArray(data)) {
    products = data;
  }

  console.log('[Remail] 解析到的产品列表:', products);

  if (products.length === 0) {
    productSelect.innerHTML = '<option value="">该项目暂无产品</option>';
    return;
  }

  // 缓存产品数据（包含后缀信息和ID）
  window.remailProductsCache = {};
  products.forEach(function(product) {
    console.log('[Remail] 产品对象:', product);
    
    var option = document.createElement('option');
    option.value = product.type;
    var displayName = product.type;
    if (product.type === 'microsoft') displayName = 'Microsoft 邮箱';
    else if (product.type === 'domain') displayName = '域名邮箱';
    else if (product.type === 'icloud') displayName = 'iCloud 邮箱';
    else if (product.type === 'random') displayName = '随机邮箱';

    var statusText = product.status === 'enabled' ? '可用' : '不可用';
    var availableText = product.totalAvailable ? ' (' + product.totalAvailable + '个可用)' : '';
    option.textContent = displayName + availableText + ' - ' + statusText;
    option.disabled = product.status !== 'enabled';
    productSelect.appendChild(option);
    
    // 缓存产品数据
    window.remailProductsCache[product.type] = product;
  });
  
  // 监听产品选择变化，更新后缀下拉框
  productSelect.onchange = function() {
    onRemailProductChange();
  };
}

// 产品选择变化时，更新后缀选择器
function onRemailProductChange() {
  var productSelect = document.getElementById('remail-form-product');
  var suffixSelect = document.getElementById('remail-form-suffix-select');
  if (!productSelect || !suffixSelect) return;
  
  var productType = productSelect.value;
  if (!productType || !window.remailProductsCache) {
    suffixSelect.innerHTML = '<option value="">自动分配</option>';
    suffixSelect.disabled = true;
    return;
  }
  
  var product = window.remailProductsCache[productType];
  if (!product || !product.suffixes || product.suffixes.length === 0) {
    suffixSelect.innerHTML = '<option value="">自动分配</option>';
    suffixSelect.disabled = true;
    return;
  }
  
  // 填充后缀选项
  suffixSelect.innerHTML = '<option value="">自动分配（推荐）</option>';
  suffixSelect.disabled = false;
  
  product.suffixes.forEach(function(suffixInfo) {
    var option = document.createElement('option');
    option.value = suffixInfo.suffix;
    var availableText = suffixInfo.publicAvailable ? ' (' + suffixInfo.publicAvailable + '个)' : '';
    option.textContent = suffixInfo.suffix + availableText;
    option.disabled = !suffixInfo.publicAvailable || suffixInfo.publicAvailable === 0;
    suffixSelect.appendChild(option);
  });
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', async function() {
  initRemailButtons();
  await loadRemailConfigs();
});
