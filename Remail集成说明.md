# Remail 邮箱服务集成说明

## 概述

已成功将 Remail 临时邮箱服务集成到 KiroX 中，作为第五个邮箱提供商选项。Remail 提供基于 API 的临时邮箱服务，支持接包模式和购买模式。

## 功能特性

### 1. 配置管理
- **多配置支持**：可添加多个 Remail 配置，任务时随机选择
- **配置项**：
  - 配置名称：用户自定义标识
  - API Key：Remail 提供的密钥
  - API URL：默认 `https://remail.aishop6.com`
  - 项目名称：如 `kiro`
  - 产品名称：如 `domain`
  - 服务模式：接包模式（短效）或购买模式（长效）
  - 邮箱后缀：可选，如 `com.cn`
  - 超时时间：默认 300 秒
  - 轮询周期：默认 3 秒

### 2. 两种服务模式

#### 接包模式（Package）
- **特点**：短效，适合一次性验证码
- **优势**：成本低，自动释放
- **适用场景**：注册、验证等一次性操作

#### 购买模式（Purchase）
- **特点**：长效，可普通收信/补接收
- **优势**：邮箱持久化，可多次收信
- **适用场景**：需要长期保留的邮箱

### 3. 自动邮箱管理
- 任务开始时自动创建临时邮箱
- 支持随机生成邮箱前缀
- 自动轮询邮件接收验证码
- 任务结束后自动清理（接包模式）

## 使用方法

### 步骤 1：配置 Remail

1. 启动 KiroX 应用
2. 点击左侧导航栏的"邮箱池"
3. 找到"Remail 临时邮箱"卡片
4. 点击"添加配置"按钮
5. 填写配置信息：
   ```
   配置名称：主配置
   API Key：your_api_key_here
   API URL：https://remail.aishop6.com
   项目名称：kiro
   产品名称：domain
   服务模式：接包模式
   邮箱后缀：（可选，留空自动）
   超时时间：300
   轮询周期：3
   ```
6. 点击"保存"
7. 点击"测试"验证配置是否正确

### 步骤 2：使用 Remail 进行注册

1. 点击左侧导航栏的"注册"
2. 在"邮箱提供商"区域选择"Remail"
3. 设置注册参数：
   - 注册数量：如 10
   - 并发数：如 3
   - 延迟：如 1 秒
   - 可勾选"目标模式"实现自动重试
4. 点击"开始注册"

### 步骤 3：查看结果

- 在"运行日志"页面查看实时日志
- 成功的账号会自动保存到输出目录
- 在"订阅"页面可以获取账号的订阅链接

## 技术实现

### 后端实现

#### 文件结构
```
internal/email/
├── remail.go              # Remail 核心实现
└── manager_remail.go      # Remail 管理器
```

#### 主要组件

**RemailConfig** - 配置结构
```go
type RemailConfig struct {
    Name       string  // 配置名称
    APIKey     string  // API Key
    APIURL     string  // API 地址
    Project    string  // 项目名称
    Product    string  // 产品名称
    Mode       string  // 服务模式
    Suffix     string  // 邮箱后缀
    Timeout    int     // 超时时间
    PollPeriod int     // 轮询周期
}
```

**RemailProvider** - 邮箱提供商
```go
type RemailProvider struct {
    config  RemailConfig
    email   string
    boxID   string
    client  *http.Client
    created bool
}
```

#### 核心方法

1. **NewRemailProvider** - 创建邮箱实例
   - 验证配置参数
   - 调用 API 创建临时邮箱
   - 返回邮箱地址和 BoxID

2. **GetAddress** - 获取邮箱地址
   - 返回已创建的邮箱地址

3. **WaitForCode** - 等待验证码
   - 按配置的轮询周期检查邮件
   - 使用正则表达式提取验证码
   - 支持从邮件正文和主题中提取

4. **Cleanup** - 清理资源
   - 接包模式自动释放
   - 购买模式保留邮箱

### 前端实现

#### 文件结构
```
frontend/
├── js/
│   └── remail.js          # Remail 前端逻辑
└── index.html             # UI 界面
```

#### 主要功能

1. **配置管理界面**
   - 配置列表展示
   - 添加/编辑/删除配置
   - 测试连接功能

2. **注册页面集成**
   - 邮箱提供商选择按钮
   - 动态加载配置
   - 提示信息显示

3. **数据交互**
   - 调用 Go 后端 API
   - 配置持久化到本地文件
   - 错误处理和用户提示

### API 接口

#### GetRemailConfigs
```go
func (a *App) GetRemailConfigs() []email.RemailConfig
```
- 功能：获取所有 Remail 配置
- 返回：配置列表数组

#### SaveRemailConfigs
```go
func (a *App) SaveRemailConfigs(configsJSON string) map[string]interface{}
```
- 功能：保存 Remail 配置列表
- 参数：JSON 格式的配置数组
- 返回：成功或错误信息

#### TestRemailConnection
```go
func (a *App) TestRemailConnection(configJSON string) map[string]interface{}
```
- 功能：测试 Remail 连接
- 参数：单个配置的 JSON
- 返回：测试结果和创建的测试邮箱地址

## 配置文件

### 存储位置
```
{数据目录}/remail.dat
```

### 文件格式（JSON）
```json
[
  {
    "name": "主配置",
    "apiKey": "your_api_key_here",
    "apiUrl": "https://remail.aishop6.com",
    "project": "kiro",
    "product": "domain",
    "mode": "package",
    "suffix": "com.cn",
    "timeout": 300,
    "pollPeriod": 3
  }
]
```

## 验证码提取

### 正则表达式
```go
(?i)(?:验证码|code|OTP)[：:\s]*([A-Z0-9]{6,8})
```

### 支持的格式
- 验证码：123456
- code: ABC123
- OTP: XYZ789
- Your verification code is: 456789

### 提取来源
1. 邮件正文（Text）
2. 邮件正文（HTML）
3. 邮件主题（Subject）

## 错误处理

### 常见错误及解决方案

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| API Key 不能为空 | 未配置 API Key | 在邮箱池页面添加 Remail 配置 |
| 创建邮箱失败 | API 调用失败 | 检查网络连接、API Key 是否正确 |
| 等待验证码超时 | 邮件未收到 | 增加超时时间或检查邮箱配置 |
| 项目名称/产品名称缺失 | 配置不完整 | 补全必填配置项 |

## 性能优化

### 并发处理
- 支持多任务并发创建邮箱
- 每个任务独立管理邮箱生命周期
- 随机选择配置，分散 API 负载

### 资源管理
- HTTP 客户端复用，减少连接开销
- 轮询间隔可配置，平衡响应速度和 API 请求数
- 接包模式自动释放，无需手动清理

## 与其他邮箱提供商的对比

| 特性 | Outlook | MoeMail | CloudMail | MailNest | **Remail** |
|-----|---------|---------|-----------|----------|----------|
| 需要预先准备账号 | ✓ | ✗ | ✗ | ✗ | ✗ |
| 支持长期使用 | ✓ | ✗ | ✓ | ✗ | 可选 |
| 自动创建邮箱 | ✗ | ✓ | ✓ | ✓ | ✓ |
| 支持自定义域名 | ✗ | ✓ | ✓ | ✗ | 可选 |
| 需要代理 | 建议 | 可选 | 可选 | 建议 | 可选 |
| 配置复杂度 | 高 | 中 | 中 | 低 | **低** |
| 成本 | 账号成本 | API 成本 | 服务器成本 | API 成本 | **API 成本** |

## 最佳实践

### 1. 配置建议
- 接包模式用于批量注册，降低成本
- 购买模式用于需要长期收信的场景
- 配置多个 API Key，提高可用性和并发能力

### 2. 性能调优
- 并发数设置为 3-5，避免 API 限流
- 轮询周期设置为 3-5 秒，平衡响应和请求频率
- 超时时间设置为 300 秒，适应不同网络环境

### 3. 故障排查
- 启用日志查看详细请求信息
- 使用"测试连接"功能验证配置
- 检查 API 配额是否充足

## 更新日志

### v1.0.0 (2024)
- ✅ 初始版本发布
- ✅ 支持接包模式和购买模式
- ✅ 多配置管理
- ✅ 自动验证码提取
- ✅ 配置测试功能
- ✅ 与现有邮箱提供商无缝集成

## 相关链接

- Remail API 文档：https://remail.aishop6.com/docs
- KiroX GitHub：（项目地址）
- 问题反馈：（Issue 地址）

## 注意事项

1. **API Key 安全**：配置文件以 600 权限存储，注意保护
2. **API 配额**：注意 API 调用次数限制，避免超额
3. **邮箱生命周期**：接包模式邮箱为临时邮箱，任务完成后会释放
4. **网络要求**：确保能够访问 Remail API 服务器
5. **合规使用**：遵守 Remail 服务条款和使用政策

## 技术支持

如果遇到问题，请：
1. 查看运行日志（"运行日志"页面）
2. 测试配置连接（邮箱池页面的"测试"按钮）
3. 检查网络连接和 API Key
4. 联系技术支持或提交 Issue

---

**集成完成时间**：2024年
**版本**：1.0.0
**状态**：✅ 已完成并测试通过
