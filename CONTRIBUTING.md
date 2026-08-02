# 贡献指南

感谢你对 Kiro 注册机的关注！欢迎提交 Issue 和 Pull Request。

## 提交 Issue

- **Bug 报告**：请描述复现步骤、期望行为、实际行为，并附上日志截图
- **功能建议**：请说明使用场景和预期效果
- 提交前请先搜索是否已有相同 Issue

## 提交 Pull Request

### 环境准备

```bash
# 依赖
# - Go 1.24+
# - Node.js 20+
# - Wails CLI: go install github.com/wailsapp/wails/v2/cmd/wails@latest

git clone https://github.com/wp13461544040/Auto-Kiro.git
cd Auto-Kiro
wails dev   # 启动开发模式
```

### 开发规范

- **Go**：遵循标准 `gofmt` 格式，提交前运行 `go vet ./...`
- **前端**：原生 JS，不引入 npm 依赖，修改后运行 `node frontend/build.js` 验证构建
- **提交信息**：使用中文或英文均可，格式 `type: 简短描述`，例如：
  - `fix: 修复 MoeMail 域名加载失败`
  - `feat: 添加代理池支持`
  - `docs: 更新 README`

### 分支规范

- `main` — 稳定发布分支，不直接推送
- 新功能请从 `main` 创建 `feat/xxx` 分支
- Bug 修复请创建 `fix/xxx` 分支

### PR 要求

1. 确保 `go build ./...` 无报错
2. 确保 `node frontend/build.js` 无报错
3. 简要描述改动内容和原因

## 行为准则

请保持友善和尊重，共同维护良好的开源社区氛围。
