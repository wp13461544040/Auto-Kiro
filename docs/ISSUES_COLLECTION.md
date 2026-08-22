# 问题收集与分析

本文档记录实际使用中遇到的问题，用于后续统一优化。

---

## 问题 #1: 设置密码时未获取到加密公钥

### 时间
2026-08-22 16:01:24

### 错误信息
```
[Kiro][13/200] 设置密码失败: 未获取到加密公钥
```

### 完整响应
```json
{
  "requestId": "6496eca0-82e7-4571-b119-9e053b6fd2ab",
  "message": {
    "text": "请尝试重新登录。如果错误仍然存在，请联系您的管理员",
    "heading": "发生意外错误",
    "type": "ERROR",
    "time": "Sat, 22 Aug 2026 08:01:24 GMT",
    "requestId": "6496eca0-82e7-4571-b119-9e053b6fd2ab",
    "errorCode": "SIGNIN_BAD_REQUEST_ERROR"
  },
  "presentationContext": {
    "clientId": "3bec6266d4c83882",
    "identityPoolId": "d-9067642ac7",
    "identityPoolType": "DIRECTORY",
    "applicationType": "SSO_INDIVIDUAL_ID",
    "arnPartition": "aws",
    "locale": "",
    "airportCode": "IAD"
  }
}
```

### 原始日志（乱码）
```
è¯·å°è¯éæ°ç»å½ãå¦æéè¯¯ä»ç¶å­å¨ï¼è¯·èç³»æ¨çç®¡çå
åçæå¤éè¯¯
```

### 问题分析

#### 响应特征
- **错误码**: `SIGNIN_BAD_REQUEST_ERROR`
- **错误类型**: `ERROR`
- **消息**: "发生意外错误" / "请尝试重新登录"
- **缺失字段**: `workflowResponseData.encryptionContextResponse.publicKey`

#### 可能原因

1. **请求参数问题**
   - `stepId` 为空可能不正确
   - `state` 或 `registrationCode` 无效
   - `workflowStateHandle` 已过期

2. **会话状态问题**
   - 前序步骤出现问题导致状态异常
   - Cookie 丢失或无效
   - WorkflowHandle 过期

3. **反爬虫检测**
   - 指纹被识别为机器行为
   - 请求频率过高
   - IP 被标记

4. **AWS 服务端问题**
   - 临时服务异常
   - 区域性故障（airportCode: IAD）

5. **字符编码问题**
   - 响应中的中文显示为乱码
   - 可能影响其他字段解析

### 触发位置
文件: `internal/core/signup_password.go`  
函数: `Step12SetPassword()`  
步骤: 12a - 获取加密公钥

```go
// 当前代码
body, _, respH, err := r.DoPostRaw(api, map[string]interface{}{
    "stepId": "", 
    "state": r.SignState,
    "inputs": []interface{}{
        map[string]string{
            "input_type": "UserRegistrationRequestInput",
            "registrationCode": r.RegCode, 
            "state": r.SignState,
        },
        map[string]string{
            "input_type": "FingerPrintRequestInput", 
            "fingerPrint": fp
        },
    },
    "requestId": rid,
}, h)

// 检查点
encCtx := httputil.GetNestedMap(data, "workflowResponseData", "encryptionContextResponse")
pubKeyMap := httputil.GetNestedStringMap(encCtx, "publicKey")
if pubKeyMap == nil || pubKeyMap["n"] == "" {
    return fmt.Errorf("未获取到加密公钥: %s", string(body))
}
```

### 上下文信息需求

为了更好地分析，需要记录：

1. **前序步骤状态**
   - Step 11 是否成功？
   - `r.RegCode` 是否有效？
   - `r.SignState` 是否正确？
   - `r.WorkflowHandle` 是否存在？

2. **请求信息**
   - 完整的请求体
   - 请求头
   - Cookie 状态

3. **环境信息**
   - 使用的代理
   - 指纹信息
   - 是否首次触发

### 影响范围
- 任务编号: 13/200
- 阶段: 设置密码（Step 12a）
- 影响: 注册流程中断，邮箱已被消耗

### 重现条件
未知，需要更多样本

### 临时解决方案
- 重试机制（当前未实现）
- 增加等待时间
- 更换代理

---

## 改进建议

### 1. 增强日志记录

**位置**: `internal/core/signup_password.go` - `Step12SetPassword()`

**需要记录**:
```go
// 请求前
log.Printf("[12a] 请求加密公钥")
log.Printf("[12a] RegCode: %s", r.RegCode[:min(20, len(r.RegCode))])
log.Printf("[12a] SignState: %s", r.SignState[:min(20, len(r.SignState))])
log.Printf("[12a] WorkflowHandle: %s", r.WorkflowHandle[:min(30, len(r.WorkflowHandle))])

// 响应后
log.Printf("[12a] 响应状态: %d", statusCode)
if r.Cfg.Debug {
    log.Printf("[12a] 完整响应: %s", string(body))
}

// 错误时
if pubKeyMap == nil {
    log.Printf("[12a] ❌ 未找到 publicKey 字段")
    log.Printf("[12a] encryptionContextResponse: %v", encCtx)
    
    // 检查是否有错误消息
    if msg, ok := data["message"].(map[string]interface{}); ok {
        log.Printf("[12a] 错误码: %v", msg["errorCode"])
        log.Printf("[12a] 错误消息: %v", msg["text"])
    }
}
```

### 2. 字符编码修复

**问题**: 响应中的中文显示为乱码

**原因**: 可能是 UTF-8 编码问题

**解决**:
```go
// 在读取响应时确保正确解码
import "golang.org/x/text/encoding/simplifiedchinese"

// 尝试解码
decoder := simplifiedchinese.GBK.NewDecoder()
utf8Body, err := decoder.Bytes(body)
```

### 3. 增加重试机制

**策略**: 遇到 `SIGNIN_BAD_REQUEST_ERROR` 时重试

```go
const maxRetries = 2
for attempt := 0; attempt <= maxRetries; attempt++ {
    if attempt > 0 {
        log.Printf("[12a] 重试获取公钥 (%d/%d)", attempt, maxRetries)
        time.Sleep(time.Duration(2+attempt) * time.Second)
    }
    
    // 执行请求
    // ...
    
    if pubKeyMap != nil && pubKeyMap["n"] != "" {
        break // 成功
    }
    
    if attempt == maxRetries {
        return fmt.Errorf("多次尝试后仍未获取到加密公钥")
    }
}
```

### 4. 响应验证增强

**检查点**:
```go
// 1. 检查错误码
if errorCode, exists := data["message"].(map[string]interface{})["errorCode"]; exists {
    return fmt.Errorf("AWS 返回错误: %v", errorCode)
}

// 2. 检查响应结构
if _, exists := data["workflowResponseData"]; !exists {
    log.Printf("[12a] 警告: 响应中缺少 workflowResponseData")
    return fmt.Errorf("响应结构异常")
}

// 3. 详细错误信息
if encCtx == nil {
    return fmt.Errorf("未找到 encryptionContextResponse")
}
```

### 5. 保存失败详情

**类似验证码日志**:
```go
// 在 Step12 失败时保存详情
func (r *Registrar) saveStep12FailureInfo(body []byte, step string) {
    dir := "data/failure_logs"
    os.MkdirAll(dir, 0755)
    
    timestamp := time.Now().Format("20060102_150405")
    filename := fmt.Sprintf("%s/step12_%s_%s.json", dir, step, timestamp)
    
    info := map[string]interface{}{
        "timestamp": time.Now().Format("2006-01-02 15:04:05"),
        "step": step,
        "email": r.Email,
        "reg_code": r.RegCode,
        "sign_state": r.SignState,
        "workflow_handle": r.WorkflowHandle,
        "response": json.RawMessage(body),
    }
    
    data, _ := json.MarshalIndent(info, "", "  ")
    os.WriteFile(filename, data, 0644)
    
    log.Printf("[保存] Step12 失败详情: %s", filename)
}
```

---

## 问题 #2: 发送验证码失败 (熔断级错误)

### 时间
2026-08-22 16:30:49

### 错误信息
```
[Kiro] ⚠️ 检测到熔断级错误(发送验证码失败: send-otp 失败 (400))，立即终止所有注册任务
```

### 完整日志
```
16:30:49[Kiro]⚠️ 检测到熔断级错误(发送验证码失败: send-otp 失败 (400))，立即终止所有注册任务
```

### 问题分析

#### 错误特征
- **步骤**: Step 9 - 发送 OTP 验证码
- **HTTP 状态**: 400 (Bad Request)
- **触发时机**: 注册流程中期
- **熔断行为**: 立即终止所有并发任务

#### 可能原因

1. **IP/指纹被标记**
   - AWS 检测到异常行为模式
   - 同一 IP 短时间内多次注册
   - 指纹特征不真实
   - 浏览器行为与真实用户不符

2. **代理问题**
   - 代理 IP 已被 AWS 拉黑
   - 代理质量差（数据中心IP）
   - 代理地理位置异常
   - 代理被多人滥用

3. **请求频率问题**
   - 并发数过高
   - 任务启动间隔太短
   - 同一时间段大量请求
   - 触发 AWS 速率限制

4. **账号/邮箱问题**
   - 邮箱域名被标记
   - 邮箱格式可疑
   - 临时邮箱服务被识别
   - 邮箱提供商被拉黑

5. **前序步骤异常**
   - Step 1-8 中留下风控标记
   - 会话状态异常
   - Cookie/Token 无效
   - WorkflowHandle 异常

#### AWS 风控策略分析

**触发 400 的典型场景**:
- 短时间内同 IP 多次 send-otp
- 指纹参数异常（GPU/Canvas/WebGL）
- 请求时序不符合人类行为
- 邮箱域名在黑名单
- User-Agent 与指纹不匹配

### 触发位置

文件: `internal/core/signup_flow.go`  
函数: `Step9SendOTP()`

```go
// Step 9: 发送 OTP 到邮箱
func (r *Registrar) Step9SendOTP() error {
    api := r.Cfg.AWSHost + "/confirmation/send-otp"
    rid := randRequestID()
    h := makeStdHeaders("POST", r.Cfg, r.Cfg.CSRF)
    h["Content-Type"] = "application/json"
    h["X-Requested-With"] = "XMLHttpRequest"

    body, statusCode, _, err := r.DoPostRaw(api, map[string]interface{}{
        "stepId":         "STEP_ENTER_REG_CODE",
        "state":          r.SignState,
        "destination":    r.Email,
        "destinationType": "EMAIL",
        "requestId":      rid,
    }, h)
    
    if err != nil || statusCode != 200 {
        return fmt.Errorf("send-otp 失败 (%d): %w", statusCode, err)
    }
    // ...
}
```

### 与熔断机制的关联

**代码**: `internal/task/coordinator.go`

```go
func isKillSwitchError(errorMsg string) bool {
    triggers := []string{
        "send-otp 失败 (400)",  // ✅ 触发熔断
        "注册被拦截",
        "IP或浏览器指纹被检测",
        "BLOCKED",
        "注册请求被拦截",
    }
    // ...
}
```

**熔断逻辑**:
```go
if isKillSwitchError(errorMsg) {
    otpKillOnce.Do(func() {
        log.Printf("[Kiro] ⚠️ 检测到熔断级错误(%s)，立即终止所有注册任务", errorMsg)
        go StopTask(true)
    })
    break
}
```

### 影响范围
- **严重程度**: 🔴 致命（阻塞所有任务）
- **影响**: 单个 400 错误导致全部任务终止
- **损失**: 
  - 当前批次所有任务中断
  - 已消耗的邮箱无法恢复
  - 代理冷却时间浪费

### 上下文信息需求

为了更好分析，需要记录：

1. **触发环境**
   - 使用的代理 IP 和类型
   - 当前并发数
   - 已完成的任务数
   - 触发时间点

2. **指纹信息**
   - 完整的指纹 JSON
   - User-Agent
   - GPU 信息
   - Canvas/WebGL hash

3. **前序步骤**
   - Step 1-8 是否有异常日志
   - 响应时间是否异常
   - Cookie 状态

4. **邮箱信息**
   - 使用的邮箱提供商
   - 邮箱域名
   - 邮箱格式

5. **完整响应**
   - HTTP 响应头
   - 响应体内容
   - 错误详情

### 重现条件

可能的重现路径：
1. 使用数据中心代理
2. 高并发（>5）+ 短间隔（<3s）
3. 连续注册多个账号（>10）
4. 使用已知的临时邮箱域名

### 临时解决方案

#### 短期缓解
1. **降低并发数**: 从 10 → 3
2. **增加间隔**: 从 0s → 5-10s
3. **更换代理**: 
   - 避免数据中心 IP
   - 使用住宅代理
   - 更换代理池
4. **更换邮箱提供商**: 尝试不同的临时邮箱服务
5. **等待冷却**: 暂停 1-2 小时后重试

#### 中期优化
1. **增强指纹随机性**: 更多样化的 GPU/Canvas
2. **模拟真实行为**: 
   - 随机页面停留时间
   - 随机点击/滚动事件
   - 更自然的交互时序
3. **分散时间**: 
   - 随机延迟 (30s-2m)
   - 避开高峰时段
4. **代理轮换策略**: 
   - 每个代理限制使用次数
   - 代理地理位置多样化

---

## 待收集的其他问题

### 占位符 - 待补充

格式：
```
## 问题 #N: 简要描述

### 时间
YYYY-MM-DD HH:MM:SS

### 错误信息
...

### 完整响应
...

### 问题分析
...

### 改进建议
...
```

---

## 问题统计

| 问题编号 | 描述 | 触发次数 | 严重程度 | 状态 |
|---------|------|---------|---------|------|
| #1 | 未获取到加密公钥 | 1 | 🔴 高 | 待修复 |
| #2 | send-otp 失败 (400) | 1 | 🔴 致命 | 待修复 |
| #3 | 指纹高度重复触发人机验证 | 8 (100%) | 🔴 致命 | **立即修复** |

---

---

## 问题 #3: 指纹高度重复导致100%触发人机验证

### 时间
2026-08-22 16:07 - 17:06 (1小时内8次)

### 错误信息
```
所有8次注册都触发 AWS Threat Mitigation 人机验证
errorCode: "AUTHENTICATION_FAILED"
captchaToken: "eyJ..." (AWS 威胁缓解令牌)
```

### 数据分析

#### 指纹重复率统计

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
- Chrome: 140.0.0.0 ⚠️ 完全相同
```

**GPU 信息**:
```
所有 8 次: 
- Vendor: Google Inc. (Intel)
- Model: Intel(R) UHD Graphics 620 Direct3D11
⚠️ 100% 重复
```

**代理区域**:
```
第一次: US (美国)
后续7次: CA (加拿大) - 全部相同
```

**时间间隔**:
```
平均间隔: 18 秒
最短间隔: 6 秒 ⚠️
最长间隔: 32 秒
```

### 问题分析

#### 核心问题

**指纹重复率过高**: 87.5% (7/8) 使用完全相同的硬件配置

**AWS 识别模式**:
1. 短时间内相同指纹 → 判定为批量注册
2. 即使更换代理，相同指纹仍会被关联
3. 触发 AWS Threat Mitigation 系统

#### 可能原因

1. **随机数种子问题**
   - 指纹生成使用的随机数可能不够随机
   - 相同的配置组合被反复选中

2. **配置池太小**
   - Chrome 版本: 约25种
   - CPU 核心: 5种 (2,4,8,10,16)
   - 内存: 4种 (8,16,24,32)
   - 屏幕: 约10种分辨率
   - GPU: 约50种

   **理论组合数**: 25 × 5 × 4 × 10 × 50 = 250,000
   **实际重复率**: 87.5% (7/8)
   
   **结论**: 虽然理论组合数足够，但实际选择存在严重偏向

3. **权重分布不均**
   - 某些配置组合被赋予过高权重
   - 新版本Chrome(140.0.0.0)被优先选择
   - 高端配置(10核24GB)概率过高

4. **缺少去重机制**
   - 没有检查最近使用的指纹
   - 允许短时间内重复相同配置

### 触发位置

文件: `internal/browser/identity.go`  
函数: `RandomIdentity()` / `genGPU()` / `genScreen()`

```go
// 当前代码存在的问题
func RandomIdentity() *BrowserIdentity {
    // ❌ 每次独立随机，不检查重复
    cv := genChromeVersion()  // 可能连续生成相同版本
    gpuV, gpuM := genGPU()    // 可能连续选中相同GPU
    screen := genScreen()     // 可能连续选中相同分辨率
    
    // ❌ 硬件配置独立随机
    cores := []int{2, 4, 8, 10, 16}
    mem := []int{8, 16, 24, 32}
    core := cores[rand.Intn(len(cores))]  // 均匀分布，无合理性检查
    memory := mem[rand.Intn(len(mem))]
    
    // ... 组合后可能产生相同指纹
}
```

### 影响范围
- **严重程度**: 🔴 致命
- **影响**: 100% 触发人机验证 (8/8)
- **损失**: 
  - 所有注册被AWS威胁缓解系统拦截
  - 邮箱被消耗但无法完成注册
  - 代理被标记

### 重现条件

1. 短时间内(1小时)连续注册多个账号(7+)
2. 使用默认的指纹生成逻辑
3. 未实现指纹去重检查

**触发概率**: 近100% (基于8个样本)

### 解决方案

#### ❗ 重要说明: AWS威胁缓解系统的特殊性

**当前验证码类型**: AWS Threat Mitigation (威胁缓解令牌)

```json
{
  "captchaToken": "eyJ...",  // JWT 令牌
  "captchaCDN": "https://cdn.us-east-1.threat-mitigation.aws.amazon.com/assets/consumer/consumer.min.js",
  "captchaURL": ""  // ⚠️ 为空!
}
```

**特征分析**:
1. **无图片验证码** - captchaURL 为空，不是传统的图片验证码
2. **需要 JavaScript SDK** - 必须加载 AWS 提供的 JS 脚本
3. **交互式验证** - 可能需要浏览器行为分析 (鼠标移动、点击模式等)
4. **令牌机制** - redemptionToken 包含加密的质询数据

**无法绕过的原因**:
- AWS 的 JS SDK 会分析浏览器环境和用户行为
- 纯 HTTP 请求无法模拟完整的浏览器交互
- 令牌需要客户端运行 JS 代码生成有效响应

#### ✅ 实际可行方案: 避免触发验证码

**核心策略**: 让AWS识别不出批量注册行为

#### 方案 1: 实现指纹去重 (P0 - 立即执行)

**创建指纹缓存**:
```go
// 文件: internal/browser/fp_cache.go
type FingerprintCache struct {
    mu      sync.Mutex
    used    map[string]time.Time  // hash -> 使用时间
    maxAge  time.Duration         // 24小时内不重复
}

func (fp *BrowserIdentity) Hash() string {
    // 生成指纹哈希
    data := fmt.Sprintf("%s|%d|%d|%dx%d|%s", 
        fp.ChromeVer, fp.HardwareConcurrency, fp.DeviceMemory,
        fp.Screen.Width, fp.Screen.Height, fp.GPUModel)
    hash := sha256.Sum256([]byte(data))
    return fmt.Sprintf("%x", hash[:8])
}

func RandomIdentity() *BrowserIdentity {
    for attempt := 0; attempt < 50; attempt++ {
        fp := generateFingerprint()
        if !fpCache.IsRecentlyUsed(fp) {
            fpCache.MarkUsed(fp)
            return fp
        }
    }
    // 50次仍重复，强制使用
    return generateFingerprint()
}
```

#### 方案 2: 扩展配置池 (P0 - 立即执行)

**扩展 Chrome 版本**:
```go
// 当前: 只使用最新版本 (140, 141, 142...)
// 优化: 包含更多真实在用版本

versions := []string{
    "131", "130", "129", "128", "127",  // 较旧但仍在用
    "132", "133", "134", "135",          // 中间版本
    "136", "137", "138", "139", "140",  // 较新版本
    "141", "142", "143", "144",          // 最新版本
}

// ✅ 添加权重: 最新版本概率高，但保留旧版本
weights := []int{
    10, 8, 6, 4, 3,    // 旧版本 (低权重)
    12, 12, 12, 12,    // 中间版本
    15, 15, 18, 18, 20, // 较新版本
    15, 12, 10, 8,     // 最新版本 (适当权重)
}
```

**扩展硬件配置**:
```go
// 当前: 5种CPU, 4种内存
// 优化: 9种CPU, 9种内存, 合理性检查

cpuCores := []int{2, 4, 6, 8, 10, 12, 16, 20, 24}
memoryGB := []int{4, 8, 12, 16, 20, 24, 32, 48, 64}

// ✅ 配置合理性检查
func validateConfig(cpu int, mem int) bool {
    if cpu <= 4 && mem >= 32 { return false }  // 低核不配高内存
    if cpu <= 2 && mem >= 16 { return false }
    if cpu >= 16 && mem < 16 { return false }  // 高核不配低内存
    return true
}
```

**扩展GPU池**:
```go
// 当前: 约50种
// 优化: 扩展到80+种，分层选择

// ✅ 根据CPU/内存档次选择GPU
func selectGPU(cpuCores int, memoryGB int) GPU {
    if cpuCores <= 4 && memoryGB <= 16 {
        // 低端 → Intel 集显
        return pickFrom(intelIntegratedGPUs)
    } else if cpuCores <= 8 && memoryGB <= 24 {
        // 中端 → GTX 1650, RX 580
        return pickFrom(midRangeGPUs)
    } else {
        // 高端 → RTX 3060+
        return pickFrom(highEndGPUs)
    }
}
```

#### 方案 3: 增加任务间隔 (P1 - 今天)

**当前问题**: 6-32秒，平均18秒

**优化**:
```go
// 基础延迟 + 随机抖动
if req.Delay > 0 && i < req.Count-1 {
    baseDelay := req.Delay
    if baseDelay < 30 {
        baseDelay = 30  // 最少30秒
    }
    jitter := baseDelay/2 + rand.Intn(baseDelay)  // 50%-150%
    totalDelay := baseDelay + jitter
    
    time.Sleep(time.Duration(totalDelay) * time.Second)
}
```

**推荐设置**:
- 当前: 0-5秒
- 建议: 30-90秒 (平均60秒)

#### 方案 4: 关键步骤添加思考时间 (P2)

```go
func (r *Registrar) Step9SendOTP() error {
    // 模拟用户查看页面的停顿
    thinkTime := 3 + rand.Intn(8)  // 3-10秒
    time.Sleep(time.Duration(thinkTime) * time.Second)
    
    // ... 原有逻辑
}
```

---

## 问题关联分析

### #1 与 #2 与 #3 的关系

**关联链路**:
```
#3 指纹重复 (根本原因)
  ↓
AWS 识别批量注册行为
  ↓
#2 send-otp 失败 (400) 熔断
  ↓
#1 后续步骤失败 (公钥获取失败)
```

**分析**:
1. **#3 是根本原因** - 87.5%指纹重复导致AWS判定为批量注册
2. **#2 是直接结果** - AWS威胁缓解系统触发send-otp熔断
3. **#1 可能是连带影响** - 风控升级后其他步骤也开始失败

**优先级排序**:
```
P0: #3 指纹重复 (必须首先解决)
  ↓ 解决后
P1: #2 send-otp 400 (观察是否减少)
  ↓ 如仍出现
P2: #1 公钥获取失败 (增加重试机制)
```

---

## 优先级

### P0 - 立即修复（阻塞性问题）
- **#3 指纹高度重复** - 100%触发人机验证，根本原因
- **#2 send-otp 失败 (400)** - 熔断级错误，阻塞所有任务

### P1 - 高优先级（影响成功率）
- **#1 未获取到加密公钥** - 流程中断，邮箱消耗

### P2 - 中优先级（体验优化）
- 字符编码问题
- 增强日志记录

### P3 - 低优先级（增强功能）
- 保存失败详情
- 统计分析工具

---

## 改进建议（综合）

### 1. 立即缓解措施

**针对 #2 (send-otp 400)**:
```
✓ 降低并发: 10 → 2-3
✓ 增加间隔: 0s → 10-20s
✓ 更换代理: 避免数据中心IP，使用住宅代理
✓ 暂停时间: 等待 1-2 小时后重试
✓ 限制批次: 每批次 ≤ 5 个账号
```

**针对 #1 (公钥获取失败)**:
```
✓ 增加重试: Step12a 失败时重试 2-3 次
✓ 增加延迟: 重试间隔 3-5 秒
✓ 保存详情: 自动保存失败现场
```

### 2. 日志增强（优先）

**Step 9 增强**:
```go
log.Printf("[9] 发送 OTP 到 %s", r.Email)
log.Printf("[9] 代理: %s", r.Cfg.Proxy)
log.Printf("[9] User-Agent: %s", r.FP.UserAgent)

// 失败时
if statusCode == 400 {
    log.Printf("[9] ❌ 400 Bad Request - 可能触发风控")
    log.Printf("[9] 响应体: %s", string(body))
    r.saveStep9FailureInfo(body)  // 保存详情
}
```

**Step 12 增强**:
```go
log.Printf("[12a] 请求加密公钥")
log.Printf("[12a] RegCode: %s...", r.RegCode[:20])
log.Printf("[12a] SignState: %s...", r.SignState[:20])

// 失败时
if pubKeyMap == nil {
    log.Printf("[12a] ❌ 未找到 publicKey")
    log.Printf("[12a] 完整响应: %s", string(body))
    r.saveStep12FailureInfo(body)
}
```

### 3. 失败详情保存

**统一保存函数**:
```go
func (r *Registrar) saveFailureInfo(step string, body []byte) {
    dir := "data/failure_logs"
    os.MkdirAll(dir, 0755)
    
    timestamp := time.Now().Format("20060102_150405")
    filename := fmt.Sprintf("%s/%s_%s.json", dir, step, timestamp)
    
    info := map[string]interface{}{
        "timestamp": time.Now().Format("2006-01-02 15:04:05"),
        "step": step,
        "email": r.Email,
        "proxy": r.Cfg.Proxy,
        "user_agent": r.FP.UserAgent,
        "fingerprint": r.FP,
        "response": json.RawMessage(body),
    }
    
    data, _ := json.MarshalIndent(info, "", "  ")
    os.WriteFile(filename, data, 0644)
    log.Printf("[保存] %s 失败详情: %s", step, filename)
}
```

### 4. 熔断策略优化

**当前问题**: 单个 400 立即熔断过于激进

**优化方案**:
```go
// 增加熔断阈值: 连续 N 次 400 才熔断
const killSwitchThreshold = 3

var consecutiveKillErrors int
var killErrorsMu sync.Mutex

if isKillSwitchError(errorMsg) {
    killErrorsMu.Lock()
    consecutiveKillErrors++
    current := consecutiveKillErrors
    killErrorsMu.Unlock()
    
    log.Printf("[Kiro] 检测到熔断级错误 (%d/%d): %s", 
        current, killSwitchThreshold, errorMsg)
    
    if current >= killSwitchThreshold {
        otpKillOnce.Do(func() {
            log.Printf("[Kiro] ⚠️ 连续 %d 次熔断级错误，终止任务", current)
            go StopTask(true)
        })
    }
} else {
    // 成功时重置计数器
    killErrorsMu.Lock()
    consecutiveKillErrors = 0
    killErrorsMu.Unlock()
}
```

### 5. 指纹多样化

**增强随机性**:
```go
// GPU 池扩展 (当前约 20 种 → 扩展到 50+ 种)
var gpuVendors = []string{
    "NVIDIA Corporation",
    "AMD",
    "Intel Inc.",
    "Apple Inc.",
    // ... 添加更多
}

// Canvas/WebGL 噪声增强
func addCanvasNoise() string {
    // 每次生成不同的噪声
    noise := rand.Float64() * 0.1
    // ...
}
```

### 6. 代理质量检查

**启动前检查**:
```go
func validateProxyQuality(proxyURL string) error {
    // 1. 检查 IP 类型（住宅 vs 数据中心）
    // 2. 检查 IP 地理位置
    // 3. 检查 IP 信誉
    // 4. 测试延迟和稳定性
}
```

---

## 数据收集计划

### 下一步收集重点

1. **问题 #2 (send-otp 400)**
   - [ ] 收集 5+ 个样本
   - [ ] 记录触发时的代理信息
   - [ ] 记录触发时的并发数和间隔
   - [ ] 记录完整的指纹信息
   - [ ] 记录完整的响应体

2. **问题 #1 (公钥获取失败)**
   - [ ] 收集 3+ 个样本
   - [ ] 对比成功案例的差异
   - [ ] 记录前序步骤状态
   - [ ] 记录 WorkflowHandle 变化

3. **成功案例**
   - [ ] 收集成功的完整日志
   - [ ] 分析成功时的共性
   - [ ] 建立"安全基线"

### 收集方法

```powershell
# 查看最近的错误日志
Get-Content kiroX.log | Select-String -Pattern "失败|错误|400" | Select -Last 50

# 统计错误类型
Get-Content kiroX.log | Select-String -Pattern "失败" | Group-Object | Sort Count -Desc

# 查看失败详情
Get-ChildItem data\failure_logs\*.json | Sort LastWriteTime -Desc | Select -First 5
```

---

## 下一步

1. **立即执行缓解措施**
   - 降低并发数到 2-3
   - 增加任务间隔到 15-30秒
   - 更换代理池（住宅代理）

2. **继续收集数据**
   - 运行小批次任务（每次 5 个）
   - 详细记录每次失败
   - 对比成功/失败的差异

3. **分析规律**
   - 达到 10+ 样本后统计分析
   - 识别触发条件
   - 制定针对性优化方案

4. **实施优化**
   - 增强日志记录
   - 保存失败详情
   - 优化熔断策略
   - 增强指纹多样性

---

**文档创建**: 2026-08-22  
**最后更新**: 2026-08-22 17:15  
**问题总数**: 3

**收集进度**:
- 问题 #1: 1 个样本 (目标: 3+)
- 问题 #2: 1 个样本 (目标: 5+)
- 问题 #3: 8 个样本 ✅ (已分析完成)
- 成功案例: 0 个 (目标: 10+)

**下一步行动**:
1. 🔴 **立即修复 #3** - 实现指纹去重 + 扩展配置池
2. 🟠 小批次测试 (3-5个账号，间隔60秒)
3. 📊 对比修复前后的验证码触发率
4. ✅ 如果 #3 修复有效，#2 可能自动减少
