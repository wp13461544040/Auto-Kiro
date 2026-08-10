package email

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/wp13461544040/Auto-Kiro/internal/storage"
)

// RemailConfig Remail 配置
type RemailConfig struct {
	Name       string `json:"name"`       // 配置名称
	APIKey     string `json:"apiKey"`     // API Key
	APIURL     string `json:"apiUrl"`     // API 地址
	Project    string `json:"project"`    // 项目名称（用于显示，实际使用 ProjectID）
	ProjectID  int    `json:"projectId"`  // 项目ID
	Product    string `json:"product"`    // 产品类型（microsoft/domain，用于显示）
	ProductID  int    `json:"productId"`  // 产品ID
	Mode       string `json:"mode"`       // 服务模式：package（接包/code）或 purchase（购买）
	Suffix     string `json:"suffix"`     // 邮箱后缀（如 com.cn）
	Timeout    int    `json:"timeout"`    // 超时时间（秒）
	PollPeriod int    `json:"pollPeriod"` // 轮询周期（秒）
}

// RemailProvider Remail 邮箱提供商
type RemailProvider struct {
	config       RemailConfig
	email        string
	mailboxEmail string
	token        string
	orderID      string
	client       *http.Client
	created      bool
	createdAt    time.Time
}

// RemailCreateResponse 创建邮箱响应（下单响应）- 直接返回订单对象
type RemailCreateResponse struct {
	ID                   int     `json:"id"`
	OrderNo              string  `json:"orderNo"`              // 订单号
	UserID               int     `json:"userId"`
	ProjectID            int     `json:"projectId"`
	ProjectProductID     int     `json:"projectProductId"`
	ProductType          string  `json:"productType"`
	ServiceMode          string  `json:"serviceMode"`          // code, purchase
	SupplyPolicy         string  `json:"supplyPolicy"`
	Status               string  `json:"status"`               // pending_payment, active, expired, etc.
	FailureCode          string  `json:"failureCode"`
	PayAmount            string  `json:"payAmount"`
	RefundAmount         string  `json:"refundAmount"`
	AllocationType       string  `json:"allocationType"`
	AllocationID         int     `json:"allocationId"`
	DeliveryEmail        string  `json:"deliveryEmail"`        // 邮箱地址！
	ReceiveStartedAt     string  `json:"receiveStartedAt"`
	ReceiveUntil         string  `json:"receiveUntil"`
	ActivatedAt          string  `json:"activatedAt"`
	AfterSaleUntil       string  `json:"afterSaleUntil"`
	ClientChannel        string  `json:"clientChannel"`
	APIKeyID             int     `json:"apiKeyId"`
	ServiceCleanupStatus string  `json:"serviceCleanupStatus"`
	ServiceToken         string  `json:"serviceToken"`         // 取件令牌！
	HasDelivery          bool    `json:"hasDelivery"`
	VerificationCode     string  `json:"verificationCode"`     // 验证码（如果已收到）
	LastMailReceivedAt   string  `json:"lastMailReceivedAt"`
	ArchivedAt           string  `json:"archivedAt"`
	CreatedAt            string  `json:"createdAt"`
	UpdatedAt            string  `json:"updatedAt"`
}

// RemailOrderDetailResponse 订单详情响应（与创建响应结构相同）
type RemailOrderDetailResponse = RemailCreateResponse

// RemailMessagesResponse 读取邮件响应
type RemailMessagesResponse struct {
	Items []struct {
		ID               int    `json:"id"`
		Sender           string `json:"sender"`
		Recipient        string `json:"recipient"`
		ReceivedAt       string `json:"receivedAt"`
		Subject          string `json:"subject"`
		BodyPreview      string `json:"bodyPreview"`
		VerificationCode string `json:"verificationCode"` // 已提取的验证码！
	} `json:"items"`
	Fetch struct {
		LastJobID          int    `json:"lastJobId"`
		LastStatus         string `json:"lastStatus"`
		LastSubmittedAt    string `json:"lastSubmittedAt"`
		LastSuccessAt      string `json:"lastSuccessAt"`
		LastReceivedAt     string `json:"lastReceivedAt"`
		NextFetchAllowedAt string `json:"nextFetchAllowedAt"`
		LastSafeError      string `json:"lastSafeError"`
	} `json:"fetch"`
}

// RemailPickupResponse 取件通知响应（废弃 - 使用 RemailMessagesResponse）
type RemailPickupResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Data    []struct {
		MessageID  string `json:"messageId"`  // 邮件ID
		Email      string `json:"email"`      // 收件邮箱
		From       string `json:"from"`       // 发件人
		Subject    string `json:"subject"`    // 主题
		Preview    string `json:"preview"`    // 预览文本
		ReceivedAt string `json:"receivedAt"` // 接收时间
	} `json:"data"`
}

// RemailMessageDetailResponse 邮件详情响应
type RemailMessageDetailResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Data    struct {
		MessageID  string `json:"messageId"`
		From       string `json:"from"`
		To         string `json:"to"`
		Subject    string `json:"subject"`
		TextBody   string `json:"textBody"`   // 纯文本正文
		HtmlBody   string `json:"htmlBody"`   // HTML正文
		ReceivedAt string `json:"receivedAt"`
	} `json:"data"`
}

// NewRemailProvider 创建 Remail 提供商实例
func NewRemailProvider(config RemailConfig, prefix string) (*RemailProvider, error) {
	if config.APIKey == "" {
		return nil, fmt.Errorf("Remail API Key 不能为空")
	}
	if config.APIURL == "" {
		config.APIURL = "https://remail.aishop6.com"
	}
	if config.Timeout == 0 {
		config.Timeout = 300 // 默认 5 分钟
	}
	if config.PollPeriod == 0 {
		config.PollPeriod = 3 // 默认 3 秒轮询
	}
	if config.Mode == "" {
		config.Mode = "package" // 默认接包模式
	}

	provider := &RemailProvider{
		config: config,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
		createdAt: time.Now(),
	}

	// 创建邮箱
	if err := provider.createMailbox(prefix); err != nil {
		return nil, fmt.Errorf("创建 Remail 邮箱失败: %w", err)
	}

	return provider, nil
}

// createMailbox 创建邮箱（下单）
func (p *RemailProvider) createMailbox(prefix string) error {
	// 去除 API URL 末尾的斜杠
	apiURL := strings.TrimRight(p.config.APIURL, "/")
	
	// 验证必需参数
	log.Printf("[Remail] 配置信息 - ProjectID: %d, ProductID: %d, Project: %s, Product: %s", 
		p.config.ProjectID, p.config.ProductID, p.config.Project, p.config.Product)
	
	if p.config.ProjectID == 0 {
		return fmt.Errorf("项目ID不能为空")
	}
	if p.config.ProductID == 0 {
		return fmt.Errorf("产品ID不能为空")
	}
	
	// 构建请求体 - 统一使用固定格式
	// API 只接受这三个字段：projectId, productId, emailSuffix
	// emailPrefix 由 API 自动生成，不需要客户端提供
	reqBody := map[string]interface{}{
		"projectId":   p.config.ProjectID,
		"productId":   p.config.ProductID,
		"emailSuffix": p.config.Suffix, // 使用配置的后缀，如果为空就是 ""
	}
	
	if p.config.Suffix != "" {
		log.Printf("[Remail] 使用自定义后缀: %s", p.config.Suffix)
	} else {
		log.Printf("[Remail] 使用空后缀，由 API 自动分配域名")
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}

	// 使用正确的 API 端点：POST /v1/open/orders
	fullURL := apiURL + "/v1/open/orders"
	req, err := http.NewRequest("POST", fullURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	// 设置请求头
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.config.APIKey)
	req.Header.Set("User-Agent", "KiroX/1.0")
	
	// 生成幂等键（使用时间戳 + 随机数确保唯一性）
	idempotencyKey := fmt.Sprintf("%d-%s", time.Now().UnixNano(), prefix)
	req.Header.Set("Idempotency-Key", idempotencyKey)

	// 设置 serviceMode 和 supply 查询参数
	q := req.URL.Query()
	if p.config.Mode == "purchase" {
		q.Add("serviceMode", "purchase")
	} else {
		q.Add("serviceMode", "code") // package 模式对应 code
	}
	// 统一使用 private_first 策略
	q.Add("supply", "private_first")
	req.URL.RawQuery = q.Encode()

	log.Printf("[Remail] 下单请求 URL: %s", req.URL.String())
	log.Printf("[Remail] 幂等键: %s", idempotencyKey)
	log.Printf("[Remail] 请求体: %s", string(jsonData))
	log.Printf("[Remail] 请求体: %s", string(jsonData))

	resp, err := p.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	log.Printf("[Remail] 下单 HTTP Status: %d %s", resp.StatusCode, resp.Status)

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	// 检查 HTTP 状态码 - 200 或 201 都表示成功
	if resp.StatusCode != 200 && resp.StatusCode != 201 {
		bodyStr := string(body)
		log.Printf("[Remail] 下单 HTTP 错误: %d, 完整响应: %s", resp.StatusCode, bodyStr)
		
		// 尝试解析错误信息
		var errResp map[string]interface{}
		if err := json.Unmarshal(body, &errResp); err == nil {
			if msg, ok := errResp["message"].(string); ok {
				return fmt.Errorf("HTTP %d: %s", resp.StatusCode, msg)
			}
		}
		
		if len(bodyStr) > 500 {
			bodyStr = bodyStr[:500] + "..."
		}
		return fmt.Errorf("HTTP %d: %s, 响应: %s", resp.StatusCode, resp.Status, bodyStr)
	}

	var result RemailCreateResponse
	if err := json.Unmarshal(body, &result); err != nil {
		bodyStr := string(body)
		if len(bodyStr) > 500 {
			bodyStr = bodyStr[:500] + "..."
		}
		log.Printf("[Remail] 下单 JSON 解析失败: %v, 响应: %s", err, bodyStr)
		return fmt.Errorf("解析响应失败 (可能返回了 HTML): %w, 响应内容: %s", err, bodyStr)
	}

	// 检查订单状态
	if result.DeliveryEmail == "" {
		return fmt.Errorf("下单失败: 未分配邮箱，状态: %s", result.Status)
	}

	p.email = result.DeliveryEmail
	p.token = result.ServiceToken
	p.orderID = result.OrderNo
	p.mailboxEmail = result.DeliveryEmail // 非别名：收件箱就是自身
	p.created = true

	log.Printf("[Remail] 下单成功: %s (OrderNo: %s, Token: %s, Status: %s)", 
		p.email, p.orderID, p.token, result.Status)
	
	// 如果已经有验证码，记录一下
	if result.VerificationCode != "" {
		log.Printf("[Remail] 订单已包含验证码: %s", result.VerificationCode)
	}
	
	return nil
}

// GetAddress 获取邮箱地址
func (p *RemailProvider) GetAddress() (string, error) {
	if !p.created {
		return "", fmt.Errorf("邮箱尚未创建")
	}
	return p.email, nil
}

// WaitForCode 等待验证码
func (p *RemailProvider) WaitForCode(expectedFrom string, timeout time.Duration) (string, error) {
	if !p.created {
		return "", fmt.Errorf("邮箱尚未创建")
	}

	deadline := time.Now().Add(timeout)
	ticker := time.NewTicker(time.Duration(p.config.PollPeriod) * time.Second)
	defer ticker.Stop()

	log.Printf("[Remail] 开始轮询验证码，邮箱: %s, 超时: %v", p.email, timeout)

	for {
		select {
		case <-ticker.C:
			if time.Now().After(deadline) {
				return "", fmt.Errorf("等待验证码超时")
			}

			code, err := p.checkMessages(expectedFrom)
			if err != nil {
				log.Printf("[Remail] 检查邮件失败: %v", err)
				continue
			}

			if code != "" {
				log.Printf("[Remail] 收到验证码: %s", code)
				return code, nil
			}

		case <-time.After(timeout):
			return "", fmt.Errorf("等待验证码超时")
		}
	}
}

// refreshToken 刷新订单信息和token
func (p *RemailProvider) refreshToken() error {
	if p.orderID == "" {
		return fmt.Errorf("订单ID为空")
	}

	apiURL := strings.TrimRight(p.config.APIURL, "/")
	orderURL := fmt.Sprintf("%s/v1/open/orders/%s", apiURL, p.orderID)

	req, err := http.NewRequest("GET", orderURL, nil)
	if err != nil {
		return err
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.config.APIKey)
	req.Header.Set("User-Agent", "KiroX/1.0")

	resp, err := p.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	if resp.StatusCode != 200 {
		bodyStr := string(body)
		if len(bodyStr) > 200 {
			bodyStr = bodyStr[:200] + "..."
		}
		return fmt.Errorf("HTTP %d: %s, 响应: %s", resp.StatusCode, resp.Status, bodyStr)
	}

	var result RemailOrderDetailResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return fmt.Errorf("解析订单详情失败: %w", err)
	}

	// 检查订单状态
	if result.Status != "active" && result.Status != "pending_payment" {
		switch result.Status {
		case "refunded":
			return fmt.Errorf("订单已退款，邮箱已失效")
		case "expired":
			return fmt.Errorf("订单已过期，邮箱已失效")
		case "cancelled":
			return fmt.Errorf("订单已取消，邮箱已失效")
		default:
			return fmt.Errorf("订单状态异常: %s", result.Status)
		}
	}

	// 更新token
	if result.ServiceToken != "" {
		p.token = result.ServiceToken
		log.Printf("[Remail] Token已刷新: %s, 订单状态: %s", p.token, result.Status)
	}

	return nil
}

// checkMessages 检查邮件并提取验证码（使用取件通知 API）
// 别名账号：用主收件箱（mailboxEmail）的 token 拉取邮件，通过 Recipient 字段过滤属于该别名的邮件
func (p *RemailProvider) checkMessages(expectedFrom string) (string, error) {
	apiURL := strings.TrimRight(p.config.APIURL, "/")

	// 始终用真实收件箱地址和令牌查询
	pickupEmail := p.mailboxEmail
	if pickupEmail == "" {
		pickupEmail = p.email
	}
	messagesURL := fmt.Sprintf("%s/v1/pickup?email=%s&token=%s", apiURL, pickupEmail, p.token)

	req, err := http.NewRequest("GET", messagesURL, nil)
	if err != nil {
		return "", err
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.config.APIKey)
	req.Header.Set("User-Agent", "KiroX/1.0")

	resp, err := p.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	// 如果是401错误,尝试刷新token
	if resp.StatusCode == 401 {
		log.Printf("[Remail] Token失效(401),尝试刷新...")
		if refreshErr := p.refreshToken(); refreshErr != nil {
			return "", fmt.Errorf("Token失效且刷新失败: %w", refreshErr)
		}
		
		// 用新token重试
		messagesURL = fmt.Sprintf("%s/v1/pickup?email=%s&token=%s", apiURL, pickupEmail, p.token)
		req, err = http.NewRequest("GET", messagesURL, nil)
		if err != nil {
			return "", err
		}
		req.Header.Set("Accept", "application/json")
		req.Header.Set("Authorization", "Bearer "+p.config.APIKey)
		req.Header.Set("User-Agent", "KiroX/1.0")
		
		resp, err = p.client.Do(req)
		if err != nil {
			return "", err
		}
		defer resp.Body.Close()
		
		body, err = io.ReadAll(resp.Body)
		if err != nil {
			return "", err
		}
	}

	if resp.StatusCode != 200 && resp.StatusCode != 201 {
		bodyStr := string(body)
		if len(bodyStr) > 200 {
			bodyStr = bodyStr[:200] + "..."
		}
		return "", fmt.Errorf("HTTP %d: %s, 响应: %s", resp.StatusCode, resp.Status, bodyStr)
	}

	var messagesResp RemailMessagesResponse
	if err := json.Unmarshal(body, &messagesResp); err != nil {
		bodyStr := string(body)
		if len(bodyStr) > 200 {
			bodyStr = bodyStr[:200] + "..."
		}
		return "", fmt.Errorf("解析响应失败 (可能返回了 HTML): %w, 响应: %s", err, bodyStr)
	}

	if len(messagesResp.Items) == 0 {
		return "", nil // 暂无邮件
	}

	// 判断是否为别名账号（email 含 + 号）
	isAlias := strings.Contains(strings.SplitN(p.email, "@", 2)[0], "+")
	targetEmail := strings.ToLower(p.email)

	// 时间窗口起点：createdAt 前推 30 秒作为安全余量，避免投递延迟导致遗漏
	windowStart := p.createdAt.Add(-30 * time.Second)

	log.Printf("[Remail] 收到 %d 封邮件，当前邮箱: %s, isAlias: %v, 时间窗口起点: %s",
		len(messagesResp.Items), p.email, isAlias, windowStart.Format("15:04:05"))

	// 遍历邮件列表，查找匹配的邮件
	for _, mail := range messagesResp.Items {
		log.Printf("[Remail] 检查邮件 - Recipient: %q, Sender: %q, ReceivedAt: %q, VerificationCode: %q",
			mail.Recipient, mail.Sender, mail.ReceivedAt, mail.VerificationCode)

		// 时间窗口过滤：只处理 createdAt 之后到达的邮件
		// ReceivedAt 格式通常为 RFC3339，解析失败则不过滤
		if mail.ReceivedAt != "" {
			if t, err := time.Parse(time.RFC3339, mail.ReceivedAt); err == nil {
				if t.Before(windowStart) {
					log.Printf("[Remail] 跳过（邮件早于时间窗口）: %s < %s", t.Format("15:04:05"), windowStart.Format("15:04:05"))
					continue
				}
			}
		}

		// 别名过滤：Recipient 非空时必须与注册邮箱地址匹配
		// Recipient 为空说明服务端未区分别名，退化为只靠时间窗口过滤
		if isAlias && mail.Recipient != "" {
			if !strings.EqualFold(mail.Recipient, targetEmail) {
				log.Printf("[Remail] 跳过（Recipient 不匹配）: %q != %q", mail.Recipient, targetEmail)
				continue
			}
		}

		// 检查发件人
		if expectedFrom != "" && !strings.Contains(strings.ToLower(mail.Sender), strings.ToLower(expectedFrom)) {
			continue
		}

		// 优先使用 API 已提取的验证码
		if mail.VerificationCode != "" {
			log.Printf("[Remail] 找到验证码（API已提取）: %s, 来自: %s, 收件人: %s", mail.VerificationCode, mail.Sender, mail.Recipient)
			return mail.VerificationCode, nil
		}

		// API 未提取时，从主题和预览中提取
		codeRegex := regexp.MustCompile(`(?i)(?:验证码|code|OTP|security code is)[：:\s]*([A-Z0-9]{6,8})`)

		if code := extractCodeFromText(mail.Subject, codeRegex); code != "" {
			log.Printf("[Remail] 从主题提取验证码: %s", code)
			return code, nil
		}

		if code := extractCodeFromText(mail.BodyPreview, codeRegex); code != "" {
			log.Printf("[Remail] 从预览文本提取验证码: %s", code)
			return code, nil
		}
	}

	return "", nil
}

// Cleanup 清理资源（接包模式自动释放，无需手动清理）
func (p *RemailProvider) Cleanup() error {
	// Remail 接包模式会自动释放资源
	log.Printf("[Remail] 邮箱 %s 使用完毕", p.email)
	return nil
}

// getRemailConfigPath 获取 Remail 配置文件路径
func getRemailConfigPath() string {
	return filepath.Join(storage.GetDataDir(), "remail.dat")
}

// GetRemailConfigs 获取所有 Remail 配置
func GetRemailConfigs() []RemailConfig {
	data, err := os.ReadFile(getRemailConfigPath())
	if err != nil {
		return []RemailConfig{}
	}

	var configs []RemailConfig
	if err := json.Unmarshal(data, &configs); err != nil {
		log.Printf("[Remail] 配置文件格式无效，已重置: %v", err)
		os.Remove(getRemailConfigPath())
		return []RemailConfig{}
	}

	return configs
}

// SaveRemailConfigs 保存 Remail 配置
func SaveRemailConfigs(configsJSON string) map[string]interface{} {
	var configs []RemailConfig
	if err := json.Unmarshal([]byte(configsJSON), &configs); err != nil {
		return map[string]interface{}{"error": "配置格式错误: " + err.Error()}
	}

	// 验证配置
	for i, cfg := range configs {
		if cfg.Name == "" {
			return map[string]interface{}{"error": fmt.Sprintf("第 %d 个配置缺少名称", i+1)}
		}
		if cfg.APIKey == "" {
			return map[string]interface{}{"error": fmt.Sprintf("配置 %s 缺少 API Key", cfg.Name)}
		}
		if cfg.ProjectID == 0 {
			return map[string]interface{}{"error": fmt.Sprintf("配置 %s 缺少项目ID", cfg.Name)}
		}
		if cfg.ProductID == 0 {
			return map[string]interface{}{"error": fmt.Sprintf("配置 %s 缺少产品ID", cfg.Name)}
		}
	}

	jsonData, _ := json.Marshal(configs)
	os.MkdirAll(filepath.Dir(getRemailConfigPath()), 0755)
	if err := os.WriteFile(getRemailConfigPath(), jsonData, 0600); err != nil {
		return map[string]interface{}{"error": "保存失败: " + err.Error()}
	}

	log.Printf("[Remail] 已保存 %d 个配置", len(configs))
	return map[string]interface{}{"success": true}
}

// TestRemailConnection 测试 Remail 连接
func TestRemailConnection(configJSON string) map[string]interface{} {
	var config RemailConfig
	if err := json.Unmarshal([]byte(configJSON), &config); err != nil {
		return map[string]interface{}{"success": false, "error": "配置格式错误: " + err.Error()}
	}

	// 尝试创建测试邮箱
	provider, err := NewRemailProvider(config, "test")
	if err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}

	email, _ := provider.GetAddress()
	provider.Cleanup()

	return map[string]interface{}{
		"success": true,
		"message": "连接成功",
		"email":   email,
	}
}

// GetRemailProjects 获取可用的项目和产品列表
func GetRemailProjects(apiURL, apiKey string) map[string]interface{} {
	if apiURL == "" {
		apiURL = "https://remail.aishop6.com"
	}
	// 去除末尾的斜杠
	apiURL = strings.TrimRight(apiURL, "/")
	
	if apiKey == "" {
		return map[string]interface{}{"success": false, "error": "API Key 不能为空"}
	}

	client := &http.Client{
		Timeout: 10 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			log.Printf("[Remail] 检测到重定向: %s -> %s", via[len(via)-1].URL.String(), req.URL.String())
			return nil
		},
	}

	// 获取项目列表
	fullURL := apiURL + "/v1/open/projects?offset=0&limit=100"
	req, err := http.NewRequest("GET", fullURL, nil)
	if err != nil {
		return map[string]interface{}{"success": false, "error": "请求失败: " + err.Error()}
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("User-Agent", "KiroX/1.0")

	log.Printf("[Remail] 请求完整 URL: %s", fullURL)
	if len(apiKey) > 10 {
		log.Printf("[Remail] Authorization: Bearer %s...", apiKey[:10])
	} else {
		log.Printf("[Remail] Authorization: Bearer %s", apiKey)
	}
	log.Printf("[Remail] Headers: %v", req.Header)

	resp, err := client.Do(req)
	if err != nil {
		return map[string]interface{}{"success": false, "error": "连接失败: " + err.Error()}
	}
	defer resp.Body.Close()

	log.Printf("[Remail] HTTP Status: %d %s", resp.StatusCode, resp.Status)

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return map[string]interface{}{"success": false, "error": "读取响应失败: " + err.Error()}
	}

	// 检查 HTTP 状态码
	if resp.StatusCode != 200 {
		bodyStr := string(body)
		if len(bodyStr) > 500 {
			bodyStr = bodyStr[:500] + "..."
		}
		log.Printf("[Remail] HTTP 错误: %d, 响应: %s", resp.StatusCode, bodyStr)
		return map[string]interface{}{
			"success":    false,
			"error":      fmt.Sprintf("HTTP %d: %s", resp.StatusCode, resp.Status),
			"statusCode": resp.StatusCode,
			"raw":        bodyStr,
		}
	}

	// 解析响应
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		bodyStr := string(body)
		if len(bodyStr) > 500 {
			bodyStr = bodyStr[:500] + "..."
		}
		log.Printf("[Remail] JSON 解析失败: %v, 响应: %s", err, bodyStr)
		return map[string]interface{}{
			"success": false,
			"error":   fmt.Sprintf("解析响应失败 (可能返回了 HTML): %v", err),
			"raw":     bodyStr,
		}
	}

	// 检查响应是否成功
	if success, ok := result["success"].(bool); ok && !success {
		errMsg := "未知错误"
		if msg, ok := result["message"].(string); ok {
			errMsg = msg
		}
		return map[string]interface{}{"success": false, "error": errMsg}
	}

	log.Printf("[Remail] 成功获取项目列表")
	return map[string]interface{}{
		"success": true,
		"data":    result,
	}
}

// GetRemailProjectDetail 获取项目详情（包含产品列表）
func GetRemailProjectDetail(apiURL, apiKey string, projectID int) map[string]interface{} {
	if apiURL == "" {
		apiURL = "https://remail.aishop6.com"
	}
	if apiKey == "" {
		return map[string]interface{}{"success": false, "error": "API Key 不能为空"}
	}

	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	// 获取项目详情
	projectURL := fmt.Sprintf("%s/v1/open/projects/%d", apiURL, projectID)
	req, err := http.NewRequest("GET", projectURL, nil)
	if err != nil {
		return map[string]interface{}{"success": false, "error": "请求失败: " + err.Error()}
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	log.Printf("[Remail] 请求项目详情 URL: %s", projectURL)

	resp, err := client.Do(req)
	if err != nil {
		return map[string]interface{}{"success": false, "error": "连接失败: " + err.Error()}
	}
	defer resp.Body.Close()

	log.Printf("[Remail] HTTP Status: %d %s", resp.StatusCode, resp.Status)

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return map[string]interface{}{"success": false, "error": "读取响应失败: " + err.Error()}
	}

	// 检查 HTTP 状态码
	if resp.StatusCode != 200 {
		bodyStr := string(body)
		if len(bodyStr) > 500 {
			bodyStr = bodyStr[:500] + "..."
		}
		log.Printf("[Remail] HTTP 错误: %d, 响应: %s", resp.StatusCode, bodyStr)
		return map[string]interface{}{
			"success":    false,
			"error":      fmt.Sprintf("HTTP %d: %s", resp.StatusCode, resp.Status),
			"statusCode": resp.StatusCode,
			"raw":        bodyStr,
		}
	}

	// 解析响应
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		bodyStr := string(body)
		if len(bodyStr) > 500 {
			bodyStr = bodyStr[:500] + "..."
		}
		log.Printf("[Remail] JSON 解析失败: %v, 响应: %s", err, bodyStr)
		return map[string]interface{}{
			"success": false,
			"error":   fmt.Sprintf("解析响应失败 (可能返回了 HTML): %v", err),
			"raw":     bodyStr,
		}
	}

	// 检查响应是否成功
	if success, ok := result["success"].(bool); ok && !success {
		errMsg := "未知错误"
		if msg, ok := result["message"].(string); ok {
			errMsg = msg
		}
		return map[string]interface{}{"success": false, "error": errMsg}
	}

	log.Printf("[Remail] 成功获取项目详情")
	return map[string]interface{}{
		"success": true,
		"data":    result,
	}
}

// GetRemailOrderDetail 获取订单详情
func GetRemailOrderDetail(apiURL, apiKey, orderID string) map[string]interface{} {
	if apiURL == "" {
		apiURL = "https://remail.aishop6.com"
	}
	// 去除末尾的斜杠
	apiURL = strings.TrimRight(apiURL, "/")
	
	if apiKey == "" {
		return map[string]interface{}{"success": false, "error": "API Key 不能为空"}
	}
	if orderID == "" {
		return map[string]interface{}{"success": false, "error": "订单ID 不能为空"}
	}

	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	// 获取订单详情
	orderURL := fmt.Sprintf("%s/v1/open/orders/%s", apiURL, orderID)
	req, err := http.NewRequest("GET", orderURL, nil)
	if err != nil {
		return map[string]interface{}{"success": false, "error": "请求失败: " + err.Error()}
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("User-Agent", "KiroX/1.0")

	log.Printf("[Remail] 请求订单详情 URL: %s", orderURL)

	resp, err := client.Do(req)
	if err != nil {
		return map[string]interface{}{"success": false, "error": "连接失败: " + err.Error()}
	}
	defer resp.Body.Close()

	log.Printf("[Remail] HTTP Status: %d %s", resp.StatusCode, resp.Status)

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return map[string]interface{}{"success": false, "error": "读取响应失败: " + err.Error()}
	}

	// 检查 HTTP 状态码
	if resp.StatusCode != 200 {
		bodyStr := string(body)
		if len(bodyStr) > 500 {
			bodyStr = bodyStr[:500] + "..."
		}
		log.Printf("[Remail] HTTP 错误: %d, 响应: %s", resp.StatusCode, bodyStr)
		return map[string]interface{}{
			"success":    false,
			"error":      fmt.Sprintf("HTTP %d: %s", resp.StatusCode, resp.Status),
			"statusCode": resp.StatusCode,
			"raw":        bodyStr,
		}
	}

	// 解析响应
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		bodyStr := string(body)
		if len(bodyStr) > 500 {
			bodyStr = bodyStr[:500] + "..."
		}
		log.Printf("[Remail] JSON 解析失败: %v, 响应: %s", err, bodyStr)
		return map[string]interface{}{
			"success": false,
			"error":   fmt.Sprintf("解析响应失败 (可能返回了 HTML): %v", err),
			"raw":     bodyStr,
		}
	}

	// 检查响应是否成功
	if success, ok := result["success"].(bool); ok && !success {
		errMsg := "未知错误"
		if msg, ok := result["message"].(string); ok {
			errMsg = msg
		}
		return map[string]interface{}{"success": false, "error": errMsg}
	}

	log.Printf("[Remail] 成功获取订单详情")
	return map[string]interface{}{
		"success": true,
		"data":    result,
	}
}
