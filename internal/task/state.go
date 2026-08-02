package task

import (
	"context"
	"sync"
	"time"
)

// State 任务状态（从原 App 脱离为独立单例）
type State struct {
	mu         sync.Mutex
	running    bool
	stopCh     chan struct{}
	cancelFunc context.CancelFunc // 强制取消所有 HTTP 请求
	total      int
	completed  int
	success    int
	failed     int
	targetMode bool              // 是否为目标模式
	results    []map[string]interface{}
	startTime  time.Time
	logs       []string
	logsMu     sync.Mutex
}

var Manager = &State{
	logs: make([]string, 0),
}

// AppendLog 追加日志，最多保留 500 条
func (s *State) AppendLog(msg string) {
	s.logsMu.Lock()
	defer s.logsMu.Unlock()
	s.logs = append(s.logs, msg)
	if len(s.logs) > 500 {
		s.logs = s.logs[len(s.logs)-500:]
	}
}

// GetLogs 获取所有当前日志记录的副本
func (s *State) GetLogs() []string {
	s.logsMu.Lock()
	defer s.logsMu.Unlock()
	logs := make([]string, len(s.logs))
	copy(logs, s.logs)
	return logs
}

// GetStatus 获取当前并发状态 (结构与之前 GetStatus() map 保持一致)
func (s *State) GetStatus() map[string]interface{} {
	s.mu.Lock()
	defer s.mu.Unlock()

	elapsed := 0.0
	if s.running && !s.startTime.IsZero() {
		elapsed = time.Since(s.startTime).Seconds()
	}

	return map[string]interface{}{
		"running":    s.running,
		"total":      s.total,
		"completed":  s.completed,
		"success":    s.success,
		"failed":     s.failed,
		"elapsed":    elapsed,
		"targetMode": s.targetMode,
	}
}
