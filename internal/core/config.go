package core

import (
	"math/rand"
	"strings"

	"github.com/wp13461544040/Auto-Kiro/internal/email"
)

// Config 注册配置
type Config struct {
	OIDCBase    string
	SigninBase  string
	ProfileBase string
	ViewBase    string
	PortalBase  string
	DirectoryID string
	StartURL    string

	KiroBase        string
	KiroRedirectURI string

	Password string
	FullName string

	Proxy string
	Debug bool

	EmailProvider  string
	UseOutlook     bool
	OutlookAccount *email.OutlookAccount

	UseMoeMail      bool
	MoeMailConfig   *email.MoeMailConfig
	MoeMailProvider *email.MoeMailProvider

	UseCloudMail      bool
	CloudMailConfig   *email.CloudMailConfig
	CloudMailProvider *email.CloudMailProvider

	UseMailNest      bool
	MailNestConfig   *email.MailNestConfig
	MailNestProvider *email.MailNestProvider

	UseRemail      bool
	RemailConfig   *email.RemailConfig
	RemailProvider *email.RemailProvider

	MoEmailBaseURL string
	MoEmailAPIKey  string
}

// NewConfig 创建默认配置
func NewConfig() *Config {
	return &Config{
		OIDCBase:        "https://oidc.us-east-1.amazonaws.com",
		SigninBase:      "https://us-east-1.signin.aws",
		ProfileBase:     "https://profile.aws.amazon.com",
		ViewBase:        "https://view.awsapps.com",
		PortalBase:      "https://portal.sso.us-east-1.amazonaws.com",
		DirectoryID:     "d-9067642ac7",
		StartURL:        "https://view.awsapps.com/start",
		KiroBase:        "https://app.kiro.dev",
		KiroRedirectURI: "https://app.kiro.dev/signin/oauth",
		Password:        GenPassword(),
		FullName:        "Test User",
	}
}

// GenPassword 生成随机密码
// 满足 Outlook 要求: 8-64字符,包含大写、小写、数字和特殊字符
func GenPassword() string {
	upper := "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
	lower := "abcdefghijklmnopqrstuvwxyz"
	digits := "0123456789"
	// 使用 Outlook 明确支持的特殊字符
	special := "!@#$%^&*()-_=+[]{}|;:,.<>?"

	var b strings.Builder
	// 确保至少包含每种字符类型
	// 3个大写
	for i := 0; i < 3; i++ {
		b.WriteByte(upper[rand.Intn(len(upper))])
	}
	// 6个小写
	for i := 0; i < 6; i++ {
		b.WriteByte(lower[rand.Intn(len(lower))])
	}
	// 3个数字
	for i := 0; i < 3; i++ {
		b.WriteByte(digits[rand.Intn(len(digits))])
	}
	// 2个特殊字符
	for i := 0; i < 2; i++ {
		b.WriteByte(special[rand.Intn(len(special))])
	}
	
	// 打乱顺序
	pw := []byte(b.String())
	rand.Shuffle(len(pw), func(i, j int) { pw[i], pw[j] = pw[j], pw[i] })
	
	password := string(pw) // 总长度14位,满足8-64要求
	
	// 验证密码强度
	if !ValidatePassword(password) {
		// 递归重试(理论上不会失败,因为已经确保包含所有类型)
		return GenPassword()
	}
	
	return password
}

// ValidatePassword 验证密码是否符合 Outlook 要求
// 要求: 8-64字符,必须包含大写、小写、数字、特殊字符
func ValidatePassword(password string) bool {
	if len(password) < 8 || len(password) > 64 {
		return false
	}
	
	hasUpper := false
	hasLower := false
	hasDigit := false
	hasSpecial := false
	
	for _, ch := range password {
		switch {
		case ch >= 'A' && ch <= 'Z':
			hasUpper = true
		case ch >= 'a' && ch <= 'z':
			hasLower = true
		case ch >= '0' && ch <= '9':
			hasDigit = true
		case !((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')):
			hasSpecial = true
		}
	}
	
	return hasUpper && hasLower && hasDigit && hasSpecial
}
