# 简单测试脚本
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  WAF 服务测试" -ForegroundColor Cyan  
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# 测试1: 健康检查
Write-Host "[测试1] 健康检查..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:8888/health" -Method GET -UseBasicParsing
    Write-Host "✅ 服务运行正常" -ForegroundColor Green
    Write-Host "   服务: $($response.service)" -ForegroundColor Gray
    Write-Host "   版本: $($response.version)" -ForegroundColor Gray
} catch {
    Write-Host "❌ 健康检查失败: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 测试2: 加密接口
Write-Host "[测试2] 加密接口..." -ForegroundColor Yellow
$testData = @{
    fingerprint = '{"test":"data","timestamp":1234567890}'
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:8888/api/encrypt" -Method POST -Body $testData -ContentType "application/json" -UseBasicParsing
    if ($response.success) {
        Write-Host "✅ 加密成功" -ForegroundColor Green
        $encrypted = $response.encrypted
        Write-Host "   加密长度: $($encrypted.Length) 字节" -ForegroundColor Gray
        Write-Host "   加密结果: $($encrypted.Substring(0, [Math]::Min(50, $encrypted.Length)))..." -ForegroundColor Gray
    } else {
        Write-Host "❌ 加密失败" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ 加密请求失败: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "✅ 所有测试通过!" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📝 下一步:" -ForegroundColor Cyan
Write-Host "   1. 配置 KiroX WAF 设置" -ForegroundColor White
Write-Host "   2. 启动注册任务测试" -ForegroundColor White
Write-Host ""
