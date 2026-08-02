package subscription

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/google/uuid"

	fhttp "github.com/bogdanfinn/fhttp"
	httputil "reg_go/internal/http"
)

const (
	subscriptionVersion = "0.12.155"
	defaultProfileARN   = "arn:aws:codewhisperer:us-east-1:638616132270:profile/AAAACCCCXXXX"
	socialProfileARN    = "arn:aws:codewhisperer:us-east-1:699475941385:profile/EHGA3GRVQMUK"
)

// Plan 订阅计划
type Plan struct {
	Name              string                 `json:"name"`
	QSubscriptionType string                 `json:"qSubscriptionType"`
	Description       map[string]interface{} `json:"description"`
	Pricing           map[string]interface{} `json:"pricing"`
}

// Account kirox 输出账号的最小字段
type Account struct {
	Email        string `json:"email"`
	RefreshToken string `json:"refreshToken"`
	ClientID     string `json:"clientId"`
	ClientSecret string `json:"clientSecret"`
	Region       string `json:"region"`
	Provider     string `json:"provider"`
	Time         string `json:"time,omitempty"`
	Subscription string `json:"subscription,omitempty"`
}

func qEndpoint(region string) string {
	if strings.HasPrefix(region, "eu-") {
		return "https://q.eu-central-1.amazonaws.com"
	}
	return "https://q.us-east-1.amazonaws.com"
}

func oidcEndpoint(region string) string {
	if region == "" {
		region = "us-east-1"
	}
	return fmt.Sprintf("https://oidc.%s.amazonaws.com/token", region)
}

func stableMachineID(email string) string {
	h := sha256.Sum256([]byte("kiro-device-" + email))
	return hex.EncodeToString(h[:])
}

func profileARN(provider string) string {
	if provider == "Github" || provider == "Google" {
		return socialProfileARN
	}
	return defaultProfileARN
}

func subUA(machineID string) string {
	return fmt.Sprintf("aws-sdk-js/1.0.0 ua/2.1 os/win32#10.0.19043 lang/js md/nodejs#22.22.0 api/codewhispererruntime#1.0.0 m/N,E KiroIDE-%s-%s", subscriptionVersion, machineID)
}

func subAmzUA(machineID string) string {
	return fmt.Sprintf("aws-sdk-js/1.0.0 KiroIDE-%s-%s", subscriptionVersion, machineID)
}

// RefreshAccessToken 用 refreshToken 换 accessToken
func RefreshAccessToken(acc Account) (string, error) {
	body, _ := json.Marshal(map[string]string{
		"clientId":     acc.ClientID,
		"clientSecret": acc.ClientSecret,
		"refreshToken": acc.RefreshToken,
		"grantType":    "refresh_token",
	})
	client := httputil.NewTLSClient("", true)
	req, _ := fhttp.NewRequest("POST", oidcEndpoint(acc.Region), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("刷新 token 失败 HTTP %d: %s", resp.StatusCode, truncate(string(respBody), 1000))
	}
	var tok map[string]interface{}
	if err := json.Unmarshal(respBody, &tok); err != nil {
		return "", fmt.Errorf("解析 token 响应失败: %w", err)
	}
	at, _ := tok["accessToken"].(string)
	if at == "" {
		return "", fmt.Errorf("响应缺少 accessToken")
	}
	return at, nil
}

func doSubscriptionPost(acc Account, accessToken, path string, payload map[string]interface{}) ([]byte, int, error) {
	machineID := stableMachineID(acc.Email)
	url := qEndpoint(acc.Region) + path

	body, _ := json.Marshal(payload)
	client := httputil.NewTLSClient("", true)
	req, _ := fhttp.NewRequest("POST", url, bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("user-agent", subUA(machineID))
	req.Header.Set("x-amz-user-agent", subAmzUA(machineID))
	req.Header.Set("amz-sdk-invocation-id", uuid.NewString())
	req.Header.Set("amz-sdk-request", "attempt=1; max=1")

	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	return respBody, resp.StatusCode, nil
}

// ListPlans 拉取账号可用的订阅计划
func ListPlans(acc Account, accessToken string) ([]Plan, error) {
	body, status, err := doSubscriptionPost(acc, accessToken, "/listAvailableSubscriptions", map[string]interface{}{
		"profileArn": profileARN(acc.Provider),
	})
	if err != nil {
		return nil, err
	}
	if status != 200 {
		return nil, fmt.Errorf("HTTP %d: %s", status, truncate(string(body), 1000))
	}
	var resp struct {
		SubscriptionPlans []Plan `json:"subscriptionPlans"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("解析计划列表失败: %w", err)
	}
	return resp.SubscriptionPlans, nil
}

// CreateSubscriptionLink 取支付/试用链接
func CreateSubscriptionLink(acc Account, accessToken, subscriptionType string) (string, error) {
	payload := map[string]interface{}{
		"clientToken": uuid.NewString(),
		"profileArn":  profileARN(acc.Provider),
		"provider":    "STRIPE",
	}
	if subscriptionType != "" {
		payload["subscriptionType"] = subscriptionType
	}
	body, status, err := doSubscriptionPost(acc, accessToken, "/CreateSubscriptionToken", payload)
	if err != nil {
		return "", err
	}
	if status != 200 {
		var errResp map[string]interface{}
		_ = json.Unmarshal(body, &errResp)
		msg, _ := errResp["message"].(string)
		// 对常见错误附加可操作提示
		hint := ""
		switch {
		case status == 403:
			hint = "（账号已被封禁）"
		case status == 400 && strings.Contains(strings.ToLower(msg), "already"):
			hint = "（账号已存在订阅）"
		}
		if msg != "" {
			return "", fmt.Errorf("HTTP %d: %s%s", status, msg, hint)
		}
		return "", fmt.Errorf("HTTP %d: %s%s", status, truncate(string(body), 1000), hint)
	}
	var resp struct {
		EncodedVerificationURL string `json:"encodedVerificationUrl"`
		Message                string `json:"message"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return "", fmt.Errorf("解析响应失败: %w", err)
	}
	if resp.EncodedVerificationURL == "" {
		if resp.Message != "" {
			return "", fmt.Errorf("%s", resp.Message)
		}
		return "", fmt.Errorf("响应未返回支付链接")
	}
	return resp.EncodedVerificationURL, nil
}

// SetOverage 开启/关闭超额
func SetOverage(acc Account, accessToken string, enabled bool) error {
	status := "DISABLED"
	if enabled {
		status = "ENABLED"
	}
	payload := map[string]interface{}{
		"overageConfiguration": map[string]string{"overageStatus": status},
		"profileArn":           profileARN(acc.Provider),
	}
	body, code, err := doSubscriptionPost(acc, accessToken, "/setUserPreference", payload)
	if err != nil {
		return err
	}
	if code != 200 {
		return fmt.Errorf("HTTP %d: %s", code, truncate(string(body), 1000))
	}
	return nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// IsSuspended 根据错误信息判断账号是否被封禁。
// 上游可能以 403 携带 "temporarily is suspended" / "AccountSuspendedException" / "locked your account" / "not authorized" 等返回；
// 也可能直接 423。对订阅类接口而言，所有 403 实际都视为账号封禁。
func IsSuspended(err error) bool {
	if err == nil {
		return false
	}
	s := strings.ToLower(err.Error())
	return strings.Contains(s, "http 403") ||
		strings.Contains(s, "accountsuspendedexception") ||
		strings.Contains(s, "account suspended") ||
		strings.Contains(s, "temporarily is suspended") ||
		strings.Contains(s, "temporarily suspended") ||
		strings.Contains(s, "locked your account") ||
		strings.Contains(s, "not authorized to access this feature") ||
		strings.Contains(s, "已封禁") ||
		strings.Contains(s, "http 423")
}
