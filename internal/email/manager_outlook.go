package email

import (
	"fmt"
	"log"
	"math/rand"
	"os"
	"strings"
	"time"

	"github.com/wp13461544040/Auto-Kiro/internal/storage"
)

const maxSplitCount = 100

// splitCharsets 分裂后缀随机字符集
var splitCharsets = "abcdefghijklmnopqrstuvwxyz0123456789"

// ParseOutlook 解析 Outlook 账号
func ParseOutlook(data string) map[string]interface{} {
	accounts := ParseOutlookLines(data)

	var accountList []map[string]string
	for _, acc := range accounts {
		accountList = append(accountList, map[string]string{
			"email":    acc.Email,
			"password": acc.Password,
		})
	}

	return map[string]interface{}{
		"count":    len(accounts),
		"accounts": accountList,
	}
}

// AddOutlookAccounts 添加 Outlook 账号到持久化存储
func AddOutlookAccounts(data string) map[string]interface{} {
	accounts := ParseOutlookLines(data)
	if len(accounts) == 0 {
		return map[string]interface{}{"error": "未解析到有效账号"}
	}

	addedCount := 0
	now := time.Now().Format("2006-01-02 15:04:05")
	storage.ModifyAccountsCached(func(existing []map[string]interface{}) []map[string]interface{} {
		for _, acc := range accounts {
			exists := false
			for _, e := range existing {
				if e["email"] == acc.Email {
					exists = true
					break
				}
			}
			if !exists {
				existing = append(existing, map[string]interface{}{
					"email":        acc.Email,
					"password":     acc.Password,
					"clientId":     acc.ClientID,
					"refreshToken": acc.RefreshToken,
					"mode":         acc.mailMode(),
					"registered":   false,
					"success":      false,
					"addedAt":      now,
				})
				addedCount++
			}
		}
		return existing
	})

	return map[string]interface{}{
		"added": addedCount,
		"total": len(storage.GetAccountsCached()),
	}
}

// GetOutlookAccounts 获取 Outlook 账号列表
func GetOutlookAccounts() []map[string]interface{} {
	return storage.GetAccountsCached()
}

// UpdateAccountStatus 更新账号注册状态（纯内存操作，异步刷盘）
func UpdateAccountStatus(emailAddr string, registered bool, success bool) map[string]interface{} {
	found := false
	now := time.Now().Format("2006-01-02 15:04:05")
	emailLower := strings.ToLower(emailAddr)
	storage.ModifyAccountsCached(func(accounts []map[string]interface{}) []map[string]interface{} {
		for i, acc := range accounts {
			if stored, _ := acc["email"].(string); strings.ToLower(stored) == emailLower {
				accounts[i]["registered"] = registered
				accounts[i]["success"] = success
				accounts[i]["registeredAt"] = now
				found = true
				break
			}
		}
		return accounts
	})
	if !found {
		log.Printf("[账号] UpdateAccountStatus: 未找到邮箱 %s（缓存共 %d 条）", emailAddr, storage.GetAccountsCount())
		return map[string]interface{}{"error": "账号不存在"}
	}
	return map[string]interface{}{"status": "updated"}
}

// DeleteOutlookAccount 删除单个 Outlook 账号（纯内存操作，异步刷盘）
func DeleteOutlookAccount(email string) map[string]interface{} {
	found := false
	newLen := 0
	storage.ModifyAccountsCached(func(accounts []map[string]interface{}) []map[string]interface{} {
		newAccounts := make([]map[string]interface{}, 0, len(accounts))
		for _, acc := range accounts {
			if acc["email"] == email {
				found = true
				continue
			}
			newAccounts = append(newAccounts, acc)
		}
		newLen = len(newAccounts)
		return newAccounts
	})
	if !found {
		return map[string]interface{}{"error": "账号不存在"}
	}
	return map[string]interface{}{
		"status": "deleted",
		"total":  newLen,
	}
}

// ClearOutlookAccounts 清空所有 Outlook 账号
func ClearOutlookAccounts() map[string]interface{} {
	storage.SetAccountsCached([]map[string]interface{}{})
	return map[string]interface{}{"status": "cleared"}
}

// ClearRegisteredOutlookAccounts 仅清除已标记为已注册的账号（成功/失败均算）
func ClearRegisteredOutlookAccounts() map[string]interface{} {
	removed := 0
	newLen := 0
	storage.ModifyAccountsCached(func(accounts []map[string]interface{}) []map[string]interface{} {
		out := make([]map[string]interface{}, 0, len(accounts))
		for _, acc := range accounts {
			if reg, _ := acc["registered"].(bool); reg {
				removed++
				continue
			}
			out = append(out, acc)
		}
		newLen = len(out)
		return out
	})
	return map[string]interface{}{"status": "ok", "removed": removed, "total": newLen}
}

// ImportOutlookFile 导入 Outlook 账号文件
func ImportOutlookFile(filePath string) map[string]interface{} {
	if filePath == "" {
		return map[string]interface{}{"error": "未选择文件"}
	}

	// 读取文件内容
	data, err := os.ReadFile(filePath)
	if err != nil {
		return map[string]interface{}{"error": "读取文件失败: " + err.Error()}
	}

	// 使用现有的解析和添加逻辑
	return AddOutlookAccounts(string(data))
}

// SplitOutlookAccount 将单个 Outlook 账号分裂为最多 maxSplitCount 个别名账号并添加到账号池
// email 格式：user@domain.com，分裂后生成 user+xxx@domain.com 形式的别名
// count：期望生成的子账号数量（1~100），但会检查已有子账号数量，总数不超过 100
func SplitOutlookAccount(sourceEmail string, count int) map[string]interface{} {
	if count < 1 {
		count = 1
	}
	if count > maxSplitCount {
		count = maxSplitCount
	}

	// 找到源账号
	accounts := storage.GetAccountsCached()
	var source map[string]interface{}
	for _, acc := range accounts {
		if em, _ := acc["email"].(string); em == sourceEmail {
			source = acc
			break
		}
	}
	if source == nil {
		return map[string]interface{}{"error": "未找到源账号: " + sourceEmail}
	}

	// 解析邮箱用户名和域名
	atIdx := strings.LastIndex(sourceEmail, "@")
	if atIdx < 1 {
		return map[string]interface{}{"error": "邮箱格式无效"}
	}
	localPart := sourceEmail[:atIdx]
	domain := sourceEmail[atIdx+1:]

	// 去掉原始 localPart 中已有的 +tag 或 -tag（避免重复分裂）
	if plusIdx := strings.Index(localPart, "+"); plusIdx > 0 {
		localPart = localPart[:plusIdx]
	}

	// 统计该主账号已有的子账号数量
	existingSplitCount := 0
	for _, acc := range accounts {
		if splitFrom, _ := acc["splitFrom"].(string); splitFrom == sourceEmail {
			existingSplitCount++
		}
	}

	// 检查是否已达上限
	if existingSplitCount >= maxSplitCount {
		return map[string]interface{}{"error": fmt.Sprintf("该账号已分裂 %d 个子账号，已达上限", existingSplitCount)}
	}

	// 限制本次分裂数量，确保总数不超过 100
	remainingQuota := maxSplitCount - existingSplitCount
	if count > remainingQuota {
		count = remainingQuota
	}

	// 收集已存在的邮箱，避免重复
	existingEmails := make(map[string]struct{}, len(accounts))
	for _, acc := range accounts {
		if em, _ := acc["email"].(string); em != "" {
			existingEmails[strings.ToLower(em)] = struct{}{}
		}
	}

	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	generateSuffix := func(n int) string {
		b := make([]byte, n)
		for i := range b {
			b[i] = splitCharsets[rng.Intn(len(splitCharsets))]
		}
		return string(b)
	}

	now := time.Now().Format("2006-01-02 15:04:05")
	password, _ := source["password"].(string)
	clientID, _ := source["clientId"].(string)
	refreshToken, _ := source["refreshToken"].(string)
	mode, _ := source["mode"].(string)

	addedCount := 0
	storage.ModifyAccountsCached(func(existing []map[string]interface{}) []map[string]interface{} {
		attempt := 0
		maxAttempt := count * 10 // 防止无限循环
		for addedCount < count && attempt < maxAttempt {
			attempt++
			suffix := generateSuffix(6)
			aliasEmail := fmt.Sprintf("%s+%s@%s", localPart, suffix, domain)
			aliasEmailLower := strings.ToLower(aliasEmail)

			if _, exists := existingEmails[aliasEmailLower]; exists {
				continue
			}
			existingEmails[aliasEmailLower] = struct{}{}

			existing = append(existing, map[string]interface{}{
				"email":         aliasEmail,
				"password":      password,
				"clientId":      clientID,
				"refreshToken":  refreshToken,
				"mode":          mode,
				"registered":    false,
				"success":       false,
				"addedAt":       now,
				"splitFrom":     sourceEmail,
				"mailboxEmail":  sourceEmail, // IMAP/Graph 认证用主账号地址
			})
			addedCount++
		}
		return existing
	})

	return map[string]interface{}{
		"added":         addedCount,
		"total":         len(storage.GetAccountsCached()),
		"splitCount":    existingSplitCount + addedCount,
		"remainingSlot": maxSplitCount - existingSplitCount - addedCount,
	}
}
