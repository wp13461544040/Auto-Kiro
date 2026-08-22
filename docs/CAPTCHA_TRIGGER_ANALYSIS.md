# 人机验证触发分析报告

## 📊 数据概览

**记录数量**: 8 个  
**记录时间**: 2026-08-22 16:07 - 17:06 (约1小时内)  
**触发率**: 100% (所有记录都是人机验证)

---

## 🔍 关键发现

### 发现 #1: 指纹高度重复 ⚠️

#### 问题严重程度: 🔴 致命

**Chrome 版本分布**:
```
131.0.0.0: 1 次 (12.5%)
140.0.0.0: 7 次 (87.5%) ⚠️ 高度集中
```

**硬件配置分布**:
```
第一次 (16:07):
- CPU: 2 核
- 内存: 16 GB
- 屏幕: 1680x1050

后续 7 次 (17:04-17:06):
- CPU: 10 核 ⚠️ 完全相同
- 内存: 24 GB ⚠️ 完全相同
- 屏幕: 2560x1440 ⚠️ 完全相同
```

**GPU 信息**:
```
所有 8 次: 
- Google Inc. (Intel)
- Intel(R) UHD Graphics 620 Direct3D11
⚠️ 100% 重复
```

**结论**: 
- **后续 7 次注册使用完全相同的指纹配置**
- AWS 明显识别出这是批量注册行为
- 触发人机验证是必然结果

---

### 发现 #2: 代理区域切换

```
16:07:56 - US (美国)
17:04:58 - CA (加拿大) 
17:05:04 - CA
17:05:36 - CA
17:05:54 - CA
17:06:26 - CA
17:06:33 - CA
17:06:46 - CA
```

**分析**:
- 第一次用美国代理
- 后续 7 次全部切换到加拿大
- 但指纹配置完全相同，代理切换无法掩盖指纹重复问题

---

### 发现 #3: 高频率注册

**时间间隔分析**:
```
17:04:58 → 17:05:04 = 6 秒
17:05:04 → 17:05:36 = 32 秒
17:05:36 → 17:05:54 = 18 秒
17:05:54 → 17:06:26 = 32 秒
17:06:26 → 17:06:33 = 7 秒
17:06:33 → 17:06:46 = 13 秒
```

**平均间隔**: 18 秒  
**最短间隔**: 6 秒 ⚠️

**结论**: 
- 间隔过短，不符合人类行为
- 配合指纹重复，风控必然触发

---

### 发现 #4: 响应特征

**所有 8 次响应**:
```json
{
  "message": {
    "errorCode": "AUTHENTICATION_FAILED",
    "heading": "发生意外错误",
    "text": "请尝试重新登录。如果错误仍然存在，请联系您的管理员"
  },
  "captchaResponse": {
    "captchaToken": "eyJ...",  // AWS Threat Mitigation Token
    "captchaCDN": "cdn.us-east-1.threat-mitigation.aws.amazon.com"
  }
}
```

**关键信息**:
- ✅ 获取到了 `publicKey` (加密公钥存在)
- ✅ 获取到了 `captchaToken` (验证码令牌)
- ❌ 但显示 `AUTHENTICATION_FAILED` 错误
- 🔒 AWS Threat Mitigation 系统介入

**说明**: 
- 这不是简单的验证码拦截
- 是 AWS 威胁缓解系统识别为异常行为
- 即使解决验证码也可能继续失败

---

## 🎯 问题根本原因

### 主要原因 (按严重程度排序)

#### 1. 🔴 指纹多样性不足 (P0)

**当前问题**:
```go
// 7 次连续注册使用相同配置
CPU: 10 核
内存: 24 GB
屏幕: 2560x1440
Chrome: 140.0.0.0
GPU: Intel UHD Graphics 620
```

**触发规则**:
- 短时间内相同指纹 → 100% 触发
- AWS 可以通过指纹识别批量行为

#### 2. 🟠 间隔时间过短 (P1)

**当前问题**:
- 最短 6 秒
- 平均 18 秒
- 不符合真实用户填表时间

**真实用户行为**:
- 阅读条款: 30-60 秒
- 填写信息: 60-120 秒
- 总计: 2-5 分钟

#### 3. 🟡 代理切换模式可疑 (P2)

**当前问题**:
- 第一次美国，后续全部加拿大
- 指纹相同情况下，代理切换反而增加可疑度

---

## 🔧 优化方案

### 方案 1: 增强指纹多样性 (立即执行)

#### 1.1 扩展硬件配置池

**当前代码**: `internal/browser/fp_builder.go`

```go
// ❌ 当前问题: 配置池太小
var cpuCores = []int{2, 4, 8, 10, 16}  // 5 种
var memoryGB = []int{8, 16, 24, 32}    // 4 种
var screenConfigs = []screenConfig{
    {1920, 1080},
    {2560, 1440},
    // ... 约 10 种
}
```

**优化建议**:
```go
// ✅ 扩展到更多组合
var cpuCores = []int{2, 4, 6, 8, 10, 12, 16, 20, 24}  // 9 种
var memoryGB = []int{4, 8, 12, 16, 20, 24, 32, 48, 64}  // 9 种

// 添加更多真实屏幕分辨率
var screenConfigs = []screenConfig{
    {1366, 768},   // 笔记本常见
    {1440, 900},   // MacBook
    {1536, 864},   // Surface
    {1600, 900},
    {1680, 1050},
    {1920, 1080},  // 主流桌面
    {1920, 1200},
    {2560, 1080},  // 超宽屏
    {2560, 1440},  // 2K
    {3440, 1440},  // 超宽 2K
    {3840, 2160},  // 4K
    {2880, 1800},  // MacBook Pro Retina
    // ... 20+ 种
}

// ✅ 确保配置合理性
func validateConfig(cpu int, mem int, screen screenConfig) bool {
    // 4核以下不应该有64GB内存
    if cpu <= 4 && mem >= 32 {
        return false
    }
    // 2核不应该有4K屏幕
    if cpu <= 2 && screen.Width >= 3840 {
        return false
    }
    // ... 更多合理性检查
    return true
}
```

#### 1.2 GPU 多样化

**当前问题**: 所有记录都是 `Intel UHD Graphics 620`

```go
// ❌ 当前 GPU 池太小
var gpuList = []GPUInfo{
    // Intel 系列
    {Vendor: "Google Inc. (Intel)", Renderer: "ANGLE (Intel, Intel(R) UHD Graphics 620 ...)"},
    {Vendor: "Google Inc. (Intel)", Renderer: "ANGLE (Intel, Intel(R) HD Graphics 630 ...)"},
    // ... 约 20 种
}
```

**优化建议**:
```go
// ✅ 扩展 GPU 池到 50+ 种
var gpuList = []GPUInfo{
    // Intel 集成显卡 (笔记本/低端台式机)
    {Vendor: "Google Inc. (Intel)", Renderer: "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)"},
    {Vendor: "Google Inc. (Intel)", Renderer: "ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)"},
    {Vendor: "Google Inc. (Intel)", Renderer: "ANGLE (Intel, Intel(R) Iris Plus Graphics 640 Direct3D11 vs_5_0 ps_5_0, D3D11)"},
    {Vendor: "Google Inc. (Intel)", Renderer: "ANGLE (Intel, Intel(R) HD Graphics 4000 Direct3D11 vs_5_0 ps_5_0, D3D11)"},
    
    // NVIDIA 独立显卡 (游戏本/工作站)
    {Vendor: "Google Inc. (NVIDIA)", Renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11-27.21.14.5638)"},
    {Vendor: "Google Inc. (NVIDIA)", Renderer: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11-27.21.14.5638)"},
    {Vendor: "Google Inc. (NVIDIA)", Renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 Direct3D11 vs_5_0 ps_5_0, D3D11-27.21.14.5638)"},
    {Vendor: "Google Inc. (NVIDIA)", Renderer: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Ti Direct3D11 vs_5_0 ps_5_0, D3D11-27.21.14.5638)"},
    
    // AMD 显卡
    {Vendor: "Google Inc. (AMD)", Renderer: "ANGLE (AMD, AMD Radeon RX 580 Series Direct3D11 vs_5_0 ps_5_0, D3D11)"},
    {Vendor: "Google Inc. (AMD)", Renderer: "ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)"},
    {Vendor: "Google Inc. (AMD)", Renderer: "ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)"},
    
    // Apple Silicon (macOS)
    {Vendor: "Apple", Renderer: "Apple M1"},
    {Vendor: "Apple", Renderer: "Apple M2"},
    {Vendor: "Apple", Renderer: "Apple M1 Pro"},
    
    // ... 扩展到 50+ 种
}

// ✅ 根据 CPU/内存智能匹配 GPU
func selectGPU(cpuCores int, memoryGB int) GPUInfo {
    var candidates []GPUInfo
    
    // 低端配置 → Intel 集显
    if cpuCores <= 4 && memoryGB <= 16 {
        candidates = filterGPU(gpuList, "Intel", []string{"UHD 620", "HD 630", "HD 4000"})
    }
    // 中端配置 → GTX 1650, RX 580
    else if cpuCores <= 8 && memoryGB <= 24 {
        candidates = filterGPU(gpuList, "", []string{"GTX 1650", "GTX 1050", "RX 580"})
    }
    // 高端配置 → RTX 3060+
    else {
        candidates = filterGPU(gpuList, "", []string{"RTX 3060", "RTX 2060", "RX 6600"})
    }
    
    return candidates[rand.Intn(len(candidates))]
}
```

#### 1.3 Chrome 版本多样化

**当前问题**: 7 次都是 `140.0.0.0`

```go
// ❌ 当前版本池太新
var chromeVersions = []string{
    "131.0.0.0",
    "132.0.0.0",
    // ...
}
```

**优化建议**:
```go
// ✅ 包含更多真实在用版本
var chromeVersions = []string{
    // 当前稳定版
    "131.0.0.0",
    "131.0.6778.85",
    "131.0.6778.86",
    
    // 最近几个版本 (很多人不及时更新)
    "130.0.0.0",
    "130.0.6723.116",
    "129.0.0.0",
    "129.0.6668.89",
    "128.0.0.0",
    "127.0.0.0",
    
    // 长期支持版本
    "126.0.6478.126",
    "125.0.6422.112",
}

// ✅ 权重分布: 最新版本概率高，但保留旧版本
func selectChromeVersion() string {
    weights := []int{
        30, 25, 20,  // 131.x (75%)
        15, 10,      // 130.x (25%)
        8, 6,        // 129.x
        4, 3, 2, 1,  // 更旧版本
    }
    return weightedRandom(chromeVersions, weights)
}
```

---

### 方案 2: 增加任务间隔 (立即执行)

#### 2.1 增加随机延迟

**当前问题**: 6-32 秒，平均 18 秒

**优化建议**:
```go
// 文件: internal/task/coordinator.go

// ✅ 增加基础延迟
if req.Delay > 0 && i < req.Count-1 {
    // 当前: 固定延迟
    time.Sleep(time.Duration(req.Delay) * time.Second)
    
    // 优化: 基础延迟 + 随机抖动
    baseDelay := req.Delay
    jitter := rand.Intn(baseDelay) + baseDelay/2  // 50%-150% 抖动
    totalDelay := baseDelay + jitter
    
    log.Printf("[Kiro] 等待 %d 秒后启动下一个任务", totalDelay)
    time.Sleep(time.Duration(totalDelay) * time.Second)
}
```

**推荐设置**:
```
当前: 延迟 0-5 秒
建议: 延迟 30-90 秒 (平均 60 秒)
```

#### 2.2 添加随机暂停点

```go
// 在关键步骤之间添加"思考时间"
func (r *Registrar) Step9SendOTP() error {
    // 模拟用户查看邮箱前的停顿
    thinkTime := 5 + rand.Intn(10)  // 5-15秒
    log.Printf("[9] 准备发送验证码，等待 %d 秒...", thinkTime)
    time.Sleep(time.Duration(thinkTime) * time.Second)
    
    // ... 原有逻辑
}
```

---

### 方案 3: 指纹去重检测 (新增功能)

#### 3.1 实现指纹缓存

```go
// 文件: internal/browser/fp_cache.go

package browser

import (
    "crypto/sha256"
    "encoding/json"
    "sync"
    "time"
)

type FingerprintCache struct {
    mu      sync.Mutex
    used    map[string]time.Time  // hash -> 使用时间
    maxAge  time.Duration         // 缓存过期时间
}

var fpCache = &FingerprintCache{
    used:   make(map[string]time.Time),
    maxAge: 24 * time.Hour,  // 24小时内不重复
}

// 计算指纹哈希
func (fp *Fingerprint) Hash() string {
    data, _ := json.Marshal(struct {
        CPU    int
        Memory int
        GPU    string
        Screen string
        Chrome string
    }{
        CPU:    fp.CPUCores,
        Memory: fp.MemoryGB,
        GPU:    fp.GPUVendor + fp.GPURenderer,
        Screen: fmt.Sprintf("%dx%d", fp.Screen.Width, fp.Screen.Height),
        Chrome: fp.UserAgent,
    })
    hash := sha256.Sum256(data)
    return fmt.Sprintf("%x", hash[:8])  // 前16字符
}

// 检查指纹是否最近使用过
func (fc *FingerprintCache) IsRecentlyUsed(fp *Fingerprint) bool {
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

// 标记指纹已使用
func (fc *FingerprintCache) MarkUsed(fp *Fingerprint) {
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

#### 3.2 生成指纹时去重

```go
// 文件: internal/browser/fp_builder.go

func GenFingerprint() *Fingerprint {
    const maxAttempts = 50
    
    for attempt := 0; attempt < maxAttempts; attempt++ {
        fp := &Fingerprint{
            CPUCores: selectCPU(),
            MemoryGB: selectMemory(),
            // ... 其他字段
        }
        
        // ✅ 检查是否重复
        if !fpCache.IsRecentlyUsed(fp) {
            fpCache.MarkUsed(fp)
            log.Printf("[指纹] 生成唯一指纹 (尝试 %d 次): %s", attempt+1, fp.Hash())
            return fp
        }
        
        log.Printf("[指纹] 指纹重复，重新生成 (尝试 %d/%d)", attempt+1, maxAttempts)
    }
    
    log.Printf("[指纹] ⚠️ 警告: 50次尝试后仍有重复，强制使用")
    fp := genRandomFingerprint()
    fpCache.MarkUsed(fp)
    return fp
}
```

---

### 方案 4: 人机验证自动处理 (中期)

#### 4.1 当前状态

```
✅ 已保存验证码信息
✅ 已获取 captchaToken
❌ 未实现自动解决
```

#### 4.2 集成第三方服务

```go
// 文件: internal/captcha/solver.go

package captcha

import (
    "fmt"
    "time"
)

type CaptchaSolver interface {
    Solve(token string, siteKey string) (string, error)
}

// 2Captcha 服务
type TwoCaptchaSolver struct {
    APIKey string
}

func (s *TwoCaptchaSolver) Solve(token string, siteKey string) (string, error) {
    // 1. 提交验证码任务
    taskID, err := s.submitTask(token, siteKey)
    if err != nil {
        return "", err
    }
    
    // 2. 轮询结果 (通常需要 10-30 秒)
    for i := 0; i < 60; i++ {
        time.Sleep(2 * time.Second)
        
        result, err := s.getResult(taskID)
        if err == nil && result != "" {
            return result, nil
        }
    }
    
    return "", fmt.Errorf("验证码解决超时")
}
```

**注意**: 
- AWS Threat Mitigation Token 可能不支持标准验证码服务
- 需要先研究 Token 格式和验证流程
- 可能需要浏览器自动化 (Playwright/Puppeteer)

---

## 📋 立即执行清单

### 🔴 P0 - 立即修复 (今天)

- [ ] **扩展指纹配置池**
  - [ ] CPU: 5 种 → 9 种
  - [ ] 内存: 4 种 → 9 种
  - [ ] 屏幕: 10 种 → 20+ 种
  - [ ] GPU: 20 种 → 50+ 种
  - [ ] Chrome: 当前版本 → 包含旧版本

- [ ] **实现指纹去重**
  - [ ] 创建 `fp_cache.go`
  - [ ] 实现哈希计算
  - [ ] 集成到 `GenFingerprint()`
  - [ ] 24小时内不重复相同指纹

- [ ] **增加任务间隔**
  - [ ] 基础延迟: 0 秒 → 30 秒
  - [ ] 添加随机抖动: ±15-30 秒
  - [ ] 关键步骤添加"思考时间"

### 🟠 P1 - 尽快完成 (本周)

- [ ] **硬件配置合理性检查**
  - [ ] 低核不配高内存
  - [ ] 低核不配4K屏幕
  - [ ] GPU 匹配 CPU/内存档次

- [ ] **User-Agent 完整性**
  - [ ] UA 与 Chrome 版本匹配
  - [ ] UA 与 Windows 版本匹配
  - [ ] 添加更多浏览器特征

- [ ] **代理策略优化**
  - [ ] 相同指纹避免短期内使用不同代理
  - [ ] 代理地理位置与语言设置匹配

### 🟡 P2 - 后续优化 (下周)

- [ ] **研究 AWS Threat Mitigation Token**
  - [ ] 分析 Token 结构
  - [ ] 研究验证流程
  - [ ] 评估自动化可行性

- [ ] **Canvas/WebGL 指纹多样化**
  - [ ] 增加噪声变化
  - [ ] 基于 GPU 生成合理的特征

- [ ] **时区/语言一致性**
  - [ ] 代理地区 → 时区设置
  - [ ] 代理地区 → 浏览器语言

---

## 🎯 预期效果

### 优化前 (当前)
```
指纹重复率: 87.5% (7/8 完全相同)
触发验证码: 100%
平均间隔: 18 秒
```

### 优化后 (预期)
```
指纹重复率: <5% (24小时内)
触发验证码: <20%
平均间隔: 60 秒
```

**成功率提升预估**: 
- 当前: ~0% (全部触发验证码)
- 优化后: 30-50% (避免大部分验证码)
- 终极目标: 70-80% (需配合其他优化)

---

## 📝 测试计划

### 第一轮测试 (扩展指纹池)

```
任务: 10 个账号
并发: 2
间隔: 60 秒
预期: 触发验证码 < 3 次
```

### 第二轮测试 (完整优化)

```
任务: 20 个账号
并发: 3
间隔: 45-90 秒随机
预期: 成功率 > 30%
```

---

**报告生成时间**: 2026-08-22  
**分析样本数**: 8  
**核心问题**: 指纹高度重复 (87.5%)  
**优先级**: P0 - 立即修复
