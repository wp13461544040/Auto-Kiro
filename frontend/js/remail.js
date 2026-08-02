// ===== Remail 配置管理 =====
console.log('[Remail] remail.js 文件开始加载...');

var remailConfigs = [];
var remailInitialized = false;

console.log('[Remail] 全局变量已声明:', typeof remailConfigs, typeof remailInitialized);

// 初始化 Remail 按钮事件
function initRemailButtons() {
  console.log('[Remail] 初始化按钮事件... (已初始化:', remailInitialized, ')');
  
  // 绑定添加配置按钮
  var addBtn = document.getElementById('btn-add-remail-config');
  if (addBtn) {
    console.log('[Remail] 找到添加配置按钮');
    if (!remailInitialized) {
      console.log('[Remail] 绑定添加配置按钮点击事件');
      addBtn.onclick = function(e) {
        e.preventDefault();
        console.log('[Remail] 添加配置按钮被点击');
        showAddRemailModal();
      };
    }
  } else {
    console.warn('[Remail] 找不到添加配置按钮 (btn-add-remail-config)');
  }
  
  // 绑定模态框关闭按钮 (X)
  var closeXBtn = document.getElementById('btn-close-remail-modal-x');
  if (closeXBtn && !remailInitialized) {
    closeXBtn.onclick = function(e) {
      e.preventDefault();
      closeRemailModal();
    };
  }
  
  // 绑定模态框取消按钮
  var cancelBtn = document.getElementById('btn-cancel-remail-config');
  if (cancelBtn && !remailInitialized) {
    cancelBtn.onclick = function(e) {
      e.preventDefault();
      closeRemailModal();
    };
  }
  
  // 绑定模态框保存按钮
  var saveBtn = document.getElementById('btn-save-remail-config');
  if (saveBtn && !remailInitialized) {
    saveBtn.onclick = function(e) {
      e.preventDefault();
      saveRemailConfig();
    };
  }
  
  // 绑定刷新项目按钮
  var refreshBtn = document.getElementById('btn-refresh-remail-projects');
  if (refreshBtn && !remailInitialized) {
    refreshBtn.onclick = function(e) {
      e.preventDefault();
      refreshRemailProjects();
    };
  }
  
  // 绑定项目选择变化事件
  var projectSelect = document.getElementById('remail-form-project');
  if (projectSelect && !remailInitialized) {
    projectSelect.onchange = function() {
      onRemailProjectChange();
    };
  }
  
  if (!remailInitialized) {
    remailInitialized = true;
    console.log('[Remail] 按钮事件初始化完成');
  }
}

async function loadRemailConfigs() {
  console.log('[Remail] ===== 开始加载配置 =====');
  console.log('[Remail] window.go 是否存在:', typeof window.go);
  console.log('[Remail] window.go.main 是否存在:', typeof window.go?.main);
  console.log('[Remail] window.go.main.App 是否存在:', typeof window.go?.main?.App);
  
  // 确保按钮事件已绑定
  initRemailButtons();
  
  try {
    console.log('[Remail] 准备调用 GetRemailConfigs...');
    
    if (!window.go || !window.go.main || !window.go.main.App) {
      console.error('[Remail] Wails runtime 未就绪！');
      remailConfigs = [];
      renderRemailConfigs();
      return;
    }
    
    remailConfigs = await window.go.main.App.GetRemailConfigs() || [];
    console.log('[Remail] 配置加载成功，数量:', remailConfigs.length);
    console.log('[Remail] 配置内容:', JSON.stringify(remailConfigs));
    renderRemailConfigs();
  } catch (e) {
    console.error('[Remail] 加载配置失败，错误:', e);
    console.error('[Remail] 错误堆栈:', e.stack);
    remailConfigs = [];
    renderRemailConfigs();
  }
  
  console.log('[Remail] ===== 加载配置完成 =====');
}

function renderRemailConfigs() {
  console.log('[Remail] ===== 开始渲染配置列表 =====');
  console.log('[Remail] 配置数量:', remailConfigs.length);
  
  var container = document.getElementById('remail-configs-list');
  console.log('[Remail] 容器元素:', container);
  
  if (!container) {
    console.error('[Remail] ❌ 找不到 remail-configs-list 元素！');
    return;
  }

  if (remailConfigs.length === 0) {
    console.log('[Remail] 无配置，显示空状态');
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:13px;">暂无配置，点击上方按钮添加</div>';
    console.log('[Remail] ✅ 空状态已渲染');
    return;
  }

  console.log('[Remail] 开始生成配置列表 HTML...');
  var html = '';
  remailConfigs.forEach(function(cfg, idx) {
    var modeName = cfg.mode === 'package' ? '接包模式' : '购买模式';
    html += '<div class="moemail-config-item" style="margin-bottom:12px;">';
    html += '  <div style="display:flex;align-items:center;gap:12px;">';
    html += '    <div style="flex:1;">';
    html += '      <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px;">' + escapeHtml(cfg.name || '未命名') + '</div>';
    html += '      <div style="font-size:11px;color:var(--text-muted);">';
    html += '        项目: ' + escapeHtml(cfg.project || '-') + ' | ';
    html += '        产品: ' + escapeHtml(cfg.product || '-') + ' | ';
    html += '        ' + modeName;
    html += '      </div>';
    html += '    </div>';
    html += '    <button type="button" class="btn btn-secondary btn-sm btn-edit-remail" data-index="' + idx + '">编辑</button>';
    html += '    <button type="button" class="btn btn-secondary btn-sm btn-test-remail" data-index="' + idx + '">测试</button>';
    html += '    <button type="button" class="btn btn-secondary btn-sm btn-delete-remail" data-index="' + idx + '" style="color:var(--danger);">删除</button>';
    html += '  </div>';
    html += '</div>';
  });

  console.log('[Remail] HTML 生成完成，长度:', html.length);
  container.innerHTML = html;
  console.log('[Remail] ✅ 配置列表已渲染到 DOM');
  
  // 绑定动态按钮事件
  console.log('[Remail] 开始绑定动态按钮事件...');
  container.querySelectorAll('.btn-edit-remail').forEach(function(btn) {
    btn.onclick = function() {
      editRemailConfig(parseInt(this.getAttribute('data-index')));
    };
  });
  
  container.querySelectorAll('.btn-test-remail').forEach(function(btn) {
    btn.onclick = function() {
      testRemailConfig(parseInt(this.getAttribute('data-index')));
    };
  });
  
  container.querySelectorAll('.btn-delete-remail').forEach(function(btn) {
    btn.onclick = function() {
      deleteRemailConfig(parseInt(this.getAttribute('data-index')));
    };
  });
  
  console.log('[Remail] ✅ 动态按钮事件绑定完成');
  console.log('[Remail] ===== 渲染配置列表完成 =====');
}

function escapeHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showAddRemailModal() {
  console.log('[Remail] 打开添加配置模态框...');
  document.getElementById('remail-modal-title').textContent = '添加 Remail 配置';
  document.getElementById('remail-form-name').value = '';
  document.getElementById('remail-form-apikey').value = '';
  document.getElementById('remail-form-apiurl').value = 'https://remail.aishop6.com';
  document.getElementById('remail-form-project').value = '';
  document.getElementById('remail-form-product').value = '';
  document.getElementById('remail-form-mode').value = 'package';
  document.getElementById('remail-form-suffix').value = '';
  document.getElementById('remail-form-timeout').value = '300';
  document.getElementById('remail-form-poll').value = '3';
  document.getElementById('remail-edit-index').value = '-1';
  
  var modal = document.getElementById('remail-modal');
  console.log('[Remail] 模态框元素:', modal);
  if (modal) {
    modal.classList.add('show');
    console.log('[Remail] 已添加 show 类');
  } else {
    console.error('[Remail] 找不到模态框元素！');
  }
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
  document.getElementById('remail-form-mode').value = cfg.mode || 'package';
  document.getElementById('remail-form-suffix').value = cfg.suffix || '';
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
  var projectId = parseInt(projectSelect.value);
  var productId = 0;
  var projectName = projectSelect.options[projectSelect.selectedIndex]?.text || '';
  var productType = productSelect.value.trim();
  var mode = document.getElementById('remail-form-mode').value;
  var suffix = document.getElementById('remail-form-suffix').value.trim();
  var timeout = parseInt(document.getElementById('remail-form-timeout').value) || 300;
  var pollPeriod = parseInt(document.getElementById('remail-form-poll').value) || 3;
  var editIndex = parseInt(document.getElementById('remail-edit-index').value);

  if (!name) {
    showToast('请输入配置名称', 'error');
    return;
  }
  if (!apiKey) {
    showToast('请输入 API Key', 'error');
    return;
  }
  if (!projectId) {
    showToast('请选择项目', 'error');
    return;
  }
  if (!productType) {
    showToast('请选择产品', 'error');
    return;
  }

  // 从缓存的项目数据中获取 productId
  var projectData = window.remailProjectsCache && window.remailProjectsCache[projectId];
  if (projectData && projectData.products) {
    var selectedProduct = projectData.products.find(function(p) {
      return p.type === productType;
    });
    if (selectedProduct) {
      productId = selectedProduct.id;
    }
  }

  if (!productId) {
    showToast('无法获取产品ID，请重新刷新项目列表', 'error');
    return;
  }

  var config = {
    name: name,
    apiKey: apiKey,
    apiUrl: apiUrl,
    project: projectName,      // 用于显示
    projectId: projectId,       // 用于 API 调用
    product: productType,       // 用于显示（microsoft/domain）
    productId: productId,       // 用于 API 调用
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
    if (result.error) {
      showToast(result.error, 'error');
      return;
    }
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
    if (result.error) {
      showToast(result.error, 'error');
      return;
    }
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
  
  if (!apiKey) {
    showToast('请先输入 API Key', 'error');
    return;
  }
  
  var btn = document.getElementById('btn-refresh-remail-projects');
  var originalHTML = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite;"><path d="M21 12a9 9 0 11-6.22-8.56"/><path d="M21 3v6h-6"/></svg>';
  }
  
  showToast('正在加载项目列表...');
  
  try {
    var result = await window.go.main.App.GetRemailProjects(apiUrl, apiKey);
    
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
    
    console.log('[Remail] API 响应:', JSON.stringify(result, null, 2));
    
    if (!result.success) {
      var errorMsg = result.error || '未知错误';
      
      // 如果有原始响应，显示更多信息
      if (result.raw) {
        console.error('[Remail] API 原始响应:', result.raw);
        errorMsg += '\n\n原始响应: ' + result.raw.substring(0, 200);
      } else {
        console.error('[Remail] 没有原始响应数据');
      }
      
      // 如果有状态码，显示
      if (result.statusCode) {
        console.error('[Remail] HTTP 状态码:', result.statusCode);
        errorMsg = 'HTTP ' + result.statusCode + ' 错误\n' + errorMsg;
      }
      
      showToast('加载失败: ' + errorMsg, 'error');
      return;
    }
    
    // 解析返回的数据并填充下拉框
    populateRemailProjects(result.data);
    showToast('项目列表加载成功');
    
  } catch (e) {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
    showToast('加载失败: ' + e.message, 'error');
  }
}

// 填充项目下拉框
function populateRemailProjects(data) {
  console.log('[Remail] 填充项目列表:', data);
  
  var projectSelect = document.getElementById('remail-form-project');
  var productSelect = document.getElementById('remail-form-product');
  
  if (!projectSelect || !productSelect) {
    console.error('[Remail] 找不到项目或产品选择框');
    return;
  }
  
  // 清空现有选项
  projectSelect.innerHTML = '<option value="">请选择项目</option>';
  productSelect.innerHTML = '<option value="">请先选择项目</option>';
  
  // 根据 API 返回格式解析 - 响应格式为 { items: [...], total: 10 }
  var projects = [];
  
  if (data.items && Array.isArray(data.items)) {
    projects = data.items;
  } else if (data.data && Array.isArray(data.data)) {
    projects = data.data;
  } else if (Array.isArray(data)) {
    projects = data;
  }
  
  if (projects.length === 0) {
    showToast('未找到可用项目', 'error');
    return;
  }
  
  // 填充项目列表，同时缓存项目数据（包含 products）
  window.remailProjectsCache = {};
  projects.forEach(function(project) {
    var option = document.createElement('option');
    option.value = project.id;
    option.textContent = project.name + ' (' + project.productCount + '个产品)';
    projectSelect.appendChild(option);
    
    // 缓存项目数据，避免再次请求
    window.remailProjectsCache[project.id] = project;
  });
}

// 项目选择变化时加载该项目的产品列表
async function onRemailProjectChange() {
  var projectSelect = document.getElementById('remail-form-project');
  var productSelect = document.getElementById('remail-form-product');
  
  if (!projectSelect || !productSelect) return;
  
  var projectId = projectSelect.value;
  
  if (!projectId) {
    productSelect.innerHTML = '<option value="">请先选择项目</option>';
    return;
  }
  
  // 尝试从缓存中获取项目数据
  var projectData = window.remailProjectsCache && window.remailProjectsCache[projectId];
  
  if (projectData && projectData.products && projectData.products.length > 0) {
    // 使用缓存的数据
    console.log('[Remail] 从缓存加载产品列表');
    populateRemailProducts({ products: projectData.products });
    return;
  }
  
  // 如果缓存中没有，则请求 API
  var apiKey = document.getElementById('remail-form-apikey').value.trim();
  var apiUrl = document.getElementById('remail-form-apiurl').value.trim() || 'https://remail.aishop6.com';
  
  // 显示加载中
  productSelect.innerHTML = '<option value="">加载中...</option>';
  productSelect.disabled = true;
  
  try {
    var result = await window.go.main.App.GetRemailProjectDetail(apiUrl, apiKey, parseInt(projectId));
    
    productSelect.disabled = false;
    
    if (!result.success) {
      productSelect.innerHTML = '<option value="">加载失败</option>';
      showToast('加载产品列表失败: ' + (result.error || '未知错误'), 'error');
      return;
    }
    
    // 解析产品列表
    populateRemailProducts(result.data);
    
  } catch (e) {
    productSelect.disabled = false;
    productSelect.innerHTML = '<option value="">加载失败</option>';
    showToast('加载产品列表失败: ' + e.message, 'error');
  }
}

// 填充产品下拉框
function populateRemailProducts(data) {
  console.log('[Remail] 填充产品列表:', data);
  
  var productSelect = document.getElementById('remail-form-product');
  
  if (!productSelect) return;
  
  // 清空产品列表
  productSelect.innerHTML = '<option value="">请选择产品</option>';
  
  // 根据 API 返回格式解析
  var products = [];
  
  // 支持多种数据格式
  if (data.products && Array.isArray(data.products)) {
    products = data.products;
  } else if (data.data && data.data.products && Array.isArray(data.data.products)) {
    products = data.data.products;
  } else if (Array.isArray(data)) {
    products = data;
  }
  
  if (products.length === 0) {
    productSelect.innerHTML = '<option value="">该项目暂无产品</option>';
    return;
  }
  
  // 填充产品列表 - type 字段就是产品代码 (microsoft, domain)
  products.forEach(function(product) {
    var option = document.createElement('option');
    // 使用 type 作为 value (例如: microsoft, domain)
    option.value = product.type;
    // 显示友好的名称
    var displayName = product.type;
    if (product.type === 'microsoft') {
      displayName = 'Microsoft 邮箱';
    } else if (product.type === 'domain') {
      displayName = '域名邮箱';
    } else if (product.type === 'random') {
      displayName = '随机邮箱';
    }
    
    // 添加库存信息
    var statusText = product.status === 'enabled' ? '可用' : '不可用';
    var availableText = product.totalAvailable ? ' (' + product.totalAvailable + '个可用)' : '';
    
    option.textContent = displayName + availableText + ' - ' + statusText;
    option.disabled = product.status !== 'enabled';
    
    productSelect.appendChild(option);
  });
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', async function() {
  console.log('[Remail] DOMContentLoaded 事件触发');
  initRemailButtons();
  await loadRemailConfigs();
});

console.log('[Remail] remail.js 文件加载完成！');
console.log('[Remail] loadRemailConfigs 函数是否已定义:', typeof loadRemailConfigs);
console.log('[Remail] initRemailButtons 函数是否已定义:', typeof initRemailButtons);
console.log('[Remail] renderRemailConfigs 函数是否已定义:', typeof renderRemailConfigs);
