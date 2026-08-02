package email

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"reg_go/internal/storage"
)

// getMailNestConfigPath 获取 MailNest 配置文件路径
func getMailNestConfigPath() string {
	return filepath.Join(storage.GetDataDir(), "mailnest.dat")
}

// TestMailNestConnection 测试 MailNest 连接
func TestMailNestConnection(configJSON string) map[string]interface{} {
	var config MailNestConfig
	if err := json.Unmarshal([]byte(configJSON), &config); err != nil {
		return map[string]interface{}{"error": "配置格式错误: " + err.Error()}
	}

	client := NewMailNestClient(config)
	Balance, err := client.GetBalance()
	if err != nil {
		return map[string]interface{}{"error": "连接失败: " + err.Error()}
	}

	return map[string]interface{}{
		"success": true,
		"balance": Balance.Balance,
	}
}

// SaveMailNestConfig 保存配置到本地
func SaveMailNestConfig(jsonData string) map[string]interface{} {
	os.MkdirAll(filepath.Dir(getMailNestConfigPath()), 0755)
	if err := os.WriteFile(getMailNestConfigPath(), []byte(jsonData), 0600); err != nil {
		return map[string]interface{}{"error": "保存失败: " + err.Error()}
	}
	log.Printf("[<MailNest>] 已保存 配置" + jsonData)
	return map[string]interface{}{"success": true}
}

// GetMailNestConfig 获取 MailNest 配置列表
func GetMailNestConfig() MailNestConfig {
	data, err := os.ReadFile(getMailNestConfigPath())
	if err != nil {
		return MailNestConfig{}
	}
	var config MailNestConfig
	if err := json.Unmarshal(data, &config); err != nil {
		log.Printf("[MailNest] 配置文件格式无效，已重置: %v", err)
		os.Remove(getMoeMailConfigPath())
		return MailNestConfig{}
	}
	return config
}
