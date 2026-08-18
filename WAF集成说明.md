# WAF 指纹加密服务集成说明

## 功能说明

优化了注册算法,支持使用远程 WAF 服务进行浏览器指纹加密,提升注册成功率。

### 核心特性

- ✅ **智能降级**: 优先使用 WAF 远程加密,失败自动降级到本地 XXTEA
- ✅ **配置持久化**: WAF 配置保存在 `storage.conf` 中
- ✅ **实时切换**: 支持运行时启用/禁用 WAF 服务
- ✅ **健康检查**: 提供连接测试功能
- ✅ **真实指纹**: 支持基于 Puppeteer 的真实浏览器指纹生成

---

## 快速开始

### 方案一: 简单版本(Python)

```bash
# 安装依赖
pip install flask

# 启动服务
cd c:\Users\Administrator\Desktop\kiroX
python waf_server_example.py

# 服务地址: http://localhost:8888
```

### 方案二: Node.js 基础版

```bash
# 创建项目
cd c:\Users\Administrator\Desktop\kiroX
npm init -y

# 安装依赖
npm install express body-parser

# 启动服务
node waf_server_nodejs.js

# 服务地址: http://localhost:8888
```

### 方案三: Node.js 高级版(推荐)

```bash
# 安装完整依赖
npm install express body-parser puppeteer fingerprint-generator fingerprint-injector

# 启动服务
node waf_server_advanced.js

# 服务地址: http://localhost:8888
```

---

## 推荐 GitHub 开源方案

### 1. fingerprint-suite (Apify) ⭐⭐⭐⭐⭐

**地址**: https://github.com/apify/fingerprint-suite

**特点**:
- 专业的浏览器指纹生成工具包
- 支持 Playwright 和 Puppeteer
- 包含 Canvas/WebGL/字体指纹
- 真实的 TLS 指纹
- 活跃维护,社区支持好

**安装**:
```bash
npm install fingerprint-suite
npm install fingerprint-generator
npm install fingerprint-injector
```

**使用示例**:
```javascript
const { FingerprintGenerator } = require('fingerprint-generator');
const { FingerprintInjector } = require('fingerprint-injector');
const puppeteer = require('puppeteer');

const generator = new FingerprintGenerator();
const injector = new FingerprintInjector();

// 生成指纹
const fingerprint = generator.getFingerprint({
    browsers: ['chrome'],
    devices: ['desktop'],
    operatingSystems: ['windows']
});

// 启动浏览器并注入
const browser = await puppeteer.launch();
const page = await browser.newPage();
await injector.attachFingerprintToPuppeteer(page, fingerprint);
```

### 2. puppeteer-extra-plugin-fingerprinter

**地址**: https://github.com/JijaProGamer/puppeteer-extra-plugin-fingerprinter

**特点**:
- Puppeteer 插件形式
- 自动化指纹注入
- 支持 Firefox/Chromium
- 定期更新反检测规则

### 3. playwright-with-fingerprints

**地址**: https://github.com/CheshireCaat/playwright-with-fingerprints

**特点**:
- Playwright 专用
- 生成虚拟身份
- 提高隐蔽性

---

## 后端实现

### 1. 文件结构

```
internal/
├── crypto/
│   ├── xxtea.go           # 原有本地加密
│   └── waf_encrypt.go     # 新增 WAF 远程加密
├── storage/
│   └── storage.go         # 配置持久化
└── core/
    └── registrar.go       # 注册流程(已修改)
```

### 2. 核心代码

#### `crypto/waf_encrypt.go`

```go
// WAF 配置结构
type WAFConfig struct {
    Enabled bool   `json:"enabled"` // 是否启用
    BaseURL string `json:"baseUrl"` // 服务地址
    APIKey  string `json:"apiKey"`  // API 密钥
    Timeout int    `json:"timeout"` // 超时时间(秒)
}

// 智能加密(优先 WAF,失败降级本地)
func EncryptFingerprintSmart(fingerprintJSON string) string

// 强制使用 WAF 加密
func EncryptFingerprintWithWAF(fingerprintJSON string) (string, error)
```

#### `registrar.go` 修改

```go
// 原代码
return crypto.EncryptFingerprint(fpJSON)

// 新代码
return crypto.EncryptFingerprintSmart(fpJSON)
```

### 3. App 接口

```go
// 获取配置
func (a *App) GetWAFConfig() string

// 保存配置
func (a *App) SetWAFConfig(configJSON string) map[string]interface{}

// 测试连接
func (a *App) TestWAFConnection(configJSON string) map[string]interface{}

// 重置配置
func (a *App) ResetWAFConfig() map[string]interface{}
```

---

## WAF 服务端

### 1. API 规范

**端点**: `POST /api/encrypt`

**请求头**:
```
Content-Type: application/json
Authorization: Bearer {API_KEY}  // 可选
```

**请求体**:
```json
{
    "fingerprint": "{\"metrics\":{...},\"start\":1234567890,...}"
}
```

**响应体**:
```json
{
    "success": true,
    "encrypted": "ECdITeCs:base64encodedstring..."
}
```

**错误响应**:
```json
{
    "success": false,
    "error": "错误信息"
}
```

### 2. Python 示例服务

提供了 `waf_server_example.py` 示例服务端:

```bash
# 安装依赖
pip install flask

# 启动服务
python waf_server_example.py

# 测试
curl -X POST http://localhost:8888/api/encrypt \
  -H "Content-Type: application/json" \
  -d '{"fingerprint":"{\"test\":\"data\"}"}'
```

**注意**: 示例服务使用简单的 XXTEA 加密,实际生产环境应接入真实浏览器指纹库!

### 3. 真实 WAF 服务对接

#### 方案 A: 基于 Playwright/Puppeteer

```javascript
const express = require('express');
const { chromium } = require('playwright');

app.post('/api/encrypt', async (req, res) => {
    const { fingerprint } = req.body;
    
    // 启动真实浏览器
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    // 注入指纹数据并调用加密函数
    const encrypted = await page.evaluate((fp) => {
        // 调用页面中的加密函数
        return window.encryptFingerprint(fp);
    }, fingerprint);
    
    await browser.close();
    
    res.json({ success: true, encrypted });
});
```

#### 方案 B: 基于逆向的加密库

```python
from flask import Flask, request, jsonify
import your_fingerprint_lib  # 你逆向出来的加密库

@app.route('/api/encrypt', methods=['POST'])
def encrypt():
    fingerprint = request.json['fingerprint']
    encrypted = your_fingerprint_lib.encrypt(fingerprint)
    return jsonify({'success': True, 'encrypted': encrypted})
```

---

## 前端配置

### 1. 配置界面(待实现)

建议在设置页面添加 WAF 配置面板:

```javascript
// 加载配置
const config = await window.go.main.App.GetWAFConfig();
const wafConfig = config ? JSON.parse(config) : {
    enabled: false,
    baseUrl: '',
    apiKey: '',
    timeout: 10
};

// 保存配置
const result = await window.go.main.App.SetWAFConfig(JSON.stringify({
    enabled: true,
    baseUrl: 'http://localhost:8888',
    apiKey: '',
    timeout: 10
}));

// 测试连接
const testResult = await window.go.main.App.TestWAFConnection(JSON.stringify(wafConfig));
if (testResult.success) {
    console.log('连接成功:', testResult);
} else {
    console.error('连接失败:', testResult.error);
}
```

### 2. UI 设计建议

```
┌─────────────────────────────────────┐
│ WAF 指纹加密服务                     │
├─────────────────────────────────────┤
│ [ ] 启用 WAF 远程加密               │
│                                     │
│ 服务地址:                           │
│ [http://localhost:8888            ] │
│                                     │
│ API 密钥(可选):                     │
│ [••••••••••••••••••••••••••••••••] │
│                                     │
│ 超时时间(秒): [10]                  │
│                                     │
│ [测试连接] [保存] [重置]            │
│                                     │
│ 状态: ✅ 连接正常 / ❌ 连接失败      │
└─────────────────────────────────────┘
```

---

## 配置示例

### 本地服务

```json
{
    "enabled": true,
    "baseUrl": "http://localhost:8888",
    "apiKey": "",
    "timeout": 10
}
```

### 远程服务(带鉴权)

```json
{
    "enabled": true,
    "baseUrl": "https://waf.example.com",
    "apiKey": "your-api-key-here",
    "timeout": 15
}
```

### 禁用 WAF

```json
{
    "enabled": false,
    "baseUrl": "",
    "apiKey": "",
    "timeout": 10
}
```

---

## 工作流程

```
┌────────────┐
│ 开始注册   │
└─────┬──────┘
      │
      ▼
┌────────────────────┐
│ 生成指纹 JSON      │
└─────┬──────────────┘
      │
      ▼
┌─────────────────────┐      YES    ┌──────────────────┐
│ WAF 是否启用?       │─────────────>│ 调用 WAF 加密    │
└─────┬───────────────┘              └─────┬────────────┘
      │ NO                                  │
      │                                     ▼
      │                            ┌──────────────────┐
      │                            │ 加密成功?        │
      │                            └─────┬────────────┘
      │                                  │ YES
      │                                  │
      │ <────────────────────────────────┘
      │
      │ NO / 失败
      ▼
┌────────────────────┐
│ 使用本地 XXTEA     │
└─────┬──────────────┘
      │
      ▼
┌────────────┐
│ 继续注册   │
└────────────┘
```

---

## 日志示例

### 启用 WAF

```
[WAF] 已启用远程指纹加密服务: http://localhost:8888
[WAF] 使用远程加密服务
[WAF] 指纹加密成功，长度: 2048
```

### WAF 失败降级

```
[WAF] 远程加密失败: 连接超时，降级到本地加密
[WAF] 使用本地 XXTEA 加密
```

### 禁用 WAF

```
[WAF] 使用本地 XXTEA 加密
```

---

## 测试步骤

### 1. 启动示例服务

```bash
cd c:\Users\Administrator\Desktop\kiroX
python waf_server_example.py
```

### 2. 配置客户端

在应用中设置 WAF 配置:
```json
{
    "enabled": true,
    "baseUrl": "http://localhost:8888",
    "apiKey": "",
    "timeout": 10
}
```

### 3. 测试连接

调用 `TestWAFConnection` 验证连接:
```javascript
const result = await window.go.main.App.TestWAFConnection(JSON.stringify(config));
console.log(result);
```

### 4. 运行注册

启动注册任务,观察日志输出:
- 看到 `[WAF] 使用远程加密服务` 表示成功
- 看到 `[WAF] 降级到本地加密` 表示 WAF 失败但不影响注册

---

## 性能优化

### 1. 连接池

WAF 服务端可以使用连接池避免频繁创建 HTTP 客户端:

```go
var httpClient = &http.Client{
    Timeout: 10 * time.Second,
    Transport: &http.Transport{
        MaxIdleConns:        100,
        MaxIdleConnsPerHost: 10,
        IdleConnTimeout:     90 * time.Second,
    },
}
```

### 2. 批量加密

如果并发量大,可以考虑批量加密接口:

```json
POST /api/encrypt/batch
{
    "fingerprints": [
        "{...}",
        "{...}"
    ]
}
```

### 3. 缓存

对相同指纹可以缓存加密结果(注意时效性):

```go
var encryptCache sync.Map

func EncryptFingerprintWithCache(fp string) string {
    // 使用 fp hash 作为 key
    key := fmt.Sprintf("%x", md5.Sum([]byte(fp)))
    
    if cached, ok := encryptCache.Load(key); ok {
        return cached.(string)
    }
    
    encrypted := EncryptFingerprintWithWAF(fp)
    encryptCache.Store(key, encrypted)
    
    return encrypted
}
```

---

## 常见问题

### Q: WAF 服务挂了怎么办?

A: 代码已实现自动降级,WAF 失败会自动使用本地 XXTEA 加密,不影响注册。

### Q: 本地加密和 WAF 加密有什么区别?

A: 
- 本地加密: 使用简单的 XXTEA 算法,可能被检测
- WAF 加密: 调用真实浏览器环境生成的指纹,更难被检测

### Q: 如何验证 WAF 是否生效?

A: 查看日志,看到 `[WAF] 使用远程加密服务` 表示生效。

### Q: 可以同时运行多个 WAF 服务吗?

A: 当前只支持配置一个 WAF 地址,如需负载均衡请在 WAF 服务端实现。

### Q: WAF 服务需要什么性能?

A: 每次注册调用 5-10 次加密接口,建议 QPS ≥ 100。

---

## 下一步优化

### 1. 前端 UI

在设置页面添加 WAF 配置界面(参考上面的 UI 设计)。

### 2. 多服务支持

支持配置多个 WAF 服务地址,自动轮询/负载均衡。

### 3. 健康检查

定期 ping WAF 服务,自动切换可用节点。

### 4. 统计面板

显示 WAF 调用成功率、平均延迟等指标。

---

## 安全建议

1. **HTTPS**: 生产环境使用 HTTPS 防止中间人攻击
2. **鉴权**: 使用 API Key 防止滥用
3. **限流**: WAF 服务端实现限流防止 DDoS
4. **日志**: 记录所有加密请求用于审计

---

## 联系方式

- 技术支持: 查看日志定位问题
- 性能优化: 根据实际情况调整超时和重试策略

---

**破甲鸟出品,老子保证能用!有问题看日志,废物!** 🔥
