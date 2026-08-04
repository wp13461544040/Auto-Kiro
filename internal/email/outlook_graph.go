package email

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/wp13461544040/Auto-Kiro/internal/storage"
)

type outlookGraphBody struct {
	ContentType string `json:"contentType"`
	Content     string `json:"content"`
}

type outlookGraphMessage struct {
	Subject          string                       `json:"subject"`
	BodyPreview      string                       `json:"bodyPreview"`
	Body             outlookGraphBody             `json:"body"`
	ReceivedDateTime string                       `json:"receivedDateTime"`
	ToRecipients     []outlookGraphRecipient      `json:"toRecipients"`
}

type outlookGraphRecipient struct {
	EmailAddress outlookGraphEmailAddress `json:"emailAddress"`
}

type outlookGraphEmailAddress struct {
	Address string `json:"address"`
}

func (m outlookGraphMessage) searchText() string {
	return strings.Join([]string{m.BodyPreview, m.Subject, m.Body.Content}, "\n")
}

// deliveredTo 返回邮件所有收件人地址（小写）
func (m outlookGraphMessage) deliveredTo() []string {
	addrs := make([]string, 0, len(m.ToRecipients))
	for _, r := range m.ToRecipients {
		if r.EmailAddress.Address != "" {
			addrs = append(addrs, strings.ToLower(r.EmailAddress.Address))
		}
	}
	return addrs
}

type outlookGraphMessagesResponse struct {
	Value []outlookGraphMessage `json:"value"`
}

type outlookGraphFolderResponse struct {
	TotalItemCount int `json:"totalItemCount"`
}

func refreshOutlookGraphToken(acc OutlookAccount) (string, error) {
	form := url.Values{
		"client_id":     {acc.ClientID},
		"refresh_token": {acc.RefreshToken},
		"grant_type":    {"refresh_token"},
		"scope":         {"https://graph.microsoft.com/Mail.Read offline_access"},
	}

	proxyURL := storage.GetProxy()
	tryPost := func(p string) (*http.Response, error) {
		client := httpClientWithProxy(p, 30*time.Second)
		return client.Post(
			"https://login.microsoftonline.com/common/oauth2/v2.0/token",
			"application/x-www-form-urlencoded",
			strings.NewReader(form.Encode()),
		)
	}

	resp, err := tryPost(proxyURL)
	if err != nil && proxyURL != "" {
		resp, err = tryPost("")
	}
	if err != nil {
		return "", fmt.Errorf("请求失败: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("刷新失败 %d: %s", resp.StatusCode, string(body[:min(300, len(body))]))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", err
	}
	token, _ := result["access_token"].(string)
	if token == "" {
		return "", fmt.Errorf("响应中无 access_token")
	}
	return token, nil
}

func outlookGraphGet(accessToken, path string, out interface{}) error {
	client := httpClientWithProxy(storage.GetProxy(), 30*time.Second)
	req, err := http.NewRequest("GET", "https://graph.microsoft.com/v1.0"+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Prefer", `outlook.body-content-type="text"`)

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("Graph 请求失败 %d: %s", resp.StatusCode, string(body[:min(300, len(body))]))
	}
	return json.Unmarshal(body, out)
}

func getInboxCountGraph(acc OutlookAccount) (int, error) {
	accessToken, err := refreshOutlookGraphToken(acc)
	if err != nil {
		return 0, fmt.Errorf("刷新 Graph Token 失败: %v", err)
	}
	return getInboxCountGraphWithToken(accessToken)
}

func getInboxCountGraphWithToken(accessToken string) (int, error) {
	var folder outlookGraphFolderResponse
	if err := outlookGraphGet(accessToken, "/me/mailFolders/inbox?$select=totalItemCount", &folder); err != nil {
		return 0, err
	}
	return folder.TotalItemCount, nil
}

func waitForOTPGraph(acc OutlookAccount, timeout, interval int, codeRegex *regexp.Regexp) (string, error) {
	accessToken, err := refreshOutlookGraphToken(acc)
	if err != nil {
		return "", fmt.Errorf("刷新 Graph Token 失败: %v", err)
	}

	// 是否为别名账号（含 + 号），需过滤 To 字段
	isAlias := strings.Contains(strings.SplitN(acc.Email, "@", 2)[0], "+")
	targetEmail := strings.ToLower(acc.Email)

	// 时间窗口：拉取最近 3 分钟内收到的邮件（往前推留余量，避免发送/投递延迟导致遗漏）
	startTime := time.Now().Add(-2 * time.Minute)

	maxRetries := timeout / interval
	for attempt := 1; attempt <= maxRetries; attempt++ {
		// 用 $filter 只拉取 startTime 之后收到的邮件
		filterTime := startTime.UTC().Format("2006-01-02T15:04:05Z")
		path := fmt.Sprintf("/me/mailFolders/inbox/messages?$filter=receivedDateTime ge %s&$orderby=receivedDateTime desc&$top=20", filterTime)
		var messages outlookGraphMessagesResponse
		if err := outlookGraphGet(accessToken, path, &messages); err != nil {
			return "", err
		}
		if len(messages.Value) == 0 {
			if attempt%5 == 0 {
				log.Printf("[Outlook Graph] [%d/%d] 暂无最近邮件...", attempt, maxRetries)
			}
			time.Sleep(time.Duration(interval) * time.Second)
			continue
		}

		for _, msg := range messages.Value {
			// 别名账号：要求 To 中包含该别名地址，防止取到其他子账号的验证码
			if isAlias {
				matched := false
				for _, addr := range msg.deliveredTo() {
					if addr == targetEmail {
						matched = true
						break
					}
				}
				if !matched {
					continue
				}
			}
			if code := extractCodeFromText(msg.searchText(), codeRegex); code != "" {
				log.Printf("[Outlook Graph] 获取到验证码: %s", code)
				return code, nil
			}
		}

		if attempt%5 == 0 {
			log.Printf("[Outlook Graph] [%d/%d] 最近邮件中未找到验证码...", attempt, maxRetries)
		}
		time.Sleep(time.Duration(interval) * time.Second)
	}
	return "", fmt.Errorf("等待验证码超时 (%ds)", timeout)
}
