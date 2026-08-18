#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WAF 指纹加密服务示例
用于接收指纹 JSON，调用真实浏览器指纹库加密后返回

运行: python waf_server_example.py
测试: curl -X POST http://localhost:8888/api/encrypt -H "Content-Type: application/json" -d '{"fingerprint":"{\"test\":\"data\"}"}'
"""

from flask import Flask, request, jsonify
import hashlib
import base64
import struct
import json
import time

app = Flask(__name__)

# XXTEA 加密算法(示例实现,实际应调用真实浏览器指纹库)
DELTA = 0x9E3779B9
# 默认密钥(实际应从 app.js 提取)
DEFAULT_KEY = [1888420705, 2576816180, 2347232058, 874813317]
IDENTIFIER = "ECdITeCs"


def xxtea_encrypt(data, key):
    """XXTEA 加密"""
    if not data:
        return b''
    
    # 转为 uint32 数组
    n = (len(data) + 3) // 4
    v = []
    for i in range(n):
        b0 = data[4*i] if 4*i < len(data) else 0
        b1 = data[4*i+1] if 4*i+1 < len(data) else 0
        b2 = data[4*i+2] if 4*i+2 < len(data) else 0
        b3 = data[4*i+3] if 4*i+3 < len(data) else 0
        v.append(b0 | (b1 << 8) | (b2 << 16) | (b3 << 24))
    
    # 加密
    rounds = 6 + 52 // n
    z = v[-1]
    total = 0
    
    for r in range(rounds):
        total = (total + DELTA) & 0xFFFFFFFF
        e = (total >> 2) & 3
        for p in range(n):
            y = v[(p + 1) % n]
            mx = (((z >> 5) ^ (y << 2)) + ((y >> 3) ^ (z << 4))) ^ ((total ^ y) + (key[(p & 3) ^ e] ^ z))
            v[p] = (v[p] + mx) & 0xFFFFFFFF
            z = v[p]
    
    # 转回 bytes
    result = bytearray()
    for val in v:
        result.extend(struct.pack('<I', val))
    
    return bytes(result)


def encrypt_fingerprint(fingerprint_json):
    """加密指纹(模拟真实浏览器指纹加密)"""
    try:
        # 计算 CRC32 校验和
        crc = hashlib.md5(fingerprint_json.encode()).hexdigest()[:8].upper()
        
        # 构造明文: CRC#JSON
        plaintext = f"{crc}#{fingerprint_json}"
        
        # XXTEA 加密
        encrypted = xxtea_encrypt(plaintext.encode('utf-8'), DEFAULT_KEY)
        
        # Base64 编码
        encoded = base64.b64encode(encrypted).decode('utf-8')
        
        # 返回格式: IDENTIFIER:BASE64
        return f"{IDENTIFIER}:{encoded}"
    
    except Exception as e:
        raise Exception(f"加密失败: {str(e)}")


@app.route('/api/encrypt', methods=['POST'])
def encrypt_api():
    """加密接口"""
    try:
        # 解析请求
        data = request.get_json()
        if not data or 'fingerprint' not in data:
            return jsonify({
                'success': False,
                'error': '缺少 fingerprint 参数'
            }), 400
        
        fingerprint_json = data['fingerprint']
        
        # 验证 JSON 格式
        try:
            json.loads(fingerprint_json)
        except:
            return jsonify({
                'success': False,
                'error': '无效的 JSON 格式'
            }), 400
        
        # 加密
        encrypted = encrypt_fingerprint(fingerprint_json)
        
        # 记录日志
        print(f"[{time.strftime('%H:%M:%S')}] 加密成功，原始长度: {len(fingerprint_json)}, 加密长度: {len(encrypted)}")
        
        return jsonify({
            'success': True,
            'encrypted': encrypted
        })
    
    except Exception as e:
        print(f"[{time.strftime('%H:%M:%S')}] 加密失败: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/health', methods=['GET'])
def health():
    """健康检查"""
    return jsonify({
        'status': 'ok',
        'service': 'WAF Fingerprint Encryption Service',
        'version': '1.0.0'
    })


@app.route('/', methods=['GET'])
def index():
    """首页"""
    return '''
    <h1>WAF 指纹加密服务</h1>
    <p>POST /api/encrypt - 加密指纹</p>
    <p>GET /health - 健康检查</p>
    <hr>
    <h3>测试示例:</h3>
    <pre>
curl -X POST http://localhost:8888/api/encrypt \\
  -H "Content-Type: application/json" \\
  -d '{"fingerprint":"{\"test\":\"data\",\"timestamp\":1234567890}"}'
    </pre>
    '''


if __name__ == '__main__':
    print("=" * 60)
    print("WAF 指纹加密服务启动")
    print("地址: http://localhost:8888")
    print("API: POST http://localhost:8888/api/encrypt")
    print("=" * 60)
    app.run(host='0.0.0.0', port=8888, debug=True)
