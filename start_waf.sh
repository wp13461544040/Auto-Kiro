#!/bin/bash

# KiroX WAF 服务启动脚本 (macOS/Linux)

echo "🚀 启动 KiroX WAF 服务..."

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "⚠️  未找到 node_modules,正在安装依赖..."
    npm install express body-parser fingerprint-generator fingerprint-injector puppeteer axios
fi

# 启动服务
echo "📡 启动服务 (后台运行)..."
nohup node waf_server_fingerprint.js > waf_server.log 2>&1 &
WAF_PID=$!

echo "✅ WAF 服务已启动!"
echo ""
echo "📍 服务地址: http://localhost:8888"
echo "📝 进程 PID: $WAF_PID"
echo "📄 日志文件: waf_server.log"
echo ""
echo "💡 常用命令:"
echo "  查看日志: tail -f waf_server.log"
echo "  停止服务: kill $WAF_PID"
echo "  查看进程: ps aux | grep waf_server"
echo ""
