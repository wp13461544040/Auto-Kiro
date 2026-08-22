package crypto

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"
)

// WAF 加密服务配置
type WAFConfig struct {
	Enabled bool   `json:"enabled"` // 是否启用 WAF 加密
	BaseURL string `json:"baseUrl"` // WAF 服务地址
	APIKey  string `json:"apiKey"`  // API 密钥(如果需要)
	Timeout int    `json:"timeout"` // 超时时间(秒)
}

var (
	wafMu     sync.RWMutex
	wafConfig *WAFConfig
)

// LoadWAFConfig 加载 WAF 配置
func LoadWAFConfig(cfg *WAFConfig) {
	wafMu.Lock()
	defer wafMu.Unlock()
	wafConfig = cfg
	if cfg != nil && cfg.Enabled {
		log.Printf("[WAF] 已启用远程加密: %s", cfg.BaseURL)
	}
}

// GetWAFConfig 获取 WAF 配置
func GetWAFConfig() *WAFConfig {
	wafMu.RLock()
	defer wafMu.RUnlock()
	return wafConfig
}

// IsWAFEnabled 检查 WAF 是否启用
func IsWAFEnabled() bool {
	cfg := GetWAFConfig()
	return cfg != nil && cfg.Enabled && cfg.BaseURL != ""
}

// WAFEncryptRequest WAF 加密请求
type WAFEncryptRequest struct {
	Fingerprint string `json:"fingerprint"` // 原始指纹 JSON
}

// WAFEncryptResponse WAF 加密响应
type WAFEncryptResponse struct {
	Success   bool   `json:"success"`
	Encrypted string `json:"encrypted"` // 加密后的指纹
	Error     string `json:"error"`
}

// EncryptFingerprintWithWAF 使用 WAF 服务加密指纹
func EncryptFingerprintWithWAF(fingerprintJSON string) (string, error) {
	cfg := GetWAFConfig()
	if cfg == nil || !cfg.Enabled {
		return "", fmt.Errorf("WAF 服务未启用")
	}

	// 构造请求 - 使用 /api/encrypt 接口加密客户端生成的指纹
	reqBody := map[string]interface{}{
		"fingerprint": fingerprintJSON,
	}
	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("序列化请求失败: %v", err)
	}

	// 发送请求
	timeout := 10
	if cfg.Timeout > 0 {
		timeout = cfg.Timeout
	}
	client := &http.Client{
		Timeout: time.Duration(timeout) * time.Second,
	}

	apiURL := cfg.BaseURL + "/api/encrypt"
	req, err := http.NewRequest("POST", apiURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("创建请求失败: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "KiroX/1.0")
	if cfg.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	}

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("请求失败: %v", err)
	}
	defer resp.Body.Close()

	// 解析响应
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("读取响应失败: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("WAF 服务返回错误(%d): %s", resp.StatusCode, string(body))
	}

	var wafResp struct {
		Success   bool   `json:"success"`
		Encrypted string `json:"encrypted"`
		Error     string `json:"error"`
	}
	if err := json.Unmarshal(body, &wafResp); err != nil {
		return "", fmt.Errorf("解析响应失败: %v", err)
	}

	if !wafResp.Success {
		return "", fmt.Errorf("WAF 加密失败: %s", wafResp.Error)
	}

	if wafResp.Encrypted == "" {
		return "", fmt.Errorf("WAF 返回空加密结果")
	}

	return wafResp.Encrypted, nil
}

// EncryptFingerprintSmart 智能加密指纹（优先使用 WAF，失败则降级到本地）
func EncryptFingerprintSmart(fingerprintJSON string) string {
	// 优先使用 WAF 服务
	if IsWAFEnabled() {
		encrypted, err := EncryptFingerprintWithWAF(fingerprintJSON)
		if err != nil {
			log.Printf("[WAF] 远程加密失败，降级到本地: %v", err)
		} else {
			return encrypted
		}
	}

	// 降级到本地加密
	return EncryptFingerprint(fingerprintJSON)
}

// TestWAFConnection 测试 WAF 服务连接和功能
func TestWAFConnection() error {
	cfg := GetWAFConfig()
	if cfg == nil || !cfg.Enabled {
		return fmt.Errorf("WAF 服务未启用")
	}
	
	if cfg.BaseURL == "" {
		return fmt.Errorf("WAF 服务地址未配置")
	}
	
	// 使用测试指纹进行加密测试
	testFP := `{"test":"fingerprint","timestamp":` + fmt.Sprintf("%d", time.Now().Unix()) + `}`
	
	log.Printf("[WAF] 测试连接: %s", cfg.BaseURL)
	
	encrypted, err := EncryptFingerprintWithWAF(testFP)
	if err != nil {
		return fmt.Errorf("WAF 连接测试失败: %w", err)
	}
	
	if len(encrypted) == 0 {
		return fmt.Errorf("WAF 返回空加密结果")
	}
	
	log.Printf("[WAF] 连接测试成功，加密结果长度: %d", len(encrypted))
	return nil
}
