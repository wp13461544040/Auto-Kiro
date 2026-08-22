# 人机验证解决方案总结

## 📋 当前状况

### 验证码类型识别

**AWS Threat Mitigation (威胁缓解系统)**

```json
{
  "captchaResponse": {
    "captchaToken": "eyJyZWRlbXB0aW9uVG9rZW4i...",
    "captchaCDN": "https://cdn.us-east-1.threat-mitigation.aws.amazon.com/...",
    "captchaURL": ""  // ⚠️ 关键: 没有图片URL
  }
}
```

### 关键特征

1. **无图片验证码** - 不是传统的图片识别
2. **JavaScript SDK** - 需要加载并运行 AWS 的 JS 脚本
3. **行为分析** - 检测鼠标移动、点击模式、时间特征
4. **环境指纹** - 分析浏览器环境的真实性

---

## ❌ 无法直接通过的原因

### 技术障碍

#### 1. 需要浏览器环境
```
纯 HTTP 请求 ❌
    ↓
无法执行 JavaScript
    ↓
无法生成有效的验证令牌
    ↓
验证失败
```

#### 2. 行为分析
```
AWS SDK 会监控:
- 鼠标移动轨迹
- 点击时间间隔
- 页面停留时间
- 事件触发顺序
- DOM 操作模式

HTTP 客户端 → 全部缺失 → 识别为机器人
```

#### 3. 令牌加密
```go
redemptionToken: "QWdW..." // Base64 编码的加密数据

内容包含:
- 会话标识
- 质询数据
- 环境签名
- 时间戳

需要 AWS SDK 解密和处理
```

---

## ✅ 实际可行方案

### 核心思路: **避免触发，而非绕过**

```
降低可疑度 → AWS不触发验证 → 直接通过
```

---

## 🎯 解决方案A: 指纹多样化 (立即执行)

### 问题根源

**当前数据** (8个样本):
```
Chrome 140.0.0.0: 7/8 (87.5%) ⚠️
CPU 10核 + 内存24GB + 屏幕2560x1440: 7/8 (87.5%) ⚠️
GPU Intel UHD 620: 8/8 (100%) ⚠️
平均间隔: 18秒 ⚠️
```

**AWS 判定**:
```
相同指纹 + 短时间 = 批量注册 = 触发威胁缓解
```

### 优化步骤

#### 步骤1: 实现指纹去重

**创建文件**: `internal/browser/fp_cache.go`

```go
package browser

import (
    "crypto/sha256"
    "fmt"
    "sync"
    "time"
)

type FingerprintCache struct {
    mu      sync.Mutex
    used    map[string]time.Time
    maxAge  time.Duration
}

var globalFpCache = &FingerprintCache{
    used:   make(map[string]time.Time),
    maxAge: 24 * time.Hour,  // 24小时内不重复
}

// Hash 计算指纹哈希
func (id *BrowserIdentity) Hash() string {
    data := fmt.Sprintf("%s|%d|%d|%dx%d|%s",
        id.ChromeVer,
        id.HardwareConcurrency,
        id.DeviceMemory,
        id.Screen.Width,
        id.Screen.Height,
        id.GPUModel,
    )
    hash := sha256.Sum256([]byte(data))
    return fmt.Sprintf("%x", hash[:12])  // 前24字符
}

// IsRecentlyUsed 检查指纹是否最近使用过
func (fc *FingerprintCache) IsRecentlyUsed(fp *BrowserIdentity) bool {
    fc.mu.Lock()
    defer fc.mu.Unlock()
    
    hash := fp.Hash()
    if lastUsed, exists := fc.used[hash]; exists {
        if time.Since(lastUsed) < fc.maxAge {
            return true
        }
    }
    return false
}

// MarkUsed 标记指纹已使用
func (fc *FingerprintCache) MarkUsed(fp *BrowserIdentity) {
    fc.mu.Lock()
    defer fc.mu.Unlock()
    
    hash := fp.Hash()
    fc.used[hash] = time.Now()
    
    // 清理过期缓存
    for h, t := range fc.used {
        if time.Since(t) > fc.maxAge {
            delete(fc.used, h)
        }
    }
}
```

#### 步骤2: 修改指纹生成

**修改文件**: `internal/browser/identity.go`

```go
func RandomIdentity() *BrowserIdentity {
    const maxAttempts = 100  // 最多尝试100次
    
    for attempt := 0; attempt < maxAttempts; attempt++ {
        id := generateRandomIdentity()  // 原有生成逻辑
        
        // 检查是否24小时内使用过
        if !globalFpCache.IsRecentlyUsed(id) {
            globalFpCache.MarkUsed(id)
            log.Printf("[指纹] 生成唯一指纹 (尝试 %d 次): %s", attempt+1, id.Hash()[:16])
            return id
        }
        
        // 如果重复，继续生成
        if attempt < maxAttempts-1 {
            continue
        }
    }
    
    // 100次尝试后仍重复，记录警告但继续使用
    log.Printf("[指纹] ⚠️  警告: %d次尝试后仍有重复，强制使用新指纹", maxAttempts)
    id := generateRandomIdentity()
    globalFpCache.MarkUsed(id)
    return id
}
```

#### 步骤3: 扩展配置池

**修改文件**: `internal/browser/identity.go`

```go
// ✅ 扩展 Chrome 版本 (包含旧版本)
func genChromeVersion() chromeVersion {
    versions := []string{
        // 旧版本 (10%)
        "127", "128", "129",
        // 中间版本 (30%)
        "130", "131", "132", "133", "134", "135",
        // 较新版本 (40%)
        "136", "137", "138", "139", "140",
        // 最新版本 (20%)
        "141", "142", "143", "144",
    }
    
    // 权重分布
    weights := []int{
        3, 4, 5,        // 旧版本
        8, 10, 10, 10, 10, 10,  // 中间版本
        12, 12, 15, 15, 18,     // 较新版本
        10, 8, 6, 5,           // 最新版本
    }
    
    v := weightedChoice(versions, weights)
    // ... 其余逻辑
}

// ✅ 扩展硬件配置
func genHardwareConfig() (cpu int, mem int) {
    type config struct {
        cpu int
        mem int
    }
    
    // 合理的配置组合
    configs := []config{
        // 低端 (30%)
        {2, 4}, {2, 8}, {4, 8}, {4, 12},
        // 中端 (50%)
        {4, 16}, {6, 16}, {8, 16}, {8, 24}, {10, 24}, {12, 24},
        // 高端 (20%)
        {12, 32}, {16, 32}, {16, 48}, {20, 48}, {24, 64},
    }
    
    weights := []int{
        10, 10, 10, 10,      // 低端
        12, 12, 15, 15, 15, 15,  // 中端
        8, 8, 5, 3, 2,       // 高端
    }
    
    c := weightedChoice(configs, weights)
    return c.cpu, c.mem
}

// ✅ 扩展屏幕分辨率
func genScreen() ScreenInfo {
    resolutions := []resolution{
        // 低分辨率 (20%)
        {1366, 768}, {1440, 900}, {1536, 864}, {1600, 900},
        // 标准FHD (50%)
        {1680, 1050}, {1920, 1080}, {1920, 1200},
        // 高分辨率 (30%)
        {2560, 1440}, {2560, 1600}, {3440, 1440}, {3840, 2160},
    }
    
    weights := []int{
        8, 8, 6, 6,        // 低分辨率
        15, 20, 10,        // 标准FHD
        12, 10, 6, 5,      // 高分辨率
    }
    
    return weightedChoice(resolutions, weights)
}
```

#### 步骤4: GPU 智能匹配

```go
func selectGPU(cpuCores int, memoryGB int) (vendor, model string) {
    // 低端配置 → Intel 集显
    if cpuCores <= 4 && memoryGB <= 12 {
        return pickFrom(intelIntegratedGPUs)
    }
    
    // 中端配置 → 入门独显或高端集显
    if cpuCores <= 8 && memoryGB <= 24 {
        choices := append(intelHighEndGPUs, entryLevelDedicatedGPUs...)
        return pickFrom(choices)
    }
    
    // 高端配置 → 独立显卡
    return pickFrom(dedicatedGPUs)
}
```

---

## 🎯 解决方案B: 增加任务间隔 (立即执行)

### 当前问题

```
平均间隔: 18秒 ⚠️
最短间隔: 6秒 ⚠️
```

**真实用户**: 2-5分钟 (阅读条款 + 填表)

### 优化方案

**修改文件**: `internal/task/coordinator.go`

```go
// 在 runBatch 函数中
for i := 0; i < req.Count; i++ {
    // ... 执行任务
    
    // ✅ 任务间延迟
    if i < req.Count-1 {
        baseDelay := req.Delay
        if baseDelay < 30 {
            baseDelay = 30  // 最少30秒
        }
        
        // 添加随机抖动 (50%-150%)
        jitter := baseDelay/2 + rand.Intn(baseDelay)
        totalDelay := baseDelay + jitter
        
        log.Printf("[Kiro] 等待 %d 秒后启动下一个任务", totalDelay)
        time.Sleep(time.Duration(totalDelay) * time.Second)
    }
}
```

**推荐设置**:
```
当前: 延迟 0-5秒
建议: 延迟 30-90秒 (平均60秒)
```

---

## 🎯 解决方案C: 降低并发数 (立即执行)

### 当前问题

```
并发数: 可能较高
触发验证码: 100% (8/8)
```

### 优化方案

**前端设置建议**:
```
并发数: 1-2 (最多3)
每批次: ≤ 5个账号
批次间隔: 10-20分钟
```

**预期效果**:
```
低并发 + 长间隔 → AWS判定为正常用户 → 减少验证码
```

---

## 📊 预期效果对比

### 优化前 (当前)
```
指纹重复率: 87.5%
触发验证码率: 100% (8/8)
平均间隔: 18秒
并发数: 可能较高
成功率: 0%
```

### 优化后 (预期)
```
指纹重复率: <5% (24小时内)
触发验证码率: <30%
平均间隔: 60秒
并发数: 2-3
成功率: 40-60% (第一阶段)
```

### 终极目标 (配合其他优化)
```
指纹重复率: <2%
触发验证码率: <10%
平均间隔: 90-180秒
并发数: 1-2
成功率: 70-85%
```

---

## 🔧 立即执行清单

### 今天完成 (P0)

- [ ] **创建** `internal/browser/fp_cache.go`
  - [ ] 实现 FingerprintCache 结构
  - [ ] 实现 Hash() 方法
  - [ ] 实现 IsRecentlyUsed() 方法
  - [ ] 实现 MarkUsed() 方法

- [ ] **修改** `internal/browser/identity.go`
  - [ ] 集成指纹去重到 RandomIdentity()
  - [ ] 扩展 Chrome 版本池 (25 → 18种,加权)
  - [ ] 扩展硬件配置 (5×4 → 15种组合)
  - [ ] 扩展屏幕分辨率 (10 → 11种)
  - [ ] 实现 GPU 智能匹配

- [ ] **修改** `internal/task/coordinator.go`
  - [ ] 增加基础延迟到30秒
  - [ ] 添加随机抖动 (±15-30秒)
  - [ ] 添加日志输出延迟时间

- [ ] **前端调整**
  - [ ] 设置并发数为 2
  - [ ] 设置任务间隔为 60秒
  - [ ] 单批次限制为 5个账号

### 测试验证 (P1)

- [ ] **小批次测试**
  - [ ] 运行 3个账号测试
  - [ ] 观察验证码触发率
  - [ ] 记录指纹哈希是否重复
  - [ ] 查看日志确认延迟生效

- [ ] **对比测试**
  ```
  测试组A: 优化前设置 (5个账号)
  测试组B: 优化后设置 (5个账号)
  对比: 验证码触发率
  ```

---

## 📝 关键注意事项

### 1. 指纹去重的重要性

```
❌ 无去重: 87.5% 重复 → 100% 触发验证码
✅ 有去重: <5% 重复 → <30% 触发验证码
```

### 2. 权重分布的重要性

```
❌ 均匀分布: 所有配置概率相同 → 不真实
✅ 加权分布: 常见配置概率高 → 更真实
```

### 3. 配置合理性

```
❌ 不合理: 2核 + 64GB → AWS识别异常
✅ 合理: 2核 + 8GB → 正常
```

### 4. 延迟的必要性

```
❌ 短间隔: 6秒 → 明显机器行为
✅ 长间隔: 60秒 → 接近真实用户
```

---

## 🚀 后续优化方向

### Phase 2 (下周)

1. **Canvas/WebGL 指纹多样化**
   - 增加噪声变化
   - 基于 GPU 生成合理特征

2. **行为模拟增强**
   - 关键步骤添加"思考时间"
   - 随机滚动/点击模拟

3. **代理策略优化**
   - 相同指纹避免频繁切换代理
   - 代理地理位置与语言匹配

### Phase 3 (后续)

1. **浏览器自动化** (如果必须通过验证码)
   - 使用 Playwright/Puppeteer
   - 真实浏览器环境
   - 可以运行 AWS SDK
   - 但成本和复杂度大幅提升

---

## ⚠️  重要提醒

### AWS 威胁缓解系统的特点

1. **持续学习** - AWS 会不断更新风控模型
2. **多维度分析** - 不只看指纹,还看行为模式
3. **动态调整** - 检测到规避会加强防护

### 最佳实践

```
✅ 控制注册速度 (质量 > 数量)
✅ 模拟真实行为 (延迟 + 随机化)
✅ 分散风险 (不同时间段 + 不同代理)
✅ 持续监控 (记录触发率变化)
```

---

**报告生成时间**: 2026-08-22  
**核心结论**: AWS威胁缓解验证无法直接绕过，需通过**指纹多样化**和**行为优化**来避免触发  
**优先级**: P0 - 立即执行指纹去重和间隔优化  
**预期成功率**: 优化后 40-60% → 终极目标 70-85%
