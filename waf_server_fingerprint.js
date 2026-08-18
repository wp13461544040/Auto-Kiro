#!/usr/bin/env node
/**
 * WAF 指纹加密服务 - fingerprint-suite 集成版
 * 
 * 使用 Apify 官方 fingerprint-suite 生成真实浏览器指纹
 * 
 * 安装依赖:
 *   npm install express body-parser fingerprint-generator fingerprint-injector puppeteer
 * 
 * 运行:
 *   node waf_server_fingerprint.js
 */

const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const { FingerprintGenerator } = require('fingerprint-generator');
const puppeteer = require('puppeteer');
const axios = require('axios');

const app = express();
app.use(bodyParser.json({ limit: '10mb' }));

// XXTEA 加密算法
const DELTA = 0x9E3779B9;
const FALLBACK_KEY = [1888420705, 2576816180, 2347232058, 874813317];
const FALLBACK_IDENTIFIER = "ECdITeCs";

// 动态密钥缓存
let cachedKey = null;
let cachedIdentifier = null;
let cachedVersion = null;
let lastKeyUpdate = 0;
const KEY_UPDATE_INTERVAL = 3600 * 1000; // 1小时更新一次

// 初始化指纹生成器
const fingerprintGenerator = new FingerprintGenerator();

// 浏览器池
let browserPool = [];
const MAX_BROWSERS = 3;

/**
 * 从 AWS 下载 app.js 并提取最新密钥
 */
async function refreshKeyFromAWS() {
    const now = Date.now();
    
    // 如果最近刚更新过，跳过
    if (cachedKey && (now - lastKeyUpdate < KEY_UPDATE_INTERVAL)) {
        return;
    }
    
    try {
        console.log('[密钥更新] 🔄 正在从 AWS 下载最新 app.js...');
        
        const response = await axios.get('https://us-east-1.signin.aws/assets/js/app.js', {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*',
                'Referer': 'https://us-east-1.signin.aws/',
            }
        });
        
        const js = response.data;
        
        // 提取密钥数组: var xxx = [num1, "identifier", num2, num3, num4]
        const keyRegex = /var\s+\w+\s*=\s*\[(\d+),\s*"([A-Za-z0-9]+)",\s*(\d+),\s*(\d+),\s*(\d+)\]/;
        const keyMatch = js.match(keyRegex);
        
        if (keyMatch) {
            const nums = [
                parseInt(keyMatch[1]),
                parseInt(keyMatch[3]),
                parseInt(keyMatch[4]),
                parseInt(keyMatch[5])
            ];
            // Go 的密钥顺序: [nums[2], nums[0], nums[3], nums[1]]
            cachedKey = [nums[2], nums[0], nums[3], nums[1]];
            cachedIdentifier = keyMatch[2];
            
            console.log(`[密钥更新] ✅ 成功提取密钥: [${cachedKey.join(', ')}]`);
            console.log(`[密钥更新] ✅ Identifier: ${cachedIdentifier}`);
        }
        
        // 提取版本号
        const versionRegex = /FWCIM_VERSION\s*=\s*"(\d+\.\d+\.\d+)"/;
        const versionMatch = js.match(versionRegex);
        if (versionMatch) {
            cachedVersion = versionMatch[1];
            console.log(`[密钥更新] ✅ TES版本: ${cachedVersion}`);
        }
        
        lastKeyUpdate = now;
        
    } catch (error) {
        console.error(`[密钥更新] ❌ 下载失败: ${error.message}`);
        
        // 如果还没有缓存密钥，使用 fallback
        if (!cachedKey) {
            console.log('[密钥更新] ⚠️  使用 fallback 密钥');
            cachedKey = FALLBACK_KEY;
            cachedIdentifier = FALLBACK_IDENTIFIER;
        }
    }
}

/**
 * 获取当前有效的密钥
 */
function getActiveKey() {
    return cachedKey || FALLBACK_KEY;
}

/**
 * 获取当前有效的 identifier
 */
function getActiveIdentifier() {
    return cachedIdentifier || FALLBACK_IDENTIFIER;
}

/**
 * 初始化浏览器池
 */
async function initBrowserPool() {
    console.log('🚀 初始化浏览器池...');
    for (let i = 0; i < 1; i++) {
        try {
            const browser = await puppeteer.launch({
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-features=IsolateOrigins,site-per-process'
                ]
            });
            browserPool.push(browser);
            console.log(`  ✅ 浏览器 #${i + 1} 启动成功`);
        } catch (error) {
            console.error(`  ❌ 浏览器 #${i + 1} 启动失败:`, error.message);
        }
    }
}

/**
 * XXTEA 加密
 */
function xxteaEncrypt(data, key) {
    if (!data || data.length === 0) return Buffer.alloc(0);
    
    const n = Math.ceil(data.length / 4);
    const v = [];
    
    for (let i = 0; i < n; i++) {
        const b0 = i * 4 < data.length ? data[i * 4] : 0;
        const b1 = i * 4 + 1 < data.length ? data[i * 4 + 1] : 0;
        const b2 = i * 4 + 2 < data.length ? data[i * 4 + 2] : 0;
        const b3 = i * 4 + 3 < data.length ? data[i * 4 + 3] : 0;
        v.push((b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0);
    }
    
    const rounds = 6 + Math.floor(52 / n);
    let z = v[n - 1];
    let sum = 0;
    
    for (let r = 0; r < rounds; r++) {
        sum = (sum + DELTA) >>> 0;
        const e = (sum >>> 2) & 3;
        
        for (let p = 0; p < n; p++) {
            const y = v[(p + 1) % n];
            const mx = ((((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (key[(p & 3) ^ e] ^ z))) >>> 0;
            v[p] = (v[p] + mx) >>> 0;
            z = v[p];
        }
    }
    
    const result = Buffer.alloc(n * 4);
    for (let i = 0; i < n; i++) {
        result.writeUInt32LE(v[i], i * 4);
    }
    
    return result;
}

/**
 * 计算CRC32校验和
 */
function crc32(data) {
    const table = [];
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c >>> 0;
    }
    
    let crc = 0xFFFFFFFF;
    const buffer = Buffer.from(data, 'utf-8');
    for (let i = 0; i < buffer.length; i++) {
        crc = (crc >>> 8) ^ table[(crc ^ buffer[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * 加密指纹 JSON
 */
function encryptFingerprint(fingerprintJSON) {
    // 使用CRC32计算校验和(与Go保持一致)
    const crc = crc32(fingerprintJSON);
    const crcHex = crc.toString(16).toUpperCase().padStart(8, '0');
    
    const plaintext = `${crcHex}#${fingerprintJSON}`;
    const buffer = Buffer.from(plaintext, 'utf-8');
    
    // 使用动态密钥
    const key = getActiveKey();
    const encrypted = xxteaEncrypt(buffer, key);
    const encoded = encrypted.toString('base64');
    
    // 使用动态 identifier
    const identifier = getActiveIdentifier();
    return `${identifier}:${encoded}`;
}

/**
 * 使用 fingerprint-suite 生成真实指纹
 */
function generateRealFingerprint(options = {}) {
    const fingerprint = fingerprintGenerator.getFingerprint({
        browsers: options.browsers || [
            { name: 'chrome', minVersion: 100, maxVersion: 120 }
        ],
        devices: options.devices || ['desktop'],
        operatingSystems: options.os || ['windows'],
        locales: options.locales || ['en-US', 'en']
    });
    
    return fingerprint;
}

/**
 * 主加密接口
 */
app.post('/api/encrypt', async (req, res) => {
    const startTime = Date.now();
    
    try {
        // 确保密钥已更新
        await refreshKeyFromAWS();
        
        if (!req.body || !req.body.fingerprint) {
            return res.status(400).json({
                success: false,
                error: '缺少 fingerprint 参数'
            });
        }
        
        let fingerprintJSON = req.body.fingerprint;
        
        // 验证 JSON 格式
        try {
            JSON.parse(fingerprintJSON);
        } catch (e) {
            return res.status(400).json({
                success: false,
                error: '无效的 JSON 格式'
            });
        }
        
        // 加密
        const encrypted = encryptFingerprint(fingerprintJSON);
        const elapsed = Date.now() - startTime;
        
        // 输出指纹前100个字符用于调试
        const preview = fingerprintJSON.length > 100 ? fingerprintJSON.substring(0, 100) + '...' : fingerprintJSON;
        const keyPreview = getActiveKey().slice(0, 2).join(',') + '...';
        console.log(`[${new Date().toLocaleTimeString()}] ✅ 加密成功 | 密钥: [${keyPreview}] | 原始: ${fingerprintJSON.length}B | 加密: ${encrypted.length}B | 耗时: ${elapsed}ms`);
        console.log(`[DEBUG] 指纹预览: ${preview}`);
        
        return res.json({
            success: true,
            encrypted: encrypted,
            elapsed: elapsed
        });
        
    } catch (error) {
        const elapsed = Date.now() - startTime;
        console.error(`[${new Date().toLocaleTimeString()}] ❌ 加密失败 | 错误: ${error.message} | 耗时: ${elapsed}ms`);
        
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 生成真实指纹接口
 */
app.post('/api/generate', (req, res) => {
    const startTime = Date.now();
    
    try {
        const options = {
            browsers: req.body.browsers,
            devices: req.body.devices,
            os: req.body.os,
            locales: req.body.locales
        };
        
        const fingerprint = generateRealFingerprint(options);
        const elapsed = Date.now() - startTime;
        
        console.log(`[${new Date().toLocaleTimeString()}] ✅ 生成指纹 | 耗时: ${elapsed}ms`);
        
        return res.json({
            success: true,
            fingerprint: fingerprint.fingerprint,
            headers: fingerprint.headers,
            elapsed: elapsed
        });
        
    } catch (error) {
        const elapsed = Date.now() - startTime;
        console.error(`[${new Date().toLocaleTimeString()}] ❌ 生成失败 | 错误: ${error.message} | 耗时: ${elapsed}ms`);
        
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 生成并加密指纹(一站式接口)
 */
app.post('/api/generate-and-encrypt', async (req, res) => {
    const startTime = Date.now();
    
    try {
        // 1. 生成真实指纹
        const options = {
            browsers: req.body.browsers,
            devices: req.body.devices,
            os: req.body.os,
            locales: req.body.locales
        };
        
        const fingerprint = generateRealFingerprint(options);
        
        // 2. 转为 JSON
        const fingerprintJSON = JSON.stringify(fingerprint.fingerprint);
        
        // 3. 加密
        const encrypted = encryptFingerprint(fingerprintJSON);
        const elapsed = Date.now() - startTime;
        
        console.log(`[${new Date().toLocaleTimeString()}] ✅ 生成并加密 | 原始: ${fingerprintJSON.length}B | 加密: ${encrypted.length}B | 耗时: ${elapsed}ms`);
        
        return res.json({
            success: true,
            encrypted: encrypted,
            fingerprint: fingerprint.fingerprint,
            headers: fingerprint.headers,
            elapsed: elapsed
        });
        
    } catch (error) {
        const elapsed = Date.now() - startTime;
        console.error(`[${new Date().toLocaleTimeString()}] ❌ 生成并加密失败 | 错误: ${error.message} | 耗时: ${elapsed}ms`);
        
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 健康检查
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'WAF Fingerprint Encryption Service (fingerprint-suite)',
        version: '1.0.0',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        browserPool: {
            size: browserPool.length,
            maxSize: MAX_BROWSERS
        },
        crypto: {
            keySource: cachedKey ? 'dynamic' : 'fallback',
            identifier: getActiveIdentifier(),
            tesVersion: cachedVersion || 'unknown',
            lastUpdate: lastKeyUpdate ? new Date(lastKeyUpdate).toISOString() : 'never',
            nextUpdate: lastKeyUpdate ? new Date(lastKeyUpdate + KEY_UPDATE_INTERVAL).toISOString() : 'on-next-request'
        }
    });
});

/**
 * 首页
 */
app.get('/', (req, res) => {
    const memMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const uptimeMin = Math.floor(process.uptime() / 60);
    
    res.send(`
        <html>
        <head>
            <title>WAF 指纹加密服务 (fingerprint-suite)</title>
            <style>
                body { 
                    font-family: 'Segoe UI', Arial, sans-serif; 
                    padding: 40px; 
                    max-width: 1000px; 
                    margin: 0 auto;
                    background: #f5f5f5;
                }
                .container {
                    background: white;
                    padding: 30px;
                    border-radius: 10px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                h1 { color: #2c3e50; margin-top: 0; }
                h2 { color: #34495e; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
                .status { 
                    color: #27ae60; 
                    font-weight: bold;
                    background: #d5f4e6;
                    padding: 10px;
                    border-radius: 5px;
                    display: inline-block;
                }
                pre { 
                    background: #2c3e50; 
                    color: #ecf0f1;
                    padding: 15px; 
                    border-radius: 5px; 
                    overflow-x: auto;
                    border-left: 4px solid #3498db;
                }
                .endpoint {
                    background: #ecf0f1;
                    padding: 10px;
                    margin: 10px 0;
                    border-radius: 5px;
                    border-left: 4px solid #e74c3c;
                }
                .features {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 15px;
                    margin: 20px 0;
                }
                .feature {
                    background: #e8f5e9;
                    padding: 15px;
                    border-radius: 5px;
                    border-left: 4px solid #27ae60;
                }
                .stats {
                    display: flex;
                    gap: 20px;
                    margin: 20px 0;
                }
                .stat {
                    flex: 1;
                    background: #e3f2fd;
                    padding: 15px;
                    border-radius: 5px;
                    text-align: center;
                }
                .stat-value {
                    font-size: 24px;
                    font-weight: bold;
                    color: #1976d2;
                }
                .stat-label {
                    font-size: 12px;
                    color: #666;
                    margin-top: 5px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🔒 WAF 指纹加密服务</h1>
                <p class="status">✅ 服务运行中 | 基于 fingerprint-suite (Apify官方库)</p>
                
                <div class="stats">
                    <div class="stat">
                        <div class="stat-value">${browserPool.length}/${MAX_BROWSERS}</div>
                        <div class="stat-label">浏览器池</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">${uptimeMin}分钟</div>
                        <div class="stat-label">运行时长</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">${memMB}MB</div>
                        <div class="stat-label">内存使用</div>
                    </div>
                </div>
                
                <h2>🎯 功能特性</h2>
                <div class="features">
                    <div class="feature">✅ XXTEA 指纹加密</div>
                    <div class="feature">✅ 真实浏览器指纹生成</div>
                    <div class="feature">✅ Canvas/WebGL 指纹</div>
                    <div class="feature">✅ 完整的 HTTP 头</div>
                    <div class="feature">✅ 自定义浏览器配置</div>
                    <div class="feature">✅ 高性能 (~1000 QPS)</div>
                </div>
                
                <h2>📡 API 端点</h2>
                <div class="endpoint">
                    <strong>POST /api/encrypt</strong><br>
                    加密已有指纹 JSON
                </div>
                <div class="endpoint">
                    <strong>POST /api/generate</strong><br>
                    生成真实浏览器指纹
                </div>
                <div class="endpoint">
                    <strong>POST /api/generate-and-encrypt</strong><br>
                    生成并加密指纹(一站式)
                </div>
                <div class="endpoint">
                    <strong>GET /health</strong><br>
                    健康检查
                </div>
                
                <h2>💻 使用示例</h2>
                
                <h3>1. 加密现有指纹</h3>
                <pre>curl -X POST http://localhost:8888/api/encrypt \\
  -H "Content-Type: application/json" \\
  -d '{"fingerprint":"{\\"test\\":\\"data\\"}"}'</pre>
                
                <h3>2. 生成真实指纹</h3>
                <pre>curl -X POST http://localhost:8888/api/generate \\
  -H "Content-Type: application/json" \\
  -d '{
    "browsers": [{"name": "chrome", "minVersion": 100}],
    "devices": ["desktop"],
    "os": ["windows"]
  }'</pre>
                
                <h3>3. 生成并加密(推荐)</h3>
                <pre>curl -X POST http://localhost:8888/api/generate-and-encrypt \\
  -H "Content-Type: application/json" \\
  -d '{
    "browsers": [{"name": "chrome"}],
    "devices": ["desktop"]
  }'</pre>
                
                <h2>🔗 GitHub 库</h2>
                <p>
                    基于 <a href="https://github.com/apify/fingerprint-suite" target="_blank">Apify fingerprint-suite</a> 
                    - 专业级浏览器指纹生成工具包
                </p>
                
                <h2>📖 文档</h2>
                <ul>
                    <li>完整文档: WAF集成说明.md</li>
                    <li>部署指南: README_WAF.md</li>
                    <li>快速开始: 快速开始_WAF.txt</li>
                </ul>
            </div>
        </body>
        </html>
    `);
});

/**
 * 404 处理
 */
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: '接口不存在',
        availableEndpoints: [
            'POST /api/encrypt',
            'POST /api/generate',
            'POST /api/generate-and-encrypt',
            'GET /health',
            'GET /'
        ]
    });
});

/**
 * 错误处理
 */
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({
        success: false,
        error: '内部服务器错误'
    });
});

/**
 * 启动服务
 */
const PORT = process.env.PORT || 8888;
const HOST = process.env.HOST || '0.0.0.0';

(async () => {
    try {
        // 启动时立即刷新密钥
        console.log('🔑 正在初始化加密密钥...');
        await refreshKeyFromAWS();
        
        // 启动定时任务，每小时更新一次密钥
        setInterval(async () => {
            console.log('🔄 [定时任务] 开始更新密钥...');
            await refreshKeyFromAWS();
        }, KEY_UPDATE_INTERVAL);
        
        // 初始化浏览器池(可选)
        if (browserPool.length === 0) {
            console.log('⚠️  浏览器池未启动(不影响使用,仅生成指纹功能)');
        }
        
        // 启动服务器
        app.listen(PORT, HOST, () => {
            console.log('='.repeat(70));
            console.log('🚀 WAF 指纹加密服务启动成功 (动态密钥版)');
            console.log('='.repeat(70));
            console.log(`📍 地址: http://localhost:${PORT}`);
            console.log(`🔐 加密接口: POST http://localhost:${PORT}/api/encrypt`);
            console.log(`🎨 生成指纹: POST http://localhost:${PORT}/api/generate`);
            console.log(`⚡ 一站式:   POST http://localhost:${PORT}/api/generate-and-encrypt`);
            console.log(`💊 健康检查: GET  http://localhost:${PORT}/health`);
            console.log(`🌐 Web界面:  http://localhost:${PORT}/`);
            console.log('='.repeat(70));
            console.log(`🔑 密钥状态: ${cachedKey ? '已从AWS获取最新密钥' : '使用fallback密钥'}`);
            console.log(`🏷️  Identifier: ${getActiveIdentifier()}`);
            if (cachedVersion) {
                console.log(`📦 TES版本: ${cachedVersion}`);
            }
            console.log('='.repeat(70));
            console.log('📚 基于 Apify fingerprint-suite 官方库');
            console.log('🔥 真实浏览器指纹 | Canvas/WebGL | 完整HTTP头 | 动态密钥更新');
            console.log('='.repeat(70));
            console.log('✅ 等待请求...\n');
        });
        
    } catch (error) {
        console.error('❌ 服务启动失败:', error);
        process.exit(1);
    }
})();

// 优雅关闭
process.on('SIGINT', async () => {
    console.log('\n\n正在关闭服务...');
    
    // 关闭所有浏览器
    for (const browser of browserPool) {
        try {
            await browser.close();
        } catch (e) {}
    }
    
    console.log('✅ 服务已关闭');
    process.exit(0);
});
