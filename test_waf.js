#!/usr/bin/env node
/**
 * WAF 服务测试脚本
 * 
 * 测试所有 WAF 服务端点
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:8888';

// 颜色输出
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
    log(`✅ ${message}`, 'green');
}

function logError(message) {
    log(`❌ ${message}`, 'red');
}

function logInfo(message) {
    log(`ℹ️  ${message}`, 'cyan');
}

function logTest(message) {
    log(`\n🧪 ${message}`, 'yellow');
}

/**
 * 测试健康检查
 */
async function testHealth() {
    logTest('测试 1: 健康检查 (GET /health)');
    
    try {
        const response = await axios.get(`${BASE_URL}/health`);
        
        if (response.data.status === 'ok') {
            logSuccess('服务运行正常');
            logInfo(`  运行时长: ${Math.floor(response.data.uptime)}秒`);
            logInfo(`  内存使用: ${Math.round(response.data.memory.heapUsed / 1024 / 1024)}MB`);
            return true;
        } else {
            logError('服务状态异常');
            return false;
        }
    } catch (error) {
        logError(`健康检查失败: ${error.message}`);
        logError('请确认服务已启动: node waf_server_fingerprint.js');
        return false;
    }
}

/**
 * 测试加密接口
 */
async function testEncrypt() {
    logTest('测试 2: 加密接口 (POST /api/encrypt)');
    
    const testFingerprint = {
        metrics: { el: 0, script: 0 },
        start: Date.now(),
        interaction: { clicks: 0 },
        test: 'data'
    };
    
    try {
        const response = await axios.post(`${BASE_URL}/api/encrypt`, {
            fingerprint: JSON.stringify(testFingerprint)
        });
        
        if (response.data.success && response.data.encrypted) {
            logSuccess('加密成功');
            logInfo(`  原始长度: ${JSON.stringify(testFingerprint).length} 字节`);
            logInfo(`  加密长度: ${response.data.encrypted.length} 字节`);
            logInfo(`  耗时: ${response.data.elapsed}ms`);
            logInfo(`  加密结果: ${response.data.encrypted.substring(0, 50)}...`);
            return true;
        } else {
            logError('加密失败');
            return false;
        }
    } catch (error) {
        logError(`加密请求失败: ${error.message}`);
        return false;
    }
}

/**
 * 测试生成指纹接口
 */
async function testGenerate() {
    logTest('测试 3: 生成指纹接口 (POST /api/generate)');
    
    try {
        const response = await axios.post(`${BASE_URL}/api/generate`, {
            browsers: [{ name: 'chrome', minVersion: 100 }],
            devices: ['desktop'],
            os: ['windows']
        });
        
        if (response.data.success && response.data.fingerprint) {
            logSuccess('指纹生成成功');
            const fp = response.data.fingerprint;
            logInfo(`  User-Agent: ${fp.navigator.userAgent.substring(0, 60)}...`);
            logInfo(`  屏幕分辨率: ${fp.screen.width}x${fp.screen.height}`);
            logInfo(`  设备内存: ${fp.navigator.deviceMemory}GB`);
            logInfo(`  硬件并发: ${fp.navigator.hardwareConcurrency}核`);
            logInfo(`  WebGL Vendor: ${fp.videoCard.vendor}`);
            logInfo(`  WebGL Renderer: ${fp.videoCard.renderer}`);
            logInfo(`  Canvas: ${fp.canvas ? '已包含' : '未包含'}`);
            logInfo(`  耗时: ${response.data.elapsed}ms`);
            return true;
        } else {
            logError('指纹生成失败');
            return false;
        }
    } catch (error) {
        logError(`生成请求失败: ${error.message}`);
        if (error.response?.data?.error) {
            logError(`  错误详情: ${error.response.data.error}`);
        }
        return false;
    }
}

/**
 * 测试一站式接口
 */
async function testGenerateAndEncrypt() {
    logTest('测试 4: 一站式接口 (POST /api/generate-and-encrypt)');
    
    try {
        const response = await axios.post(`${BASE_URL}/api/generate-and-encrypt`, {
            browsers: [{ name: 'chrome' }],
            devices: ['desktop']
        });
        
        if (response.data.success && response.data.encrypted) {
            logSuccess('生成并加密成功');
            logInfo(`  加密结果长度: ${response.data.encrypted.length} 字节`);
            logInfo(`  加密结果: ${response.data.encrypted.substring(0, 50)}...`);
            logInfo(`  User-Agent: ${response.data.fingerprint.navigator.userAgent.substring(0, 60)}...`);
            logInfo(`  耗时: ${response.data.elapsed}ms`);
            return true;
        } else {
            logError('生成并加密失败');
            return false;
        }
    } catch (error) {
        logError(`请求失败: ${error.message}`);
        return false;
    }
}

/**
 * 测试错误处理
 */
async function testErrorHandling() {
    logTest('测试 5: 错误处理');
    
    try {
        // 测试缺少参数
        await axios.post(`${BASE_URL}/api/encrypt`, {});
        logError('应该返回错误,但没有');
        return false;
    } catch (error) {
        if (error.response?.status === 400) {
            logSuccess('错误处理正确 (400 Bad Request)');
            logInfo(`  错误信息: ${error.response.data.error}`);
            return true;
        } else {
            logError(`意外错误: ${error.message}`);
            return false;
        }
    }
}

/**
 * 性能测试
 */
async function testPerformance() {
    logTest('测试 6: 性能测试 (10次请求)');
    
    const testCount = 10;
    const times = [];
    
    for (let i = 0; i < testCount; i++) {
        try {
            const start = Date.now();
            await axios.post(`${BASE_URL}/api/encrypt`, {
                fingerprint: JSON.stringify({ test: i })
            });
            const elapsed = Date.now() - start;
            times.push(elapsed);
        } catch (error) {
            logError(`第 ${i + 1} 次请求失败`);
            return false;
        }
    }
    
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    
    logSuccess(`完成 ${testCount} 次请求`);
    logInfo(`  平均耗时: ${avgTime.toFixed(2)}ms`);
    logInfo(`  最小耗时: ${minTime}ms`);
    logInfo(`  最大耗时: ${maxTime}ms`);
    logInfo(`  预估 QPS: ${Math.round(1000 / avgTime)}`);
    
    return true;
}

/**
 * 主测试流程
 */
async function runTests() {
    console.log('='.repeat(70));
    log('🚀 WAF 服务测试开始', 'blue');
    console.log('='.repeat(70));
    
    const results = {
        health: false,
        encrypt: false,
        generate: false,
        generateAndEncrypt: false,
        errorHandling: false,
        performance: false
    };
    
    // 运行所有测试
    results.health = await testHealth();
    
    if (results.health) {
        results.encrypt = await testEncrypt();
        results.generate = await testGenerate();
        results.generateAndEncrypt = await testGenerateAndEncrypt();
        results.errorHandling = await testErrorHandling();
        results.performance = await testPerformance();
    } else {
        logError('\n服务未启动,跳过其他测试');
    }
    
    // 输出测试报告
    console.log('\n' + '='.repeat(70));
    log('📊 测试报告', 'blue');
    console.log('='.repeat(70));
    
    const passed = Object.values(results).filter(r => r).length;
    const total = Object.keys(results).length;
    
    for (const [name, result] of Object.entries(results)) {
        const status = result ? '✅ PASS' : '❌ FAIL';
        const color = result ? 'green' : 'red';
        log(`  ${status} - ${name}`, color);
    }
    
    console.log('='.repeat(70));
    
    if (passed === total) {
        logSuccess(`\n🎉 所有测试通过! (${passed}/${total})`);
        log('\n✅ WAF 服务运行正常,可以开始使用!', 'green');
        log('\n📝 配置 KiroX 客户端:', 'cyan');
        log('   {', 'cyan');
        log('       "enabled": true,', 'cyan');
        log('       "baseUrl": "http://localhost:8888",', 'cyan');
        log('       "apiKey": "",', 'cyan');
        log('       "timeout": 10', 'cyan');
        log('   }', 'cyan');
    } else {
        logError(`\n❌ 部分测试失败 (${passed}/${total})`);
        log('\n请检查:', 'yellow');
        log('  1. 服务是否已启动: node waf_server_fingerprint.js', 'yellow');
        log('  2. 端口 8888 是否被占用', 'yellow');
        log('  3. 依赖是否已安装: npm install', 'yellow');
    }
    
    console.log('='.repeat(70));
}

// 运行测试
runTests().catch(error => {
    logError(`测试脚本异常: ${error.message}`);
    process.exit(1);
});
