package proxy

import (
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// PoolEntry 多代理池条目
type PoolEntry struct {
	ID         string    `json:"id"`          // 内部 ID，UI 用
	Name       string    `json:"name"`        // 用户可见名称
	URL        string    `json:"url"`         // 完整代理 URL（已归一化）
	Weight     int       `json:"weight"`      // 1-100，越高被选中概率越大
	Enabled    bool      `json:"enabled"`     // 关闭时不参与抽签
	LastUsedAt time.Time `json:"last_used_at"` // 最后使用时间
	InCooldown bool      `json:"in_cooldown"` // 是否在冷却中
}

// poolFile JSON 持久化结构
type poolFile struct {
	Entries []PoolEntry `json:"entries"`
}

const (
	// Power 用于"软最大化"：>1 时拉大权重差，<1 时压平。0.6 保证哪怕权重 1 vs 100 也有 ~6% 概率被选中。
	weightPower = 0.6
	// 冷却时长：8小时
	cooldownDuration = 8 * time.Hour
)

var (
	poolMu      sync.Mutex
	poolLoaded  bool
	poolEntries []PoolEntry
	poolPath    string
)

// InitPool 在 App 启动时调用一次，传入数据目录
func InitPool(dataDir string) {
	poolMu.Lock()
	defer poolMu.Unlock()
	poolPath = filepath.Join(dataDir, "proxy_pool.json")
	poolLoaded = false
	_ = loadPoolLocked()
}

func loadPoolLocked() error {
	if poolLoaded {
		return nil
	}
	poolEntries = nil
	poolLoaded = true
	b, err := os.ReadFile(poolPath)
	if err != nil {
		return nil
	}
	var pf poolFile
	if err := json.Unmarshal(b, &pf); err != nil {
		return fmt.Errorf("解析代理池失败: %w", err)
	}
	poolEntries = pf.Entries
	// 加载后自动清除过期的冷却标记
	cleanExpiredCooldowns()
	return nil
}

func savePoolLocked() error {
	if poolPath == "" {
		return fmt.Errorf("代理池未初始化")
	}
	b, err := json.MarshalIndent(poolFile{Entries: poolEntries}, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(poolPath), 0o755); err != nil {
		return err
	}
	tmp := poolPath + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, poolPath)
}

// List 返回当前所有代理（含禁用项）
func List() []PoolEntry {
	poolMu.Lock()
	defer poolMu.Unlock()
	loadPoolLocked()
	out := make([]PoolEntry, len(poolEntries))
	copy(out, poolEntries)
	return out
}

func newID() string {
	return fmt.Sprintf("p_%d_%04d", time.Now().UnixNano(), rand.Intn(10000))
}

// Add 新增一条代理。url 会被外部归一化后传入。
func Add(entry PoolEntry) (PoolEntry, error) {
	entry.URL = strings.TrimSpace(entry.URL)
	if entry.URL == "" {
		return entry, fmt.Errorf("代理地址不能为空")
	}
	if entry.Weight <= 0 {
		entry.Weight = 50
	}
	if entry.Weight > 100 {
		entry.Weight = 100
	}
	entry.Name = strings.TrimSpace(entry.Name)
	if entry.Name == "" {
		entry.Name = entry.URL
	}
	poolMu.Lock()
	defer poolMu.Unlock()
	loadPoolLocked()
	for _, e := range poolEntries {
		if e.URL == entry.URL {
			return entry, fmt.Errorf("该代理已存在")
		}
	}
	if entry.ID == "" {
		entry.ID = newID()
	}
	entry.Enabled = true
	poolEntries = append(poolEntries, entry)
	if err := savePoolLocked(); err != nil {
		// 回滚
		poolEntries = poolEntries[:len(poolEntries)-1]
		return entry, err
	}
	return entry, nil
}

// Update 修改一条（按 id 匹配）。url 不允许改成已存在的另一条。
func Update(id string, patch PoolEntry) (PoolEntry, error) {
	poolMu.Lock()
	defer poolMu.Unlock()
	loadPoolLocked()
	idx := -1
	for i, e := range poolEntries {
		if e.ID == id {
			idx = i
			break
		}
	}
	if idx < 0 {
		return PoolEntry{}, fmt.Errorf("代理不存在")
	}
	cur := poolEntries[idx]
	if name := strings.TrimSpace(patch.Name); name != "" {
		cur.Name = name
	}
	if u := strings.TrimSpace(patch.URL); u != "" && u != cur.URL {
		for j, e := range poolEntries {
			if j != idx && e.URL == u {
				return PoolEntry{}, fmt.Errorf("该代理 URL 已存在")
			}
		}
		cur.URL = u
	}
	if patch.Weight > 0 {
		w := patch.Weight
		if w > 100 {
			w = 100
		}
		cur.Weight = w
	}
	cur.Enabled = patch.Enabled
	poolEntries[idx] = cur
	if err := savePoolLocked(); err != nil {
		return PoolEntry{}, err
	}
	return cur, nil
}

// Delete 按 id 删除
func Delete(id string) error {
	poolMu.Lock()
	defer poolMu.Unlock()
	loadPoolLocked()
	for i, e := range poolEntries {
		if e.ID == id {
			poolEntries = append(poolEntries[:i], poolEntries[i+1:]...)
			return savePoolLocked()
		}
	}
	return fmt.Errorf("代理不存在")
}

// DeleteBatch 按 id 列表批量删除
func DeleteBatch(ids []string) (int, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	idSet := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		idSet[id] = struct{}{}
	}
	poolMu.Lock()
	defer poolMu.Unlock()
	loadPoolLocked()
	newEntries := poolEntries[:0:0]
	removed := 0
	for _, e := range poolEntries {
		if _, del := idSet[e.ID]; del {
			removed++
		} else {
			newEntries = append(newEntries, e)
		}
	}
	if removed == 0 {
		return 0, nil
	}
	poolEntries = newEntries
	return removed, savePoolLocked()
}

// PickRandom 按权重抽签返回一个启用且未在冷却中的代理 URL；池为空或全部不可用返回空串。
// 使用 weightPower 软化：让低权重也有非零概率被命中，避免全部任务落到单一代理。
// 选中后自动标记为使用并设置8小时冷却。
func PickRandom() string {
	poolMu.Lock()
	defer poolMu.Unlock()
	loadPoolLocked()

	// 先清理过期的冷却标记
	cleanExpiredCooldowns()

	type cand struct {
		idx  int
		url  string
		soft float64
	}
	candidates := make([]cand, 0, len(poolEntries))
	var total float64
	for i, e := range poolEntries {
		// 只选择启用且不在冷却中的代理
		if !e.Enabled || e.InCooldown || e.URL == "" {
			continue
		}
		w := e.Weight
		if w <= 0 {
			w = 1
		}
		soft := math.Pow(float64(w), weightPower)
		candidates = append(candidates, cand{idx: i, url: e.URL, soft: soft})
		total += soft
	}
	if total <= 0 || len(candidates) == 0 {
		return ""
	}
	r := rand.Float64() * total
	for _, c := range candidates {
		r -= c.soft
		if r <= 0 {
			// 标记使用并设置冷却
			poolEntries[c.idx].LastUsedAt = time.Now()
			poolEntries[c.idx].InCooldown = true
			savePoolLocked()
			return c.url
		}
	}
	// 最后一个候选
	lastIdx := candidates[len(candidates)-1].idx
	poolEntries[lastIdx].LastUsedAt = time.Now()
	poolEntries[lastIdx].InCooldown = true
	savePoolLocked()
	return candidates[len(candidates)-1].url
}

// HasEnabled 是否至少一个启用且未冷却的池条目
func HasEnabled() bool {
	poolMu.Lock()
	defer poolMu.Unlock()
	loadPoolLocked()
	cleanExpiredCooldowns()
	for _, e := range poolEntries {
		if e.Enabled && !e.InCooldown && e.URL != "" {
			return true
		}
	}
	return false
}

// BatchTest 并发测试代理池条目，ids 为空则测试全部。
// 并发上限 10，按 ID 返回测试结果映射。
func BatchTest(ids []string) map[string]Info {
	poolMu.Lock()
	loadPoolLocked()
	// 确定需要测试的条目
	var targets []PoolEntry
	if len(ids) == 0 {
		targets = make([]PoolEntry, len(poolEntries))
		copy(targets, poolEntries)
	} else {
		idSet := make(map[string]struct{}, len(ids))
		for _, id := range ids {
			idSet[id] = struct{}{}
		}
		for _, e := range poolEntries {
			if _, ok := idSet[e.ID]; ok {
				targets = append(targets, e)
			}
		}
	}
	poolMu.Unlock()

	if len(targets) == 0 {
		return map[string]Info{}
	}

	const maxConcurrency = 10
	sem := make(chan struct{}, maxConcurrency)
	type result struct {
		id   string
		info Info
	}
	ch := make(chan result, len(targets))

	for _, entry := range targets {
		e := entry
		sem <- struct{}{}
		go func() {
			defer func() { <-sem }()
			info := Detect(e.URL)
			ch <- result{id: e.ID, info: info}
		}()
	}

	out := make(map[string]Info, len(targets))
	for i := 0; i < len(targets); i++ {
		r := <-ch
		out[r.id] = r.info
	}
	return out
}

// cleanExpiredCooldowns 清理已过期的冷却标记（必须在已持锁状态下调用）
func cleanExpiredCooldowns() {
	now := time.Now()
	changed := false
	for i := range poolEntries {
		if poolEntries[i].InCooldown {
			// 检查是否超过8小时
			if !poolEntries[i].LastUsedAt.IsZero() && now.Sub(poolEntries[i].LastUsedAt) >= cooldownDuration {
				poolEntries[i].InCooldown = false
				changed = true
			}
		}
	}
	if changed {
		savePoolLocked()
	}
}

// ResetCooldown 手动重置指定代理的冷却状态
func ResetCooldown(id string) error {
	poolMu.Lock()
	defer poolMu.Unlock()
	loadPoolLocked()
	for i, e := range poolEntries {
		if e.ID == id {
			poolEntries[i].InCooldown = false
			poolEntries[i].LastUsedAt = time.Time{}
			return savePoolLocked()
		}
	}
	return fmt.Errorf("代理不存在")
}

// ResetAllCooldowns 重置所有代理的冷却状态
func ResetAllCooldowns() error {
	poolMu.Lock()
	defer poolMu.Unlock()
	loadPoolLocked()
	for i := range poolEntries {
		poolEntries[i].InCooldown = false
		poolEntries[i].LastUsedAt = time.Time{}
	}
	return savePoolLocked()
}

// CountAvailable 统计当前可用（启用且未冷却）的代理数量
func CountAvailable() int {
	poolMu.Lock()
	defer poolMu.Unlock()
	loadPoolLocked()
	cleanExpiredCooldowns()
	
	count := 0
	for _, e := range poolEntries {
		if e.Enabled && !e.InCooldown && e.URL != "" {
			count++
		}
	}
	return count
}
