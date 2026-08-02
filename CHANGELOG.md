# Changelog

所有版本的变更记录。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [v1.0.0] - 2026-06-01

### 初始版本

- 完整的 15 步 AWS Builder ID 自动注册（OIDC 注册 → 设备授权 → 邮箱验证 → 密码设置 → SSO → Kiro Token 交换）
- 注册完成后自动验证账号存活状态
- 支持批量注册，可配置数量、并发数和任务间隔
- 支持多种邮箱源：Outlook 邮箱池、MoeMail 临时邮箱、MailNest 临时邮箱、Cloud-Mail 自部署邮箱
- 浏览器指纹模拟：随机化 Chrome 版本、设备指纹、WebGL/Canvas 伪造
- TLS 指纹模拟
- 全局代理支持（HTTP / HTTPS / SOCKS5）
- 多代理池支持（带权重配置）
- 注册结果 JSON 输出
- 实时日志、概览仪表盘
- 自动更新功能
- 多语言支持（中文/英文/日文）
- 深色/浅色主题
