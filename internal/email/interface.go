package email

import (
	"log"
	"time"
)

// TempEmailService 临时邮箱服务接口
type TempEmailService interface {
	// Create 创建临时邮箱，返回邮箱地址
	Create() string

	// WaitForCode 等待验证码，返回验证码字符串
	WaitForCode(timeoutSec, intervalSec int) (string, error)

	// GetAddress 获取当前邮箱地址
	GetAddress() string
}

// moEmailAdapter 适配器，将 MoeMailProvider 包装为 TempEmailService
type moEmailAdapter struct {
	baseURL  string
	apiKey   string
	provider *MoeMailProvider
}

// NewMoEmailService 创建 MoEmail 临时邮箱服务（兼容 reg_go 核心调用）
func NewMoEmailService(baseURL, apiKey string) TempEmailService {
	return &moEmailAdapter{
		baseURL: baseURL,
		apiKey:  apiKey,
	}
}

// NewMoEmailServiceFromProvider 用已创建的 MoeMailProvider 构造 TempEmailService
func NewMoEmailServiceFromProvider(provider *MoeMailProvider) TempEmailService {
	return &moEmailAdapter{provider: provider}
}

// Create 创建临时邮箱
func (a *moEmailAdapter) Create() string {
	config := MoeMailConfig{
		Name:   "auto",
		URL:    a.baseURL,
		APIKey: a.apiKey,
	}

	// 获取可用域名
	client := NewMoeMailClient(config)
	sysConfig, err := client.GetSystemConfig()
	if err != nil {
		log.Printf("[MoEmail] 获取系统配置失败: %v", err)
		return ""
	}
	if len(sysConfig.Domains) == 0 {
		log.Printf("[MoEmail] 没有可用域名")
		return ""
	}

	domain := sysConfig.Domains[0]
	name := GenerateEmailName(0)

	provider, err := NewMoeMailProvider(config, name, 3600000, domain)
	if err != nil {
		log.Printf("[MoEmail] 创建邮箱失败: %v", err)
		return ""
	}

	a.provider = provider
	return provider.GetAddress()
}

// WaitForCode 等待验证码
func (a *moEmailAdapter) WaitForCode(timeout, interval int) (string, error) {
	if a.provider == nil {
		return "", nil
	}
	return a.provider.WaitForCode(timeout, interval)
}

// GetAddress 获取邮箱地址
func (a *moEmailAdapter) GetAddress() string {
	if a.provider == nil {
		return ""
	}
	return a.provider.GetAddress()
}

// cloudMailAdapter 适配器，将 CloudMailProvider 包装为 TempEmailService
type cloudMailAdapter struct {
	provider *CloudMailProvider
}

// NewCloudMailService 用已创建的 CloudMailProvider 构造 TempEmailService
func NewCloudMailService(provider *CloudMailProvider) TempEmailService {
	return &cloudMailAdapter{provider: provider}
}

// Create 已在 NewCloudMailProvider 时创建好，直接返回地址
func (a *cloudMailAdapter) Create() string {
	if a.provider == nil {
		return ""
	}
	return a.provider.GetAddress()
}

// WaitForCode 等待验证码
func (a *cloudMailAdapter) WaitForCode(timeout, interval int) (string, error) {
	if a.provider == nil {
		return "", nil
	}
	return a.provider.WaitForCode(timeout, interval)
}

// GetAddress 获取邮箱地址
func (a *cloudMailAdapter) GetAddress() string {
	if a.provider == nil {
		return ""
	}
	return a.provider.GetAddress()
}

// mailNestEmailAdapter 适配器
type mailNestEmailAdapter struct {
	provider *MailNestProvider
}

// NeMailNestServiceFromProvider 用已创建的 MailNestProvider 构造 TempEmailService
func NeMailNestServiceFromProvider(provider *MailNestProvider) TempEmailService {
	return &mailNestEmailAdapter{provider: provider}
}

// Create 发请求获取 email
func (a *mailNestEmailAdapter) Create() string {
	if a.provider == nil {
		return ""
	}
	address, err := a.provider.GetAddress()
	if err != nil {
		log.Print(err)
		return ""
	}
	return address
}

// WaitForCode 等待验证码
func (a *mailNestEmailAdapter) WaitForCode(timeout, interval int) (string, error) {
	if a.provider == nil {
		return "", nil
	}
	return a.provider.WaitForCode(timeout, interval)
}

// GetAddress 获取邮箱地址
func (a *mailNestEmailAdapter) GetAddress() string {
	if a.provider == nil {
		return ""
	}
	address, err := a.provider.GetAddress()
	if err != nil {
		log.Print(err)
		return ""
	}
	return address
}

// remailAdapter 适配器，将 RemailProvider 包装为 TempEmailService
type remailAdapter struct {
	provider *RemailProvider
}

// NewRemailServiceFromProvider 用已创建的 RemailProvider 构造 TempEmailService
func NewRemailServiceFromProvider(provider *RemailProvider) TempEmailService {
	return &remailAdapter{provider: provider}
}

// Create Remail 已在 NewRemailProvider 时创建好，直接返回地址
func (a *remailAdapter) Create() string {
	if a.provider == nil {
		return ""
	}
	address, err := a.provider.GetAddress()
	if err != nil {
		log.Printf("[Remail] 获取邮箱地址失败: %v", err)
		return ""
	}
	return address
}

// WaitForCode 等待验证码
func (a *remailAdapter) WaitForCode(timeout, interval int) (string, error) {
	if a.provider == nil {
		return "", nil
	}
	// Remail 的 WaitForCode 参数不同，需要转换
	// timeout 单位是秒，interval 也是秒
	// Remail 期望 expectedFrom 和 timeout 是 time.Duration
	return a.provider.WaitForCode("", time.Duration(timeout)*time.Second)
}

// GetAddress 获取邮箱地址
func (a *remailAdapter) GetAddress() string {
	if a.provider == nil {
		return ""
	}
	address, err := a.provider.GetAddress()
	if err != nil {
		log.Printf("[Remail] 获取邮箱地址失败: %v", err)
		return ""
	}
	return address
}
