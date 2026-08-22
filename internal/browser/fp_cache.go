package browser

import (
	"crypto/sha256"
	"fmt"
	"sync"
	"time"
)

// FingerprintCache 指纹缓存，用于防止短时间内重复使用相同指纹
type FingerprintCache struct {
	mu      sync.Mutex
	used    map[string]time.Time // hash -> 最后使用时间
	maxAge  time.Duration        // 缓存有效期
}

// 全局指纹缓存实例
var globalFpCache = &FingerprintCache{
	used:   make(map[string]time.Time),
	maxAge: 24 * time.Hour, // 24小时内不重复相同指纹
}

// Hash 计算指纹哈希值
func (id *BrowserIdentity) Hash() string {
	// 关键字段组合生成哈希
	data := fmt.Sprintf("%s|%d|%d|%dx%d|%s",
		id.ChromeVer,
		id.HardwareConcurrency, // CPU核心数
		id.DeviceMemory,        // 内存
		id.Screen.Width,
		id.Screen.Height,
		id.GPUModel, // GPU型号
	)
	hash := sha256.Sum256([]byte(data))
	return fmt.Sprintf("%x", hash[:12]) // 前24字符
}

// IsRecentlyUsed 检查指纹是否在缓存有效期内使用过
func (fc *FingerprintCache) IsRecentlyUsed(fp *BrowserIdentity) bool {
	fc.mu.Lock()
	defer fc.mu.Unlock()

	hash := fp.Hash()
	if lastUsed, exists := fc.used[hash]; exists {
		if time.Since(lastUsed) < fc.maxAge {
			return true
		}
	}
	return false
}

// MarkUsed 标记指纹已使用
func (fc *FingerprintCache) MarkUsed(fp *BrowserIdentity) {
	fc.mu.Lock()
	defer fc.mu.Unlock()

	hash := fp.Hash()
	fc.used[hash] = time.Now()

	// 清理过期缓存 (超过 maxAge 的记录)
	now := time.Now()
	for h, t := range fc.used {
		if now.Sub(t) > fc.maxAge {
			delete(fc.used, h)
		}
	}
}

// GetCacheStats 获取缓存统计信息
func (fc *FingerprintCache) GetCacheStats() (total int, expired int) {
	fc.mu.Lock()
	defer fc.mu.Unlock()

	total = len(fc.used)
	now := time.Now()
	for _, t := range fc.used {
		if now.Sub(t) > fc.maxAge {
			expired++
		}
	}
	return total, expired
}

// ResetCache 重置缓存 (用于测试或手动清理)
func (fc *FingerprintCache) ResetCache() {
	fc.mu.Lock()
	defer fc.mu.Unlock()
	fc.used = make(map[string]time.Time)
}
