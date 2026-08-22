# 人机验证自动分析功能

## 🎯 功能概述

v2.0-optimized 版本新增了完整的人机验证自动分析功能。当注册过程中遇到验证码时，系统会：

1. ✅ **自动检测** - 识别响应中的 `captchaResponse` 字段
2. ✅ **完整保存** - 保存响应、上下文、图片等全部信息
3. ✅ **智能分析** - 生成可读的分析报告
4. ✅ **尝试识别** - 使用 OCR 自动识别（需要 Tesseract）
5. ✅ **便于排查** - 所有信息结构化保存，方便后续研究

---

## 📁 保存的文件

### 位置
```
data/captcha_logs/
```

### 文件命名格式
```
captcha_YYYYMMDD_HHMMSS_邮箱地址_类型.扩展名
```

### 文件类型

| 文件 | 说明 | 用途 |
|------|------|------|
| `*_response.json` | 完整响应 JSON（格式化） | 分析响应结构 |
| `*_raw.json` | 原始响应体 | 备份原始数据 |
| `*_info.json` | 详细上下文信息 | 查看触发环境 |
| `*_analysis.txt` | 人类可读分析报告 | 快速了解情况 |
| `*_captcha.png` | 验证码图片 | OCR 识别/人工查看 |

---

## 📊 保存的信息

### 1. 验证码信息
- `captchaToken` - 验证码会话标识
- `captchaURL` - 验证码图片地址
- `captchaType` - 验证码类型
- 其他自定义字段

### 2. 环境信息
- 触发时间
- 使用的邮箱
- 使用的代理
- User-Agent
- Chrome 版本

### 3. 指纹信息
- GPU 厂商和型号
- 平台信息
- 内存大小
- CPU 核心数
- 屏幕分辨率

### 4. 工作流状态
- WorkflowHandle
- WorkflowID
- RegistrationCode
- SignState

### 5. Cookie 信息
- 所有当前 Cookie
- 用于分析会话状态

---

## 🔍 使用示例

### 查看最新的验证码分析
```powershell
# Windows PowerShell
Get-ChildItem data\captcha_logs\*_analysis.txt | 
    Sort-Object LastWriteTime -Descending | 
    Select-Object -First 1 | 
    Get-Content
```

### 查看所有验证码类型
```powershell
Get-ChildItem data\captcha_logs\*_info.json | ForEach-Object {
    $info = Get-Content $_.FullName | ConvertFrom-Json
    [PSCustomObject]@{
        Time = $info.timestamp
        Email = $info.email
        Type = $info.captcha.captchaType
        Token = $info.captcha.captchaToken.Substring(0, 20)
    }
} | Format-Table -AutoSize
```

### 统计触发次数
```powershell
$count = (Get-ChildItem data\captcha_logs\*_analysis.txt).Count
Write-Host "共触发 $count 次人机验证"
```

---

## 🛠️ 日志示例

### 触发验证码时
```
[12] 设置密码
[12] ⚠️  检测到人机验证
[保存] 完整响应已保存: data/captcha_logs/captcha_20260822_153045_user@example.com_response.json
[保存] 验证码信息已保存: data/captcha_logs/captcha_20260822_153045_user@example.com_info.json
[保存] 分析报告已保存: data/captcha_logs/captcha_20260822_153045_user@example.com_analysis.txt
[保存] 验证码图片已保存: data/captcha_logs/captcha_20260822_153045_user@example.com_captcha.png
[保存] ✓ 验证码信息已完整保存到: data/captcha_logs
[12] 验证码Token: abcdef123456...
[12] 验证码URL: https://signin.aws.amazon.com/captcha/...
```

### OCR 识别尝试
```
[12] 尝试OCR识别验证码...
[12] OCR识别成功: AB3CD7 (长度: 6)
[12.1] 重试设置密码(附带OCR识别的验证码: AB3CD7)
```

### OCR 失败时
```
[12] 尝试OCR识别验证码...
[12] OCR识别失败: Tesseract not found
[Kiro][任务标签] 注册失败: OCR识别失败
```

---

## 📈 分析报告示例

`*_analysis.txt` 文件内容：

```
=== 人机验证分析报告 ===
时间: 2026-08-22 15:30:45
邮箱: test@outlook.com
代理: http://proxy.example.com:8080

【验证码信息】
Token: abc123def456...
URL: https://signin.aws.amazon.com/captcha/image?token=...
类型: text
其他字段: map[...]

【用户环境】
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...
Chrome版本: 144.0.0.0
GPU: NVIDIA GeForce RTX 3060
平台: Win32
内存: 16 GB
CPU核心: 8
屏幕: 1920x1080

【工作流状态】
WorkflowHandle: wfh-abc123...
WorkflowID: wfid-def456...
RegCode: rc-ghi789...
SignState: ss-jkl012...

【请求头】
Referer: https://signin.aws.amazon.com/platform/...

【Cookie数量】
15 个

【分析建议】
1. 检查代理IP是否被标记
2. 检查指纹是否异常
3. 检查请求频率是否过高
4. 分析验证码类型和难度
5. 考虑更换代理或调整指纹

【下一步】
- 使用 captcha_*_response.json 分析完整响应结构
- 检查 captchaURL 获取验证码图片
- 研究 captchaToken 的生成和使用方式
- 尝试不同的OCR配置或第三方验证码服务
```

---

## 🚀 后续步骤

### 1. 收集数据
运行多次任务，收集足够的验证码样本（建议 10+ 个）

### 2. 分析规律
对比多个日志文件，寻找共性：
- 是否特定代理更容易触发？
- 是否特定指纹被标记？
- 是否有时间段规律？

### 3. 调整策略
根据分析结果调整：
- **代理策略**: 更换质量更好的代理，增加冷却时间
- **指纹策略**: 使用更常见的硬件配置
- **频率策略**: 降低并发数，增加间隔

### 4. 开发解决方案
根据验证码类型选择方案：
- **文本验证码**: 优化 OCR 或接入第三方服务
- **图片验证码**: 接入第三方识别服务
- **复杂验证**: 考虑浏览器自动化

---

## 📖 相关文档

- **[人机验证分析指南](docs/CAPTCHA_ANALYSIS.md)** - 详细的分析步骤和工具
- **[故障点分析](docs/POTENTIAL_FAILURE_POINTS.md)** - 包含验证码相关的问题分析
- **[快速参考](docs/QUICK_REFERENCE.md)** - 常用命令和配置建议

---

## ⚙️ 配置选项

### 禁用验证码保存
如果不需要保存验证码信息，可以注释代码：

在 `internal/core/signup_password.go` 中：
```go
// 注释这几行
// if err := r.saveCaptchaInfo(captchaResp, data, body, ref); err != nil {
//     log.Printf("[12] 警告: 保存验证码信息失败: %v", err)
// }
```

### 自定义保存目录
修改 `saveCaptchaInfo()` 函数中的目录：
```go
captchaDir := "自定义路径/captcha_logs"
```

### 保存更多信息
在 `captchaInfo` map 中添加更多字段：
```go
captchaInfo["custom_field"] = "custom_value"
```

---

## 🔐 隐私说明

### 敏感信息
验证码日志包含以下敏感信息：
- 邮箱地址
- 代理地址
- Cookie 信息
- 工作流状态

### 安全建议
1. 不要公开分享完整日志
2. 分析时注意脱敏处理
3. 定期清理旧日志
4. 日志已自动加入 `.gitignore`

### 清理日志
```powershell
# 清理 7 天前的日志
Get-ChildItem data\captcha_logs\ | 
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) } | 
    Remove-Item -Force
```

---

## 💡 最佳实践

### 1. 及时分析
遇到验证码后立即查看分析报告，趁热打铁

### 2. 建立知识库
将分析结果记录成文档，积累经验

### 3. 对比测试
调整策略后对比验证码触发率的变化

### 4. 持续优化
根据数据反馈不断改进指纹和行为模拟

---

## 📞 技术支持

如果需要帮助分析验证码日志：
1. 查看 `*_analysis.txt` 文件
2. 阅读 [人机验证分析指南](docs/CAPTCHA_ANALYSIS.md)
3. 收集多个样本进行对比
4. 根据规律调整配置

---

**功能版本**: v2.0-optimized  
**更新日期**: 2026-08-22  
**状态**: ✅ 已实现并测试
