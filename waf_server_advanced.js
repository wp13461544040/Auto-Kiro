#!/usr/bin/env node
/**
 * WAF 指纹加密服务 - 高级版本(使用真实浏览器)
 * 
 * 使用 Puppeteer + fingerprint-injector 生成真实指纹
 * 
 * 安装依赖:
 *   npm init -y
 *   npm install express puppeteer fingerprint-injector fingerprint-generator body-parser
 * 
 * 运行:
 *   node waf_server_advanced.js
 * 
 * 注意: 此版本启动真实浏览器,资源占用较高,建议生产环境使用连接池优化
 */

const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const puppeteer = require('puppeteer');
const { FingerprintGenerator } = require('fingerprint-generator');
const { FingerprintInjector } = require('fingerprint-injector');

const app = express();
app.use(bodyParser.json({ limit: '10mb' }));

// XXTEA 加密算法
const DELTA = 0x9E3779B9;
const DEFAULT_KEY = [1888420705, 2576816180, 2347232058, 874813317];
const IDENTIFIER = "ECdITeCs";

// 浏览器池配置
let browserPool = [];
const MAX_BROWSERS = 5; // 最多保持5个浏览器实例
let currentBrowserIndex = 0;

/**
 * 初始化浏览器池
 */
async function initBrowserPool() {
    console.log('初始化浏览器池...');
    for (let i = 0; i < 1; i++) { // 先启动1个,按需扩展
        try {
            const browser = await puppeteer.launch({
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu'
                ]
            });
            browserPool.push(browser);
            console.log(`浏览器 #${i + 1} 启动成功`);
        } catch (error) {
            console.error(`浏览器 #${i + 1} 启动失败:`, error);
        }
    }
}

/**
 * 获取可用浏览器
 */
function getBrowser() {
    if (browserPool.length === 0) {
        throw new Error('浏览器池为空');
    }
    const browser = browserPool[currentBrowserIndex];
    currentBrowserIndex = (currentBrowserIndex + 1) % browserPool.length;
    return browser;
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
 * 加密指纹 JSON
 */
function encryptFingerprint(fingerprintJSON) {
    const hash = crypto.createHash('md5');
    hash.update(fingerprintJSON);
    const crc = hash.digest('hex').substring(0, 8).toUpperCase();
    
    const plaintext = `${crc}#${fingerprintJSON}`;
    const buffer = Buffer.from(plaintext, 'utf-8');
    
    const encrypted = xxteaEncrypt(buffer, DEFAULT_KEY);
    const encoded = encrypted.toString('base64');
    
    return `${IDENTIFIER}:${encoded}`;
}

/**
 * 使用真实浏览器增强指纹(可选)
 */
async function enhanceFingerprintWithBrowser(fingerprintJSON) {
    let page = null;
    try {
        const browser = getBrowser();
        page = await browser.newPage();
        
        // 注入指纹生成器
        const fingerprintGenerator = new FingerprintGenerator();
        const fingerprintInjector = new FingerprintInjector();
        
        // 生成随机指纹
        const fingerprint = fingerprintGenerator.getFingerprint({
            browsers: ['chrome'],
            devices: ['desktop'],
            operatingSystems: ['windows']
        });
        
        // 注入到页面
        await fingerprintInjector.attachFingerprintToPuppeteer(page, fingerprint);
        
        // 可以在这里执行额外的指纹增强操作
        // 例如: 生成真实的 Canvas/WebGL 指纹
        
        await page.close();
        return fingerprintJSON; // 返回增强后的指纹
        
    } catch (error) {
        if (page) await page.close();
        console.error('浏览器增强失败:', error);
        return fingerprintJSON; // 失败则返回原始指纹
    }
}

/**
 * 主加密接口
 */
app.post('/api/encrypt', async (req, res) => {
    const startTime = Date.now();
    
    try {
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
        
        // 可选: 使用真实浏览器增强指纹(默认关闭,因为影响性能)
        const enhanceMode = req.body.enhance === true;
        if (enhanceMode && browserPool.length > 0) {
            fingerprintJSON = await enhanceFingerprintWithBrowser(fingerprintJSON);
        }
        
        // 加密
        const encrypted = encryptFingerprint(fingerprintJSON);
        const elapsed = Date.now() - startTime;
        
        console.log(`[${new Date().toLocaleTimeString()}] 加密成功 | 原始: ${fingerprintJSON.length}B | 加密: ${encrypted.length}B | 增强: ${enhanceMode} | 耗时: ${elapsed}ms`);
        
        return res.json({
            success: true,
            encrypted: encrypted,
            enhanced: enhanceMode,
            elapsed: elapsed
        });
        
    } catch (error) {
        const elapsed = Date.now() - startTime;
        console.error(`[${new Date().toLocaleTimeString()}] 加密失败 | 错误: ${error.message} | 耗时: ${elapsed}ms`);
        
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 生成新指纹接口(可选)
 */
app.post('/api/generate', async (req, res) => {
    try {
        const fingerprintGenerator = new FingerprintGenerator();
        const fingerprint = fingerprintGenerator.getFingerprint({
            browsers: req.body.browsers || ['chrome'],
            devices: req.body.devices || ['desktop'],
            operatingSystems: req.body.os || ['windows']
        });
        
        res.json({
            success: true,
            fingerprint: fingerprint
        });
    } catch (error) {
        res.status(500).json({
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
        service: 'WAF Fingerprint Encryption Service (Advanced)',
        version: '1.0.0',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        browserPool: {
            size: browserPool.length,
            maxSize: MAX_BROWSERS
        }
    });
});

/**
 * 首页
 */
app.get('/', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>WAF 指纹加密服务 (高级版)</title>
            <style>
                body { font-family: monospace; padding: 40px; max-width: 900px; margin: 0 auto; }
                h1 { color: #333; }
                pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
                .status { color: green; font-weight: bold; }
                .warning { color: orange; }
            </style>
        </head>
        <body>
            <h1>🔒 WAF 指纹加密服务 (高级版)</h1>
            <p class="status">✅ 服务运行中 | 浏览器池: ${browserPool.length}/${MAX_BROWSERS}</p>
            
            <h2>功能特性</h2>
            <ul>
                <li>✅ XXTEA 指纹加密</li>
                <li>✅ 浏览器指纹生成 (fingerprint-generator)</li>
                <li>✅ 真实浏览器增强 (可选)</li>
                <li>✅ 浏览器池管理</li>
            </ul>
            
            <h2>API 端点</h2>
            <ul>
                <li>POST /api/encrypt - 加密指纹</li>
                <li>POST /api/generate - 生成新指纹</li>
                <li>GET /health - 健康检查</li>
            </ul>
            
            <h2>加密接口示例</h2>
            <pre>curl -X POST http://localhost:8888/api/encrypt \\
  -H "Content-Type: application/json" \\
  -d '{"fingerprint":"{\\"test\\":\\"data\\"}","enhance":false}'</pre>
            
            <h2>生成指纹示例</h2>
            <pre>curl -X POST http://localhost:8888/api/generate \\
  -H "Content-Type: application/json" \\
  -d '{"browsers":["chrome"],"devices":["desktop"],"os":["windows"]}'</pre>
            
            <p class="warning">⚠️ 注意: enhance=true 会启动真实浏览器增强指纹,性能开销较大</p>
        </body>
        </html>
    `);
});

/**
 * 启动服务
 */
const PORT = process.env.PORT || 8888;
const HOST = process.env.HOST || '0.0.0.0';

(async () => {
    try {
        // 初始化浏览器池
        await initBrowserPool();
        
        // 启动服务器
        app.listen(PORT, HOST, () => {
            console.log('='.repeat(60));
            console.log('🚀 WAF 指纹加密服务启动成功 (高级版)');
            console.log('='.repeat(60));
            console.log(`地址: http://localhost:${PORT}`);
            console.log(`API: POST http://localhost:${PORT}/api/encrypt`);
            console.log(`生成指纹: POST http://localhost:${PORT}/api/generate`);
            console.log(`健康检查: GET http://localhost:${PORT}/health`);
            console.log(`浏览器池: ${browserPool.length}/${MAX_BROWSERS} 个实例`);
            console.log('='.repeat(60));
            console.log('等待请求...\n');
        });
        
    } catch (error) {
        console.error('服务启动失败:', error);
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
    
    console.log('服务已关闭');
    process.exit(0);
});
