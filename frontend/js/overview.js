// ===== 概览页面逻辑 =====

var overviewTimer = null;
var taskStatusTimer = null;

function _ovT(key, fallback) {
  if (window.I18N && typeof window.I18N.t === 'function') {
    var v = window.I18N.t(key);
    if (v && v !== key) return v;
  }
  return fallback;
}

// loadOverview 加载概览数据（含账号池统计，3秒刷新）
async function loadOverview() {
  if (!window.go || !window.go.main || !window.go.main.App) return;
  try {
    var data = await window.go.main.App.GetOverview();
    updateOverviewUI(data);
    // 加载 MoeMail 配置统计
    if (typeof loadMoeMailConfigs === 'function') {
      loadMoeMailConfigs();
    }
  } catch (e) {
    console.error('加载概览数据失败:', e);
  }
}

// loadTaskStatus 加载实时任务状态（纯内存，1秒刷新）
async function loadTaskStatus() {
  if (!window.go || !window.go.main || !window.go.main.App || !window.go.main.App.GetTaskStatus) return;
  try {
    var data = await window.go.main.App.GetTaskStatus();
    updateTaskStatusUI(data);
  } catch (e) {}
}

// updateOverviewUI 更新概览界面
function updateOverviewUI(data) {
  var kiro = data.kiro || {};
  var outlook = data.outlook || {};
  var proxy = data.proxy || {};

  // Kiro 状态徽章
  var kiroStatusEl = document.getElementById('ov-kiro-status');
  if (kiroStatusEl) {
    if (kiro.taskRunning) {
      kiroStatusEl.textContent = _ovT('status.running', '运行中');
      kiroStatusEl.className = 'db-badge db-badge-running';
    } else {
      kiroStatusEl.textContent = _ovT('status.idle', '空闲');
      kiroStatusEl.className = 'db-badge db-badge-idle';
    }
  }

  // 本次任务成功数 + 成功率
  var taskSuccess = kiro.taskSuccess || 0;
  var taskFailed = kiro.taskFailed || 0;
  var taskTotal = taskSuccess + taskFailed;
  setText('ov-kiro-success', taskSuccess);
  var successRate = taskTotal > 0 ? Math.round(taskSuccess / taskTotal * 100) : 0;
  setText('ov-kiro-success-rate', successRate + '%');

  // 邮箱池统计卡
  var outlookTotal = outlook.total || 0;
  setText('ov-outlook-total', outlookTotal);

  // 邮箱池详情
  setText('ov-ol-total', outlookTotal);
  setText('ov-ol-pending', outlook.pending || 0);
  setText('ov-ol-success', outlook.success || 0);
  setText('ov-ol-failed', outlook.failed || 0);

  // 代理统计卡
  var proxyTotal = proxy.total || 0;
  var proxyEnabled = proxy.enabled || 0;
  var proxyEl = document.getElementById('ov-proxy-total');
  if (proxyEl) {
    if (proxyTotal === 0) {
      proxyEl.textContent = '直连';
      proxyEl.style.color = 'var(--text-muted)';
    } else {
      proxyEl.textContent = proxyEnabled + '/' + proxyTotal;
      proxyEl.style.color = proxyEnabled > 0 ? 'var(--success)' : 'var(--danger)';
    }
  }
}

// 辅助函数
function setText(id, text) {
  var el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setWidth(id, width) {
  var el = document.getElementById(id);
  if (el) el.style.width = width;
}

// 更新任务状态卡片（从快速轮询）
function updateTaskStatusUI(data) {
  var kiro = data.kiro || {};
  var kiroStatusEl = document.getElementById('ov-kiro-status');
  var targetModeBadge = document.getElementById('ov-target-mode-badge');
  
  if (!kiroStatusEl) return;
  
  if (kiro.taskRunning) {
    kiroStatusEl.textContent = _ovT('status.running', '运行中');
    kiroStatusEl.className = 'db-badge db-badge-running';
    
    // 显示或隐藏目标模式标记
    if (targetModeBadge) {
      if (kiro.targetMode) {
        targetModeBadge.style.display = 'inline-block';
      } else {
        targetModeBadge.style.display = 'none';
      }
    }
  } else {
    kiroStatusEl.textContent = _ovT('status.idle', '空闲');
    kiroStatusEl.className = 'db-badge db-badge-idle';
    
    // 空闲时隐藏目标模式标记
    if (targetModeBadge) {
      targetModeBadge.style.display = 'none';
    }
  }
}

// 启动概览定时刷新
function startOverviewTimer() {
  if (overviewTimer) clearInterval(overviewTimer);
  if (taskStatusTimer) clearInterval(taskStatusTimer);
  loadOverview();
  loadTaskStatus();
  overviewTimer = setInterval(loadOverview, 3000);
  taskStatusTimer = setInterval(loadTaskStatus, 1000);
}

// 停止概览定时刷新
function stopOverviewTimer() {
  if (overviewTimer) {
    clearInterval(overviewTimer);
    overviewTimer = null;
  }
  if (taskStatusTimer) {
    clearInterval(taskStatusTimer);
    taskStatusTimer = null;
  }
}
