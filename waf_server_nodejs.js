#!/usr/bin/env node
/**
 * WAF 指纹加密服务 - Node.js 版本(使用真实浏览器指纹库)
 * 
 * 基于 fingerprint-injector 和 puppeteer 实现
 * 
 * 安装依赖:
 *   npm init -y
 *   npm install express puppeteer fingerprint-injector fingerprint-generator body-parser
 * 
 * 运行:
 *   node waf_server_nodejs.js
 * 
 * API:
 *   POST http://localhost:8888/api/encrypt
 */

const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');

const app = express();
app.use(bodyParser.json({ limit: '10mb' }));

// XXTEA 加密算法(与 Go 端保持一致)
const DELTA = 0x9E3779B9;
const DEFAULT_KEY = [1888420705, 2576816180, 2347232058, 874813317];
const IDENTIFIER = "ECdITeCs";

/**
 * XXTEA 加密
 */
function xxteaEncrypt(data, key) {
    if (!data || data.length === 0) return Buffer.alloc(0);
    
    // 转为 uint32 数组
    const n = Math.ceil(data.length / 4);
    const v = [];
    
    for (let i = 0; i < n; i++) {
        const b0 = i * 4 < data.length ? data[i * 4] : 0;
        const b1 = i * 4 + 1 < data.length ? data[i * 4 + 1] : 0;
        const b2 = i * 4 + 2 < data.length ? data[i * 4 + 2] : 0;
        const b3 = i * 4 + 3 < data.length ? data[i * 4 + 3] : 0;
        v.push((b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0);
    }
    
    // 加密
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
    
    // 转回 Buffer
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
    try {
        // 计算 CRC32 校验和(简化版,使用 MD5 前8位)
        const hash = crypto.createHash('md5');
        hash.update(fingerprintJSON);
        const crc = hash.digest('hex').substring(0, 8).toUpperCase();
        
        // 构造明文: CRC#JSON
        const plaintext = `${crc}#${fingerprintJSON}`;
        const buffer = Buffer.from(plaintext, 'utf-8');
        
        // XXTEA 加密
        const encrypted = xxteaEncrypt(buffer, DEFAULT_KEY);
        
        // Base64 编码
        const encoded = encrypted.toString('base64');
        
        // 返回格式: IDENTIFIER:BASE64
        return `${IDENTIFIER}:${encoded}`;
    } catch (error) {
        throw new Error(`加密失败: ${error.message}`);
    }
}

/**
 * 主加密接口
 */
app.post('/api/encrypt', (req, res) => {
    const startTime = Date.now();
    
    try {
        // 验证请求
        if (!req.body || !req.body.fingerprint) {
            return res.status(400).json({
                success: false,
                error: '缺少 fingerprint 参数'
            });
        }
        
        const fingerprintJSON = req.body.fingerprint;
        
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
        
        console.log(`[${new Date().toLocaleTimeString()}] 加密成功 | 原始: ${fingerprintJSON.length}B | 加密: ${encrypted.length}B | 耗时: ${elapsed}ms`);
        
        return res.json({
            success: true,
            encrypted: encrypted
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
 * 健康检查
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'WAF Fingerprint Encryption Service (Node.js)',
        version: '1.0.0',
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

/**
 * 首页
 */
app.get('/', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>WAF 指纹加密服务</title>
            <style>
                body { font-family: monospace; padding: 40px; max-width: 800px; margin: 0 auto; }
                h1 { color: #333; }
                pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
                .status { color: green; font-weight: bold; }
            </style>
        </head>
        <body>
            <h1>🔒 WAF 指纹加密服务 (Node.js)</h1>
            <p class="status">✅ 服务运行中</p>
            
            <h2>API 端点</h2>
            <ul>
                <li>POST /api/encrypt - 加密指纹</li>
                <li>GET /health - 健康检查</li>
            </ul>
            
            <h2>测试示例</h2>
            <pre>curl -X POST http://localhost:8888/api/encrypt \\
  -H "Content-Type: application/json" \\
  -d '{"fingerprint":"{\\"test\\":\\"data\\",\\"timestamp\\":1234567890}"}'</pre>
            
            <h2>Node.js 客户端示例</h2>
            <pre>const axios = require('axios');

const fingerprint = JSON.stringify({
    metrics: {},
    start: Date.now(),
    interaction: {},
    // ... 完整指纹数据
});

const response = await axios.post('http://localhost:8888/api/encrypt', {
    fingerprint: fingerprint
});

console.log(response.data.encrypted);</pre>
            
            <h2>性能统计</h2>
            <ul>
                <li>运行时长: ${Math.floor(process.uptime())}s</li>
                <li>内存使用: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB</li>
            </ul>
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

app.listen(PORT, HOST, () => {
    console.log('='.repeat(60));
    console.log('🚀 WAF 指纹加密服务启动成功 (Node.js)');
    console.log('='.repeat(60));
    console.log(`地址: http://localhost:${PORT}`);
    console.log(`API: POST http://localhost:${PORT}/api/encrypt`);
    console.log(`健康检查: GET http://localhost:${PORT}/health`);
    console.log('='.repeat(60));
    console.log('等待请求...\n');
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n\n正在关闭服务...');
    process.exit(0);
});
