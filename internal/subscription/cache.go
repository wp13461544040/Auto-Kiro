package subscription

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// CacheEntry 单个账号的最近一次订阅链接获取结果
type CacheEntry struct {
	URL       string `json:"url"`
	PlanType  string `json:"planType,omitempty"`
	FetchedAt string `json:"fetchedAt"`
}

const cacheFileName = "subscription_links.json"

var cacheMu sync.Mutex

func cachePath(dataDir string) string {
	return filepath.Join(dataDir, cacheFileName)
}

// LoadCache 读取缓存。文件不存在返回空 map。
func LoadCache(dataDir string) map[string]CacheEntry {
	cacheMu.Lock()
	defer cacheMu.Unlock()
	b, err := os.ReadFile(cachePath(dataDir))
	if err != nil {
		return map[string]CacheEntry{}
	}
	m := map[string]CacheEntry{}
	_ = json.Unmarshal(b, &m)
	if m == nil {
		m = map[string]CacheEntry{}
	}
	return m
}

func saveCacheLocked(dataDir string, m map[string]CacheEntry) error {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	tmp := cachePath(dataDir) + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, cachePath(dataDir))
}

// PutCache 写入/更新一条记录
func PutCache(dataDir, email, url, planType string) error {
	cacheMu.Lock()
	defer cacheMu.Unlock()
	b, _ := os.ReadFile(cachePath(dataDir))
	m := map[string]CacheEntry{}
	_ = json.Unmarshal(b, &m)
	if m == nil {
		m = map[string]CacheEntry{}
	}
	m[email] = CacheEntry{URL: url, PlanType: planType, FetchedAt: time.Now().Format("2006-01-02 15:04:05")}
	return saveCacheLocked(dataDir, m)
}

// DeleteCache 删除一条记录
func DeleteCache(dataDir, email string) {
	cacheMu.Lock()
	defer cacheMu.Unlock()
	b, _ := os.ReadFile(cachePath(dataDir))
	m := map[string]CacheEntry{}
	_ = json.Unmarshal(b, &m)
	if _, ok := m[email]; !ok {
		return
	}
	delete(m, email)
	_ = saveCacheLocked(dataDir, m)
}
