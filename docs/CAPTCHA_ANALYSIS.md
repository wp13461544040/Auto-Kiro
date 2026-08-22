# 人机验证分析指南

## 概述

当设置密码步骤触发人机验证时，系统会自动保存完整的请求和响应信息，用于后续分析和解决方案开发。

---

## 保存的信息

### 文件结构

所有验证码相关信息保存在 `data/captcha_logs/` 目录：

```
data/captcha_logs/
├── captcha_20260822_150530_user@example.com_response.json  # 完整响应
├── captcha_20260822_150530_user@example.com_raw.json       # 原始响应体
├── captcha_20260822_150530_user@example.com_info.json      # 详细信息
├── captcha_20260822_150530_user@example.com_analysis.txt   # 分析报告
└── captcha_20260822_150530_user@example.com_captcha.png    # 验证码图片
```

### 文件说明

#### 1. response.json - 完整响应
包含服务器返回的完整 JSON 响应，已格式化便于阅读。

**关键字段**:
```json
{
  "captchaResponse": {
    "captchaToken": "...",
    "captchaURL": "...",
    "captchaType": "...",
    ...
  },
  "workflowStateHandle": "...",
  "stepId": "...",
  ...
}
```

#### 2. raw.json - 原始响应
服务器返回的原始 JSON，未经处理。

#### 3. info.json - 详细信息
包含触发验证码时的完整上下文：

```json
{
  "timestamp": "2026-08-22 15:05:30",
  "email": "user@example.com",
  "proxy": "http://proxy:port",
  "referer": "https://...",
  "user_agent": "Mozilla/5.0 ...",
  "chrome_ver": "144.0.0.0",
  "captcha": { ... },
  "identity": {
    "gpu_vendor": "...",
    "gpu_model": "...",
    "platform": "Win32",
    "memory_gb": 8,
    "cpu_cores": 4,
    "screen": { ... }
  },
  "cookies": { ... },
  "workflow": { ... }
}
```

#### 4. analysis.txt - 分析报告
人类可读的分析报告，包含：
- 触发时间和环境信息
- 验证码详情
- 用户指纹信息
- 工作流状态
- 分析建议

#### 5. captcha.png - 验证码图片
如果响应中包含验证码URL，会自动下载保存。

---

## 日志输出

触发验证码时的日志示例：

```
[12] ⚠️  检测到人机验证
[保存] 完整响应已保存: data/captcha_logs/captcha_20260822_150530_user@example.com_response.json
[保存] 验证码信息已保存: data/captcha_logs/captcha_20260822_150530_user@example.com_info.json
[保存] 分析报告已保存: data/captcha_logs/captcha_20260822_150530_user@example.com_analysis.txt
[保存] 验证码图片已保存: data/captcha_logs/captcha_20260822_150530_user@example.com_captcha.png
[保存] ✓ 验证码信息已完整保存到: data/captcha_logs
[12] 验证码Token: abc123...
[12] 验证码URL: https://...
```

---

## 分析步骤

### 第一步：查看分析报告
```bash
cat data/captcha_logs/captcha_*_analysis.txt
```

快速了解触发情况和环境。

### 第二步：分析响应结构
```bash
cat data/captcha_logs/captcha_*_response.json | jq .
```

查看 `captchaResponse` 字段的完整结构：
- `captchaToken`: 验证码会话标识
- `captchaURL`: 验证码图片地址
- `captchaType`: 验证码类型（如果有）
- 其他自定义字段

### 第三步：检查验证码图片
打开 `captcha_*_captcha.png` 查看验证码类型：
- 文本验证码（数字/字母）
- 图片选择验证码
- 滑块验证码
- 其他类型

### 第四步：分析触发条件
对比多个验证码日志，查找规律：

**代理相关**:
- 是否同一代理多次触发？
- 代理IP地址归属地？
- 代理类型（住宅/数据中心）？

**指纹相关**:
- GPU型号是否常见？
- 屏幕分辨率是否异常？
- 浏览器版本是否过新/过旧？

**行为相关**:
- 注册频率是否过高？
- 页面停留时间是否过短？
- 交互数据是否异常？

### 第五步：对比正常请求
将触发验证码的请求与未触发的请求对比：
- Headers 差异
- Cookie 差异
- 指纹参数差异
- 时序差异

---

## 常见验证码类型

### 1. 文本验证码
**特征**: 
- `captchaURL` 指向图片
- 需要识别文字/数字

**解决方案**:
- OCR识别（已集成 Tesseract）
- 第三方验证码服务（2Captcha、Anti-Captcha）
- 优化 OCR 参数提高识别率

### 2. reCAPTCHA / hCaptcha
**特征**:
- `captchaType` 可能包含类型标识
- 需要 JavaScript 交互

**解决方案**:
- 使用无头浏览器（Playwright/Puppeteer）
- 第三方验证码服务
- 改善指纹避免触发

### 3. 自定义验证码
**特征**:
- AWS 自研验证系统
- 响应中包含特殊字段

**解决方案**:
- 分析 `captchaResponse` 所有字段
- 查看前端 JS 如何处理
- 逆向分析验证逻辑

---

## 解决方案开发

### 方案一：OCR 优化
如果是简单文本验证码，优化 OCR 识别：

```go
// 在 internal/ocr/ 中调整参数
config := ocr.Config{
    Lang: "eng",
    PSM:  7,  // 单行文本
    OEM:  3,  // 默认引擎
    // 添加更多预处理
}
```

### 方案二：第三方服务
集成验证码识别服务：

1. 在 `internal/captcha/` 创建新包
2. 实现服务商接口：
```go
type Solver interface {
    Solve(captchaURL, captchaToken string) (string, error)
}
```
3. 在 `signup_password.go` 中调用

### 方案三：避免触发
从根本上降低触发概率：

**代理优化**:
- 使用更高质量的住宅代理
- 增加代理冷却时间
- 避免同一代理短时间内多次使用

**指纹优化**:
- 使用更真实的 GPU 型号
- 调整屏幕分辨率为常见值
- 使用稳定的 Chrome 版本

**行为优化**:
- 增加页面停留时间
- 添加更多真实交互数据
- 降低注册频率

### 方案四：浏览器自动化
使用真实浏览器：

1. 集成 Playwright/Puppeteer
2. 使用 Chrome DevTools Protocol
3. 人工介入或图像识别辅助

---

## 数据收集建议

### 收集足够样本
- 至少收集 10+ 个验证码案例
- 涵盖不同代理、不同时间
- 记录成功和失败的案例

### 对比分析
建立对比表格：

| 日期 | 邮箱 | 代理 | GPU | 验证码类型 | 识别结果 | 是否通过 |
|------|------|------|-----|-----------|---------|---------|
| ... | ... | ... | ... | ... | ... | ... |

### 寻找规律
- 特定代理是否更容易触发？
- 特定指纹是否被标记？
- 特定时间段是否高发？
- 注册频率阈值是多少？

---

## 工具和命令

### 查看最新验证码
```bash
# Windows PowerShell
Get-ChildItem data\captcha_logs\ -Filter "*_analysis.txt" | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Get-Content
```

### 统计触发次数
```bash
# 统计验证码文件数
(Get-ChildItem data\captcha_logs\ -Filter "*_analysis.txt").Count
```

### 提取所有验证码URL
```bash
# PowerShell
Get-ChildItem data\captcha_logs\ -Filter "*_info.json" | ForEach-Object { 
    (Get-Content $_.FullName | ConvertFrom-Json).captcha.captchaURL 
}
```

### 批量下载验证码图片
如果某些图片未下载，可以手动批量下载：
```powershell
$logs = Get-ChildItem data\captcha_logs\ -Filter "*_info.json"
foreach ($log in $logs) {
    $info = Get-Content $log.FullName | ConvertFrom-Json
    $url = $info.captcha.captchaURL
    if ($url) {
        $output = $log.FullName -replace "_info.json", "_manual.png"
        Invoke-WebRequest -Uri $url -OutFile $output
    }
}
```

---

## 注意事项

### 隐私保护
- 验证码日志包含敏感信息（邮箱、Cookie、代理）
- 不要公开分享完整日志
- 分析时注意脱敏处理

### 文件管理
- 定期清理旧日志（建议保留最近 50 个）
- 大量日志会占用磁盘空间
- 可以压缩归档历史日志

### Git 忽略
验证码日志已添加到 `.gitignore`：
```
data/captcha_logs/
```
不会被提交到代码仓库。

---

## FAQ

### Q: 为什么没有保存验证码图片？
A: 可能原因：
1. `captchaURL` 为空
2. 图片URL已过期
3. 网络问题导致下载失败

检查 `*_info.json` 中的 `captcha.captchaURL` 字段。

### Q: 如何禁用验证码保存？
A: 注释 `signup_password.go` 中的 `saveCaptchaInfo()` 调用：
```go
// if err := r.saveCaptchaInfo(...); err != nil {
//     log.Printf("...")
// }
```

### Q: 可以保存请求体吗？
A: 目前只保存响应。如需请求体，可在 `saveCaptchaInfo()` 中添加：
```go
captchaInfo["request_body"] = requestPayload
```

### Q: OCR 识别率很低怎么办？
A: 尝试：
1. 安装更好的 Tesseract 训练数据
2. 对图片进行预处理（去噪、二值化）
3. 使用第三方验证码识别服务
4. 考虑人工介入

---

## 联系与反馈

如果分析出验证码的规律或找到解决方案，欢迎：
1. 更新本文档
2. 提交代码改进
3. 分享经验和发现

**记住**: 目标是理解触发机制，从源头降低验证码出现概率！
