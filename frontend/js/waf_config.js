// ===== WAF 指纹加密服务配置 =====

// 加载 WAF 配置
async function loadWAFConfig() {
  try {
    const configJSON = await window.go.main.App.GetWAFConfig();
    
    // 解析JSON字符串
    let config = {
      enabled: false,
      baseUrl: 'http://localhost:8888',
      apiKey: '',
      timeout: 10
    };
    
    if (configJSON && configJSON.trim() !== '') {
      try {
        config = JSON.parse(configJSON);
      } catch(e) {
        console.error('[WAF] 配置JSON解析失败:', e);
      }
    }
    
    // 更新UI
    document.getElementById('cfg-waf-enabled').checked = config.enabled || false;
    document.getElementById('cfg-waf-url').value = config.baseUrl || 'http://localhost:8888';
    document.getElementById('cfg-waf-apikey').value = config.apiKey || '';
    document.getElementById('cfg-waf-timeout').value = config.timeout || 10;
    
    // 更新状态徽章
    updateWAFStatusBadge(config.enabled);
    
    console.log('[WAF] 配置加载成功:', config);
  } catch(e) {
    console.error('[WAF] 配置加载失败:', e);
    showToast('WAF配置加载失败: ' + e.message, 'error');
  }
}

// WAF 启用状态改变
function onWAFEnabledChange() {
  const enabled = document.getElementById('cfg-waf-enabled').checked;
  updateWAFStatusBadge(enabled);
}

// 更新状态徽章
function updateWAFStatusBadge(enabled) {
  const badge = document.getElementById('waf-status-badge');
  if (!badge) return;
  
  if (enabled) {
    badge.textContent = '已启用';
    badge.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    badge.style.color = 'white';
  } else {
    badge.textContent = '未启用';
    badge.style.background = 'var(--bg-subtle)';
    badge.style.color = 'var(--text-muted)';
  }
}

// 测试 WAF 连接
async function testWAFConnection(event) {
  const statusEl = document.getElementById('waf-connection-status');
  const btn = event ? event.target : document.querySelector('button[onclick*="testWAFConnection"]');
  
  // 保存按钮原始文本
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '测试中...';
  
  // 显示测试中状态
  statusEl.textContent = '测试中...';
  statusEl.style.color = 'var(--text-muted)';
  
  try {
    const config = {
      enabled: true, // 测试时强制启用
      baseUrl: document.getElementById('cfg-waf-url').value.trim(),
      apiKey: document.getElementById('cfg-waf-apikey').value.trim(),
      timeout: parseInt(document.getElementById('cfg-waf-timeout').value) || 10
    };
    
    // 验证URL
    if (!config.baseUrl) {
      statusEl.textContent = '❌ 请填写服务地址';
      statusEl.style.color = 'var(--danger)';
      return;
    }
    
    // 转换为JSON字符串传给后端
    const configJSON = JSON.stringify(config);
    
    // 调用后端测试接口
    const result = await window.go.main.App.TestWAFConnection(configJSON);
    
    if (result.success) {
      statusEl.textContent = `✅ 连接成功 (加密长度: ${result.length || 0})`;
      statusEl.style.color = 'var(--success)';
      showToast('WAF服务连接成功!', 'success');
    } else {
      statusEl.textContent = `❌ 连接失败: ${result.error || '未知错误'}`;
      statusEl.style.color = 'var(--danger)';
      showToast('WAF服务连接失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch(e) {
    console.error('[WAF] 测试连接失败:', e);
    statusEl.textContent = `❌ 测试失败: ${e.message}`;
    statusEl.style.color = 'var(--danger)';
    showToast('测试失败: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// 保存 WAF 配置
async function saveWAFConfig(event) {
  const btn = event ? event.target : document.querySelector('button[onclick*="saveWAFConfig"]');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '保存中...';
  
  try {
    const config = {
      enabled: document.getElementById('cfg-waf-enabled').checked,
      baseUrl: document.getElementById('cfg-waf-url').value.trim(),
      apiKey: document.getElementById('cfg-waf-apikey').value.trim(),
      timeout: parseInt(document.getElementById('cfg-waf-timeout').value) || 10
    };
    
    // 验证配置
    if (config.enabled && !config.baseUrl) {
      showToast('请填写WAF服务地址', 'error');
      return;
    }
    
    if (config.timeout < 1 || config.timeout > 60) {
      showToast('超时时间必须在 1-60 秒之间', 'error');
      return;
    }
    
    // 转换为JSON字符串传给后端
    const configJSON = JSON.stringify(config);
    
    // 调用后端保存接口
    const result = await window.go.main.App.SetWAFConfig(configJSON);
    
    if (result.success) {
      showToast('WAF配置已保存!', 'success');
      updateWAFStatusBadge(config.enabled);
      
      // 如果启用了,自动测试连接
      if (config.enabled) {
        setTimeout(() => {
          testWAFConnection();
        }, 500);
      }
    } else {
      showToast('保存失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch(e) {
    console.error('[WAF] 保存配置失败:', e);
    showToast('保存失败: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// 重置 WAF 配置
async function resetWAFConfig() {
  if (!confirm('确定要重置WAF配置吗?')) {
    return;
  }
  
  try {
    const result = await window.go.main.App.ResetWAFConfig();
    
    if (result.success) {
      // 重新加载配置
      await loadWAFConfig();
      
      // 清空连接状态
      const statusEl = document.getElementById('waf-connection-status');
      if (statusEl) {
        statusEl.textContent = '未测试';
        statusEl.style.color = 'var(--text-muted)';
      }
      
      showToast('WAF配置已重置', 'success');
    } else {
      showToast('重置失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch(e) {
    console.error('[WAF] 重置配置失败:', e);
    showToast('重置失败: ' + e.message, 'error');
  }
}

// 页面加载时自动加载 WAF 配置
window.addEventListener('DOMContentLoaded', async function() {
  // 等待 Wails runtime 就绪
  let retries = 0;
  while ((!window.go || !window.go.main || !window.go.main.App) && retries < 100) {
    await new Promise(resolve => setTimeout(resolve, 50));
    retries++;
  }
  
  if (window.go && window.go.main && window.go.main.App) {
    await loadWAFConfig();
    console.log('[WAF] 配置模块初始化完成');
  }
});
