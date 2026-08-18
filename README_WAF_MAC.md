# KiroX WAF 服务部署指南 (macOS/Linux)

## 快速开始

### 1. 安装 Node.js

**macOS (使用 Homebrew):**
```bash
brew install node
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install nodejs npm
```

### 2. 部署服务

```bash
# 进入项目目录
cd /path/to/kiroX

# 给脚本添加执行权限
chmod +x deploy_waf.sh start_waf.sh stop_waf.sh

# 运行部署脚本
./deploy_waf.sh
```

### 3. 日常使用

**启动服务:**
```bash
./start_waf.sh
```

**停止服务:**
```bash
./stop_waf.sh
```

**查看日志:**
```bash
tail -f waf_server.log
```

**查看实时日志:**
```bash
tail -f waf_server.log | grep -E 'POST|GET|encrypt'
```

## 配置客户端

在 KiroX 客户端配置 WAF 设置:

```json
{
    "enabled": true,
    "baseUrl": "http://localhost:8888",
    "apiKey": "",
    "timeout": 10
}
```

## 常见问题

### 端口被占用

如果 8888 端口被占用,修改 `waf_server_fingerprint.js`:

```javascript
const PORT = 9999; // 改成其他端口
```

### 查看运行状态

```bash
# 查看进程
ps aux | grep waf_server

# 查看端口
lsof -i :8888

# 测试服务
curl http://localhost:8888/health
```

### 重启服务

```bash
./stop_waf.sh
./start_waf.sh
```

### 卸载

```bash
# 停止服务
./stop_waf.sh

# 删除依赖
rm -rf node_modules package-lock.json

# 删除日志
rm -f waf_server.log
```

## 进阶配置

### 开机自启动 (macOS)

创建 LaunchAgent:

```bash
# 创建 plist 文件
cat > ~/Library/LaunchAgents/com.kirox.waf.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.kirox.waf</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/path/to/kiroX/waf_server_fingerprint.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/path/to/kiroX/waf_server.log</string>
    <key>StandardErrorPath</key>
    <string>/path/to/kiroX/waf_server.error.log</string>
</dict>
</plist>
EOF

# 加载服务
launchctl load ~/Library/LaunchAgents/com.kirox.waf.plist

# 卸载服务
# launchctl unload ~/Library/LaunchAgents/com.kirox.waf.plist
```

### 开机自启动 (Linux systemd)

创建服务文件:

```bash
sudo tee /etc/systemd/system/kirox-waf.service > /dev/null << 'EOF'
[Unit]
Description=KiroX WAF Service
After=network.target

[Service]
Type=simple
User=your_username
WorkingDirectory=/path/to/kiroX
ExecStart=/usr/bin/node waf_server_fingerprint.js
Restart=always
RestartSec=10
StandardOutput=append:/path/to/kiroX/waf_server.log
StandardError=append:/path/to/kiroX/waf_server.error.log

[Install]
WantedBy=multi-user.target
EOF

# 重载配置
sudo systemctl daemon-reload

# 启动服务
sudo systemctl start kirox-waf

# 设置开机自启
sudo systemctl enable kirox-waf

# 查看状态
sudo systemctl status kirox-waf

# 查看日志
sudo journalctl -u kirox-waf -f
```

## 性能优化

### 1. 增加浏览器池大小

编辑 `waf_server_fingerprint.js`:

```javascript
const MAX_BROWSERS = 5; // 默认是3,根据内存调整
```

### 2. 调整密钥更新间隔

```javascript
const KEY_UPDATE_INTERVAL = 7200 * 1000; // 2小时
```

### 3. 使用 PM2 管理进程

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start waf_server_fingerprint.js --name kirox-waf

# 查看状态
pm2 status

# 查看日志
pm2 logs kirox-waf

# 设置开机自启
pm2 startup
pm2 save

# 停止服务
pm2 stop kirox-waf
```

## 监控和调试

### 查看实时请求

```bash
tail -f waf_server.log | grep POST
```

### 测试加密

```bash
curl -X POST http://localhost:8888/encrypt \
  -H "Content-Type: application/json" \
  -d '{"text":"test"}'
```

### 健康检查

```bash
curl http://localhost:8888/health
```

## 技术支持

- 文档: README_WAF.md
- 测试: `node test_waf.js`
- 问题反馈: GitHub Issues
