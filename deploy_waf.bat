@echo off
chcp 65001 >nul
echo ============================================================
echo     KiroX WAF 服务一键部署脚本
echo     破甲鸟出品 🔥
echo ============================================================
echo.

REM 检查 Node.js
echo [1/4] 检查 Node.js 环境...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 未安装 Node.js!
    echo.
    echo 请先安装 Node.js:
    echo   下载地址: https://nodejs.org/
    echo   推荐版本: LTS 16.x 或更高
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✅ Node.js 已安装: %NODE_VERSION%
echo.

REM 检查 npm
echo [2/4] 检查 npm...
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm 未找到!
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo ✅ npm 已安装: %NPM_VERSION%
echo.

REM 安装依赖
echo [3/4] 安装依赖...
echo 这可能需要几分钟,请耐心等待...
echo.

npm install express body-parser fingerprint-generator fingerprint-injector puppeteer axios

if %errorlevel% neq 0 (
    echo ❌ 依赖安装失败!
    echo.
    echo 尝试解决方案:
    echo   1. 删除 node_modules 文件夹
    echo   2. 删除 package-lock.json
    echo   3. 重新运行此脚本
    echo.
    pause
    exit /b 1
)

echo ✅ 依赖安装成功!
echo.

REM 测试服务
echo [4/4] 测试服务...
echo.
echo 正在启动 WAF 服务(测试模式)...
echo 按 Ctrl+C 可以停止服务
echo.

timeout /t 2 /nobreak >nul

start "WAF Server" cmd /k "node waf_server_fingerprint.js"

echo 等待服务启动...
timeout /t 5 /nobreak >nul

REM 运行测试
node test_waf.js

echo.
echo ============================================================
echo 🎉 部署完成!
echo ============================================================
echo.
echo 📍 服务地址: http://localhost:8888
echo 📖 Web界面: http://localhost:8888/
echo.
echo 💡 下一步:
echo   1. 服务已在后台运行(新窗口)
echo   2. 配置 KiroX 客户端 WAF 设置:
echo      {
echo          "enabled": true,
echo          "baseUrl": "http://localhost:8888",
echo          "apiKey": "",
echo          "timeout": 10
echo      }
echo   3. 启动注册任务测试
echo.
echo 📚 文档:
echo   - WAF集成说明.md
echo   - README_WAF.md
echo   - 快速开始_WAF.txt
echo.
echo ============================================================
pause
