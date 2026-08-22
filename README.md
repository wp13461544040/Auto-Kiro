<p align="center">
  <img src="frontend/assets/appicon.svg" width="100" height="100" alt="KiroX">
</p>

<h1 align="center">KiroX</h1>

<p align="center">
  AWS Builder ID (Kiro) 批量自动注册工具
</p>

<p align="center">
  <a href="README.md">简体中文</a> ·
  <a href="README.en.md">English</a> ·
  <a href="README.ja.md">日本語</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v2.0--optimized-6366f1?style=flat-square" alt="version">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0078d4?style=flat-square" alt="platform">
  <img src="https://img.shields.io/badge/Go-1.24-00ADD8?style=flat-square&logo=go" alt="go">
  <img src="https://img.shields.io/badge/Wails-v2-red?style=flat-square" alt="wails">
  <a href="https://linux.do"><img src="https://img.shields.io/badge/LINUX%20DO-社区-f0b752?style=flat-square" alt="LINUX DO"></a>
  <img src="https://img.shields.io/badge/license-Apache%202.0-green?style=flat-square" alt="license">
</p>

---

## 简介

KiroX 是一款基于 [Wails v2](https://wails.io) 构建的桌面应用，用于自动化完成 AWS Builder ID 账号的批量注册流程。支持 Outlook 邮箱池、MoeMail 临时邮箱、MailNest 临时邮箱以及自部署的 Cloud-Mail 四种邮件来源，内置浏览器指纹模拟、并发控制、代理支持和自动更新。

**优化版本特性** (v2.0-optimized):
- ✅ 智能代理池管理：8小时自动冷却，避免代理过度使用
- ✅ 动态并发控制：根据可用代理数自动调整并发
- ✅ 时序真实性：正态分布模拟真实用户行为
- ✅ 增强错误处理：详细日志，便于问题排查

📖 **优化文档**:
- [优化变更日志](OPTIMIZATION_CHANGELOG.md) - 详细变更记录
- [优化总结](docs/OPTIMIZATION_SUMMARY.md) - 完整优化说明
- [快速参考](docs/QUICK_REFERENCE.md) - 快速上手指南
- [故障点分析](docs/POTENTIAL_FAILURE_POINTS.md) - 问题排查手册

---

## 功能特性

**注册流程**
- 完整的 15 步 AWS Builder ID 注册自动化（OIDC 注册 → 设备授权 → 邮箱验证 → 密码设置 → SSO → Kiro Token 交换）
- 注册完成后自动验证账号存活状态
- 支持批量注册，可配置数量、并发数和任务间隔

**邮箱支持**
- **Outlook 邮箱池**：导入 `邮箱----密码----客户端ID----RefreshToken` 格式账号，自动通过 IMAP 获取验证码
- **MoeMail 临时邮箱**：支持多域名配置，自动轮换，支持随机/全部/指定域名模式
- **Cloud-Mail 自部署邮箱**：对接 [cloud-mail](https://github.com/jiangrungen/cloud-mail) 服务，域名可自动从服务器拉取，支持随机/轮询/指定模式
- **MailNest-迈巢**：对接 [MailNest-迈巢](https://mailnest.top/) 服务，使用 Outlook 临时邮箱

**反检测**
- 随机化 Chrome 版本（120–144）
- 随机化设备指纹（GPU、内存、CPU 核数、屏幕分辨率）
- WebGL 扩展伪造、Canvas 指纹生成
- 基于 `tls-client` 的 TLS 指纹模拟
- **正态分布交互数据**：点击、按键、停留时间更接近真实用户
- **指纹一致性保证**：同一会话内硬件级字段保持不变

**代理管理** (优化版新增)
- 全局代理配置，支持 HTTP / HTTPS / SOCKS5
- **代理池管理**：多代理轮换，8小时自动冷却机制
- **智能并发控制**：根据可用代理数动态调整并发
- **实时状态监控**：前端显示代理冷却状态和剩余时间
- 支持 `协议://用户:密码@host:port` 或简写 `host:port:user:pass` 格式

**自动更新**
- 检查 GitHub Releases 最新版本（语义化版本比较）
- 下载时 SHA256 完整性校验 + PE 头验证
- Windows 批处理脚本实现进程退出后无感替换并重启

---


## 快速开始

### 直接使用

从 [Releases](https://github.com/wp13461544040/Auto-Kiro/releases/latest) 下载最新的 `kirox.exe`，双击运行即可。

### 从源码构建

**环境要求**
- Go 1.24+
- Node.js 20+
- Wails CLI

```bash
# 安装 Wails CLI
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# 克隆仓库
git clone https://github.com/wp13461544040/Auto-Kiro.git
cd Auto-Kiro

# 开发模式（热重载）
wails dev

# 生产构建
wails build
```

构建产物位于 `build/bin/kiro-reg.exe`。

---

## 使用说明

### 1. 配置邮箱

**Outlook 邮箱池**（推荐）

在「邮箱池」页面导入账号，每行一条，格式：
```
邮箱----密码----客户端ID----RefreshToken
```
支持从 `.txt` / `.csv` 文件批量导入，也可手动粘贴。

**MoeMail 临时邮箱**

在「邮箱池」页面添加 MoeMail 配置，填入 API 地址和 API Key，测试连接后保存。注册时可选择随机域名、全部域名或指定域名。

**MailNest-迈巢 Outlook 临时邮箱**

在「邮箱池」页面添加 MailNest 配置，填入 API Key 和项目代码，通过测试连接按钮可以获取当前账户的余额，测试通过后点击添加配置按钮完成配置，即可使用。

- `api-key`：获取页面为 https://mailnest.top/account
- 项目代码：迈巢根据项目提供对应的 Outlook 临时邮箱，KiroX 的项目代码默认为`aws001`，可直接使用。项目代码获取页面：https://mailnest.top/buy-email

### 2. 启动注册

切换到「注册」页面：
- 设置注册数量、并发数（建议 1–5）、任务间隔（秒）
- 选择邮箱来源
- 点击「开始注册」

### 3. 查看结果

注册成功的账号实时写入结果输出目录（默认为程序所在目录），文件名 `accounts.json`，格式：

```json
[
  {
    "email": "xxx@outlook.com",
    "password": "...",
    "access_token": "...",
    "refresh_token": "...",
    "registered_at": "2026-05-16T12:00:00Z"
  }
]
```

### 4. 代理池管理 (优化版)

在「代理池」页面：
- 添加多个代理，设置权重（1-100）
- 系统自动轮换代理，每个代理使用后冷却8小时
- 前端显示冷却状态和剩余时间
- 可手动「解除冷却」或「重置全部冷却」

**代理池建议**:
```
并发数 → 最少代理数
并发1  → 3个代理
并发5  → 12个代理
并发10 → 25个代理
并发20 → 45个代理
```

### 5. 全局代理配置

在「设置」页面填入代理地址，支持以下格式：
```
http://user:pass@host:port
socks5://host:port
host:port:user:pass
```
留空则直连。

---

## 项目结构

```
kirox/
├── main.go                    # 入口，Wails 初始化
├── app.go                     # App 结构体，Wails 绑定方法
├── internal/
│   ├── core/                  # 注册核心逻辑（15 步流程）
│   │   ├── registrar.go       # Registrar 结构体，HTTP 客户端
│   │   ├── run.go             # 步骤编排
│   │   ├── auth.go            # 步骤 1–5
│   │   ├── signup_flow.go     # 步骤 6–9
│   │   ├── signup_password.go # 步骤 10–12
│   │   ├── kiro_auth.go       # 步骤 13–14
│   │   ├── kiro_exchange.go   # 步骤 15
│   │   └── verify.go          # 账号验证
│   ├── browser/               # 浏览器指纹模拟
│   ├── email/                 # 邮箱服务（Outlook / MoeMail）
│   ├── crypto/                # JWE 加密、XXTEA
│   ├── storage/               # 账号存储、配置持久化
│   ├── task/                  # 批量任务调度、并发控制
│   ├── data/                  # 注册结果读写
│   ├── proxy/                 # 代理出口 IP / 归属检测
│   ├── subscription/          # 订阅链接：刷 Token + listAvailableSubscriptions / CreateSubscriptionToken / setUserPreference
│   ├── updater/               # 自动更新
│   └── http/                  # TLS 客户端工具
└── frontend/
    ├── index.html             # 单页应用入口
    ├── js/                    # 页面逻辑（overview / accounts / moemail / task / subscription / app / ui）
    ├── css/                   # 样式（layout / components / style）
    └── build.js               # 前端构建脚本
```

---

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | [Wails v2](https://wails.io) |
| 后端语言 | Go 1.24 |
| HTTP 客户端 | [bogdanfinn/tls-client](https://github.com/bogdanfinn/tls-client) |
| 前端 | 原生 HTML / CSS / JavaScript |
| 加密 | RSA-OAEP-256 + AES-256-GCM (JWE) |

---

## 注意事项

- 本工具仅供学习和研究使用，请遵守 AWS 服务条款
- 建议配合代理使用，避免 IP 被限速
- Outlook 账号需提前准备好有效的 RefreshToken
- 并发数建议根据可用代理数调整（系统会自动提示）
- **代理池模式**：确保有足够的代理数量（建议 = 并发数 × 2.5）
- **调试模式**：遇到问题时在设置中启用 Debug 查看详细日志

---

## 常见问题

### 人机验证相关 🆕

**问题：设置密码时遇到人机验证**

系统会自动：
1. 保存完整的验证码信息到 `data/captcha_logs/`
2. 尝试使用 OCR 识别验证码（如果安装了 Tesseract）
3. 记录详细日志用于分析

保存的文件：
- `*_response.json` - 完整响应
- `*_info.json` - 详细上下文
- `*_analysis.txt` - 分析报告
- `*_captcha.png` - 验证码图片（如果有）

解决方案：
1. 查看 `data/captcha_logs/` 目录下的分析报告
2. 阅读 [人机验证分析指南](docs/CAPTCHA_ANALYSIS.md)
3. 根据分析调整代理或指纹配置
4. 考虑安装 Tesseract 进行 OCR 识别

**降低触发概率**：
- 使用高质量住宅代理
- 增加代理池大小，降低单个代理使用频率
- 降低并发数
- 增加任务间隔时间

### 代理池相关 (优化版)

**问题：提示"代理池无可用代理"**

原因：所有代理都在冷却中或已禁用

解决方案：
1. 点击「重置全部冷却」按钮
2. 添加更多代理到代理池
3. 等待冷却时间过去（8小时）
4. 检查代理是否被禁用

**问题：并发数过高提示**

日志：`建议并发数: X (当前设置: Y)`

解决方案：
1. 查看当前可用代理数
2. 手动调整并发数为建议值
3. 或增加代理数量

### IP 纯净度相关

如果运行中出现下面这两类报错，多半是当前出口 IP 不够纯净（代理 IP 已被 AWS / Microsoft 风控）。

**情况一：发送邮箱验证码响应 OTP 400**

![情况一](docs/images/1.png)
![情况一](docs/images/3.png)

建议更换更干净的住宅代理。

> 如果使用的是自建邮箱或一次性邮箱（MoeMail 等），OTP 400 也可能是邮箱域名已被 Microsoft / AWS 拉黑导致；可换一个域名再试。

**情况二：注册流程直接卡住或邮箱无法访问**

![情况二](docs/images/2.png)

此时先用本机浏览器（带相同代理）尝试打开 [outlook.live.com](https://outlook.live.com)：

- 如果浏览器都打不开 / 跳验证码 → 当前 IP 已被 Microsoft 风控，需要换代理
- 如果浏览器能正常访问 → 检查 Outlook 账号的 RefreshToken 是否仍然有效

### macOS 提示「应用已损坏，无法打开」

未签名的应用首次运行时会被 macOS Gatekeeper 拦截。在终端执行下面的命令移除下载隔离标记即可正常打开：

```bash
xattr -cr /path/to/KiroX.app
```

将 `/path/to/KiroX.app` 替换成实际路径（例如把 `KiroX.app` 拖入终端可自动填入）。

---

## 版本历史

### v2.0-optimized (2026-08-22)
- ✅ 新增代理池智能管理（8小时自动冷却）
- ✅ 动态并发控制（根据可用代理自动调整）
- ✅ 时序真实性改进（正态分布模拟）
- ✅ 增强错误处理和调试日志
- ✅ WAF 加密服务预检
- 📖 详见 [OPTIMIZATION_CHANGELOG.md](OPTIMIZATION_CHANGELOG.md)

### v1.0.0
- 基础注册功能
- 支持多种邮箱服务
- 浏览器指纹模拟

---

## 作者

**wp** · [@wp13461544040](https://github.com/wp13461544040)

Copyright © 2026

---

## 开源协议

本项目基于 [Apache License 2.0](LICENSE) 开源。

```
Copyright 2026 wp

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
