#!/bin/bash

# KiroX WAF 服务停止脚本 (macOS/Linux)

echo "🛑 停止 KiroX WAF 服务..."

# 查找并杀死进程
PIDS=$(pgrep -f "waf_server_fingerprint.js")

if [ -z "$PIDS" ]; then
    echo "⚠️  未找到运行中的 WAF 服务"
    exit 0
fi

echo "找到进程: $PIDS"
kill $PIDS

echo "✅ WAF 服务已停止"
echo ""
