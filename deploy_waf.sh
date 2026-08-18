#!/bin/bash

# KiroX WAF 服务一键部署脚本 (macOS/Linux)
# 破甲鸟出品 🔥

set -e

echo "============================================================"
echo "    KiroX WAF 服务一键部署脚本"
echo "    破甲鸟出品 🔥"
echo "============================================================"
echo ""

# 检查 Node.js
echo "[1/4] 检查 Node.js 环境..."
if ! command -v node &> /dev/null; then
    echo "❌ 未安装 Node.js!"
    echo ""
    echo "请先安装 Node.js:"
    echo "  macOS: brew install node"
    echo "  Linux: sudo apt-get install nodejs npm"
    echo "  或访问: https://nodejs.org/"
    echo ""
    exit 1
fi

NODE_VERSION=$(node --version)
echo "✅ Node.js 已安装: $NODE_VERSION"
echo ""

# 检查 npm
echo "[2/4] 检查 npm..."
if ! command -v npm &> /dev/null; then
    echo "❌ npm 未找到!"
    exit 1
fi

NPM_VERSION=$(npm --version)
echo "✅ npm 已安装: $NPM_VERSION"
echo ""

# 安装依赖
echo "[3/4] 安装依赖..."
echo "这可能需要几分钟,请耐心等待..."
echo ""

npm install express body-parser fingerprint-generator fingerprint-injector puppeteer axios

if [ $? -ne 0 ]; then
    echo "❌ 依赖安装失败!"
    echo ""
    echo "尝试解决方案:"
    echo "  1. 删除 node_modules 文件夹"
    echo "  2. 删除 package-lock.json"
    echo "  3. 重新运行此脚本"
    echo ""
    exit 1
fi

echo "✅ 依赖安装成功!"
echo ""

# 测试服务
echo "[4/4] 测试服务..."
echo ""
echo "正在启动 WAF 服务(测试模式)..."
echo "按 Ctrl+C 可以停止服务"
echo ""

sleep 2

# 后台启动服务
nohup node waf_server_fingerprint.js > waf_server.log 2>&1 &
WAF_PID=$!
echo "WAF 服务已启动 (PID: $WAF_PID)"

echo "等待服务启动..."
sleep 5

# 运行测试
node test_waf.js

echo ""
echo "============================================================"
echo "🎉 部署完成!"
echo "============================================================"
echo ""
echo "📍 服务地址: http://localhost:8888"
echo "📖 Web界面: http://localhost:8888/"
echo ""
echo "💡 下一步:"
echo "  1. 服务已在后台运行 (PID: $WAF_PID)"
echo "  2. 日志文件: waf_server.log"
echo "  3. 停止服务: kill $WAF_PID"
echo "  4. 配置 KiroX 客户端 WAF 设置:"
echo "     {"
echo "         \"enabled\": true,"
echo "         \"baseUrl\": \"http://localhost:8888\","
echo "         \"apiKey\": \"\","
echo "         \"timeout\": 10"
echo "     }"
echo "  5. 启动注册任务测试"
echo ""
echo "📚 常用命令:"
echo "  查看日志: tail -f waf_server.log"
echo "  停止服务: kill $WAF_PID"
echo "  重启服务: ./deploy_waf.sh"
echo ""
echo "============================================================"
