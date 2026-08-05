package email

import (
	"fmt"
	"log"
	"math/rand"
	"time"
)

// RemailManager Remail 邮箱管理器
type RemailManager struct {
	configs []RemailConfig
}

// NewRemailManager 创建 Remail 管理器
func NewRemailManager(configs []RemailConfig) *RemailManager {
	if len(configs) == 0 {
		log.Println("[Remail] 警告: 未提供任何配置")
		return nil
	}
	log.Printf("[Remail] 初始化管理器，配置数量: %d", len(configs))
	return &RemailManager{configs: configs}
}

// CreateMailbox 创建新邮箱
func (m *RemailManager) CreateMailbox(prefix string) (*RemailProvider, error) {
	if len(m.configs) == 0 {
		return nil, fmt.Errorf("没有可用的 Remail 配置")
	}
	config := m.configs[rand.Intn(len(m.configs))]
	log.Printf("[Remail] 使用配置: %s (项目: %s, 产品: %s)", config.Name, config.Project, config.Product)
	provider, err := NewRemailProvider(config, prefix)
	if err != nil {
		return nil, fmt.Errorf("创建 Remail 邮箱失败: %w", err)
	}
	return provider, nil
}

// GetAvailableCount 获取可用配置数量
func (m *RemailManager) GetAvailableCount() int {
	return len(m.configs)
}

func init() {
	rand.Seed(time.Now().UnixNano())
}
