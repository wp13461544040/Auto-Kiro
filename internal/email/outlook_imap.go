package email

import (
	"bufio"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/wp13461544040/Auto-Kiro/internal/storage"
)

// OutlookAccount Outlook 邮箱账号
type OutlookAccount struct {
	Email        string // 注册/收件用的地址（可以是别名，如 user+tag@outlook.com）
	Password     string
	ClientID     string
	RefreshToken string
	Mode         string
	MailboxEmail string // IMAP/Graph 登录用的主账号地址（别名账号时不同于 Email）
}

// mailboxEmail 返回用于 IMAP 认证的真实 mailbox 地址
// 别名账号（含 +）必须用主账号地址登录，否则服务器报 "not connected"
func (a OutlookAccount) mailboxEmail() string {
	if a.MailboxEmail != "" {
		return a.MailboxEmail
	}
	return a.Email
}

// ParseOutlookCSV 解析 outlook.csv
func ParseOutlookCSV(path string) ([]OutlookAccount, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var accounts []OutlookAccount
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		acc, ok := parseOutlookAccountLine(line)
		if !ok {
			log.Printf("跳过格式错误的行: %s", line[:min(50, len(line))])
			continue
		}
		accounts = append(accounts, acc)
	}
	return accounts, nil
}

// ParseOutlookLines 从文本内容直接解析 Outlook 账号 (Web UI 使用)
// 支持两种格式:
// 1. 换行分隔: 每行一个账号
// 2. 空格分隔: 账号之间用空格隔开
func ParseOutlookLines(data string) []OutlookAccount {
	var accounts []OutlookAccount
	data = strings.TrimSpace(data)
	if data == "" {
		return accounts
	}

	// 先尝试按换行分割
	lines := strings.Split(data, "\n")

	// 如果只有一行，可能是空格分隔的格式
	if len(lines) == 1 {
		// 尝试按空格分割（账号格式: email----password----clientid----token）
		// 每个账号以空格结尾，下一个账号开始
		parts := strings.Fields(data) // Fields 会按空白字符分割并去除空白
		for _, part := range parts {
			part = strings.TrimSpace(part)
			if part == "" {
				continue
			}
			if acc, ok := parseOutlookAccountLine(part); ok {
				accounts = append(accounts, acc)
			}
		}
	} else {
		// 多行格式，按行解析
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			if acc, ok := parseOutlookAccountLine(line); ok {
				accounts = append(accounts, acc)
			}
		}
	}

	return accounts
}

func parseOutlookAccountLine(line string) (OutlookAccount, bool) {
	parts := strings.SplitN(strings.TrimSpace(line), "----", 5)
	if len(parts) != 4 && len(parts) != 5 {
		return OutlookAccount{}, false
	}
	mode := "imap"
	if len(parts) == 5 {
		mode = normalizeOutlookMode(parts[4])
	}
	return OutlookAccount{
		Email:        strings.TrimSpace(parts[0]),
		Password:     strings.TrimSpace(parts[1]),
		ClientID:     strings.TrimSpace(parts[2]),
		RefreshToken: strings.TrimSpace(parts[3]),
		Mode:         mode,
	}, true
}

func normalizeOutlookMode(mode string) string {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "graph":
		return "graph"
	default:
		return "imap"
	}
}

func (a OutlookAccount) mailMode() string {
	return normalizeOutlookMode(a.Mode)
}

// RefreshOutlookToken 用 refresh_token 获取 access_token（优先走全局代理，失败时降级直连）
// 注意：token 刷新与邮箱地址无关，只需 clientId + refreshToken
func RefreshOutlookToken(acc OutlookAccount) (string, error) {
	form := url.Values{
		"client_id":     {acc.ClientID},
		"refresh_token": {acc.RefreshToken},
		"grant_type":    {"refresh_token"},
		"scope":         {"https://outlook.office.com/IMAP.AccessAsUser.All offline_access"},
	}

	proxyURL := storage.GetProxy()
	tryPost := func(p string) (resp *http.Response, err error) {
		client := httpClientWithProxy(p, 30*time.Second)
		return client.Post(
			"https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
			"application/x-www-form-urlencoded",
			strings.NewReader(form.Encode()),
		)
	}
	resp, err := tryPost(proxyURL)
	if err != nil && proxyURL != "" {
		log.Printf("[Outlook OAuth] 代理请求失败，降级直连：%v", err)
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
	json.Unmarshal(body, &result)
	token, _ := result["access_token"].(string)
	if token == "" {
		return "", fmt.Errorf("响应中无 access_token")
	}
	return token, nil
}

// buildXOAuth2 构建 XOAUTH2 认证字符串
func buildXOAuth2(email, accessToken string) string {
	auth := fmt.Sprintf("user=%s\x01auth=Bearer %s\x01\x01", email, accessToken)
	return base64.StdEncoding.EncodeToString([]byte(auth))
}

// imapClient 简易 IMAP 客户端
type imapClient struct {
	conn   net.Conn
	reader *bufio.Reader
	tag    int
}

// newIMAPClient 连接 Outlook IMAP（优先走全局代理，代理被封端口时自动降级直连）
func newIMAPClient() (*imapClient, error) {
	const target = "outlook.office365.com:993"
	proxyURL := storage.GetProxy()
	rawConn, err := dialThroughProxy(proxyURL, "tcp", target, 15*time.Second)
	if err != nil && proxyURL != "" {
		log.Printf("[IMAP] 代理拨号失败，降级直连：%v", err)
		rawConn, err = dialThroughProxy("", "tcp", target, 15*time.Second)
	}
	if err != nil {
		return nil, fmt.Errorf("连接失败: %v", err)
	}
	tlsConfig := &tls.Config{ServerName: "outlook.office365.com"}
	conn := tls.Client(rawConn, tlsConfig)
	if err := conn.SetDeadline(time.Now().Add(15 * time.Second)); err == nil {
		err = conn.Handshake()
		conn.SetDeadline(time.Time{})
		if err != nil {
			conn.Close()
			return nil, fmt.Errorf("TLS 握手失败: %v", err)
		}
	}

	c := &imapClient{conn: conn, reader: bufio.NewReader(conn), tag: 0}
	greeting, err := c.readLine()
	if err != nil {
		conn.Close()
		return nil, err
	}
	log.Printf("[IMAP] %s", greeting)
	return c, nil
}

func (c *imapClient) sendCommand(cmd string) (string, error) {
	c.tag++
	tagStr := fmt.Sprintf("A%03d", c.tag)
	line := fmt.Sprintf("%s %s\r\n", tagStr, cmd)
	// 设置写超时
	c.conn.SetDeadline(time.Now().Add(30 * time.Second))
	_, err := c.conn.Write([]byte(line))
	if err != nil {
		c.conn.SetDeadline(time.Time{})
		return "", err
	}
	return tagStr, nil
}

func (c *imapClient) readUntilTagWithTimeout(tag string, timeout time.Duration) ([]string, string, error) {
	c.conn.SetDeadline(time.Now().Add(timeout))
	defer c.conn.SetDeadline(time.Time{})
	return c.readUntilTag(tag)
}

func (c *imapClient) readLine() (string, error) {
	line, err := c.reader.ReadString('\n')
	if err != nil {
		return "", err
	}
	return strings.TrimRight(line, "\r\n"), nil
}

func (c *imapClient) readUntilTag(tag string) ([]string, string, error) {
	var lines []string
	for {
		line, err := c.readLine()
		if err != nil {
			return lines, "", err
		}
		if strings.HasPrefix(line, tag+" ") {
			return lines, line, nil
		}
		lines = append(lines, line)
	}
}

// errNotConnected 表示 Outlook mailbox 后端尚未就绪，需要重新建连
var errNotConnected = fmt.Errorf("not connected")

func (c *imapClient) authenticate(email, accessToken string) error {
	xoauth2 := buildXOAuth2(email, accessToken)
	tag, err := c.sendCommand("AUTHENTICATE XOAUTH2 " + xoauth2)
	if err != nil {
		return err
	}
	_, result, err := c.readUntilTagWithTimeout(tag, 30*time.Second)
	if err != nil {
		return err
	}
	if !strings.Contains(result, "OK") {
		if strings.Contains(strings.ToLower(result), "not connected") {
			return errNotConnected
		}
		return fmt.Errorf("认证失败: %s", result)
	}
	log.Println("[IMAP] 认证成功")
	time.Sleep(2 * time.Second)
	return nil
}

func (c *imapClient) selectInbox() (int, error) {
	tag, err := c.sendCommand("SELECT INBOX")
	if err != nil {
		return 0, err
	}
	lines, result, err := c.readUntilTagWithTimeout(tag, 30*time.Second)
	if err != nil {
		return 0, err
	}
	if strings.Contains(result, "OK") {
		total := 0
		for _, line := range lines {
			if strings.Contains(line, "EXISTS") {
				fmt.Sscanf(line, "* %d EXISTS", &total)
			}
		}
		return total, nil
	}
	// "not connected" 表示 Outlook 后端尚未就绪，同连接重试无效，由调用方重连后重试
	errMsg := strings.TrimSpace(result)
	if strings.Contains(strings.ToLower(errMsg), "not connected") {
		return 0, errNotConnected
	}
	if len(errMsg) > 80 {
		errMsg = errMsg[:80] + "..."
	}
	return 0, fmt.Errorf("SELECT 失败: %s", errMsg)
}

func (c *imapClient) close() {
	c.sendCommand("LOGOUT")
	c.conn.Close()
}

// fetchMessageHeaders 获取指定邮件的 To 头和 Date 头
func (c *imapClient) fetchMessageHeaders(seq int) (toHeader, dateHeader string, err error) {
	if seq <= 0 {
		return "", "", fmt.Errorf("无效的邮件序号")
	}
	tag, cmdErr := c.sendCommand(fmt.Sprintf("FETCH %d (BODY.PEEK[HEADER.FIELDS (TO DATE)])", seq))
	if cmdErr != nil {
		return "", "", cmdErr
	}
	lines, result, readErr := c.readUntilTagWithTimeout(tag, 30*time.Second)
	if readErr != nil {
		return "", "", readErr
	}
	if !strings.Contains(result, "OK") {
		return "", "", fmt.Errorf("FETCH 头失败: %s", result)
	}
	for _, l := range lines {
		upper := strings.ToUpper(l)
		if strings.HasPrefix(upper, "TO:") {
			toHeader = strings.TrimSpace(l[3:])
		} else if strings.HasPrefix(upper, "DATE:") {
			dateHeader = strings.TrimSpace(l[5:])
		}
	}
	return toHeader, dateHeader, nil
}

// fetchMessageBody 获取指定邮件的正文（复用原始可靠逻辑）
func (c *imapClient) fetchMessageBody(seq int) (string, error) {
	if seq <= 0 {
		return "", fmt.Errorf("无效的邮件序号")
	}
	tag, err := c.sendCommand(fmt.Sprintf("FETCH %d (BODY.PEEK[TEXT])", seq))
	if err != nil {
		return "", err
	}
	lines, result, err := c.readUntilTagWithTimeout(tag, 30*time.Second)
	if err != nil {
		return "", err
	}
	if !strings.Contains(result, "OK") {
		return "", fmt.Errorf("FETCH TEXT 失败: %s", result)
	}

	var rawLines []string
	inBody := false
	for _, line := range lines {
		if strings.Contains(line, "FETCH") {
			inBody = true
			continue
		}
		if line == ")" {
			continue
		}
		if inBody {
			rawLines = append(rawLines, line)
		}
	}

	raw := strings.Join(rawLines, "\n")

	// 尝试解码 MIME base64 内容
	parts := strings.Split(raw, "------=_Part_")
	var decoded string
	for _, part := range parts {
		if strings.Contains(part, "base64") {
			idx := strings.Index(part, "base64")
			content := part[idx+6:]
			b64 := strings.Map(func(r rune) rune {
				if r == ' ' || r == '\n' || r == '\r' || r == '\t' {
					return -1
				}
				return r
			}, content)
			if data, decErr := base64.StdEncoding.DecodeString(b64); decErr == nil {
				decoded += string(data) + " "
			}
		}
	}
	if decoded != "" {
		return decoded, nil
	}

	// 整体 base64 解码
	cleaned := strings.Map(func(r rune) rune {
		if r == ' ' || r == '\n' || r == '\r' || r == '\t' {
			return -1
		}
		return r
	}, raw)
	if data, decErr := base64.StdEncoding.DecodeString(cleaned); decErr == nil {
		return string(data), nil
	}

	return raw, nil
}
// WaitForOTP 通过 IMAP 轮询等待 AWS 验证码
func WaitForOTP(acc OutlookAccount, beforeCount, timeout, interval int) (string, error) {
	codeRegex := regexp.MustCompile(`\b(\d{6})\b`)
	if acc.mailMode() == "graph" {
		log.Printf("[Outlook Graph] 等待验证码, 邮箱=%s", acc.Email)
		return waitForOTPGraph(acc, timeout, interval, codeRegex)
	}

	log.Printf("[Outlook IMAP] 等待验证码, 邮箱=%s", acc.Email)

	localPart := strings.SplitN(acc.Email, "@", 2)[0]
	isAlias := strings.Contains(localPart, "+")
	targetEmail := strings.ToLower(acc.Email)

	// 过滤基准：当前时间往前推 2 分钟，只排除明显的历史邮件
	// 邮件 Date 头是发送时间，投递有延迟，不能用精确的当前时间过滤
	filterBefore := time.Now().Add(-2 * time.Minute)

	accessToken, err := RefreshOutlookToken(acc)
	if err != nil {
		return "", fmt.Errorf("刷新 Outlook Token 失败: %v", err)
	}

	maxRetries := timeout / interval
	consecutiveSelectFail := 0
	maxConsecutiveSelectFail := 3
	for attempt := 1; attempt <= maxRetries; attempt++ {
		client, err := newIMAPClient()
		if err != nil {
			if attempt%5 == 0 {
				log.Printf("[Outlook IMAP] 连接失败: %v, 重试中...", err)
			}
			time.Sleep(time.Duration(interval) * time.Second)
			continue
		}

		if err := client.authenticate(acc.mailboxEmail(), accessToken); err != nil {
			client.close()
			if err == errNotConnected {
				time.Sleep(time.Duration(interval) * time.Second)
				continue
			}
			accessToken, _ = RefreshOutlookToken(acc)
			time.Sleep(time.Duration(interval) * time.Second)
			continue
		}

		total, err := client.selectInbox()
		if err != nil {
			client.close()
			if err == errNotConnected {
				time.Sleep(time.Duration(interval) * time.Second)
				continue
			}
			consecutiveSelectFail++
			if consecutiveSelectFail >= maxConsecutiveSelectFail {
				log.Printf("[Outlook IMAP] 邮箱 %s 连续 %d 次 SELECT 失败，放弃等待", acc.Email, consecutiveSelectFail)
				return "", fmt.Errorf("IMAP SELECT 连续失败 %d 次: %v", consecutiveSelectFail, err)
			}
			log.Printf("[Outlook IMAP] SELECT 失败 (%d/%d): %v", consecutiveSelectFail, maxConsecutiveSelectFail, err)
			time.Sleep(time.Duration(interval) * time.Second)
			continue
		}
		consecutiveSelectFail = 0

		if total == 0 {
			client.close()
			time.Sleep(time.Duration(interval) * time.Second)
			continue
		}

		// 只扫最新的几封邮件（最多 10 封），检查时间戳
		scanCount := 10
		if total < scanCount {
			scanCount = total
		}

		found := false
		for i := total; i > total-scanCount; i-- {
			toHeader, dateHeader, err := client.fetchMessageHeaders(i)
			if err != nil {
				continue
			}
			// 时间戳过滤：排除 2 分钟前的历史邮件
			if dateHeader != "" {
				if t, parseErr := parseIMAPDate(dateHeader); parseErr == nil {
					if t.Before(filterBefore) {
						continue
					}
				}
			}
			// 别名账号：验证 To 头包含目标别名地址
			// To 头为空时放行（可能 header 解析异常），依赖正文验证码匹配
			if isAlias && toHeader != "" && !strings.Contains(strings.ToLower(toHeader), targetEmail) {
				continue
			}
			// 读取正文
			body, err := client.fetchMessageBody(i)
			if err != nil {
				continue
			}
			code := extractCodeFromText(body, codeRegex)
			if code != "" {
				log.Printf("[Outlook IMAP] 获取到验证码: %s", code)
				client.close()
				return code, nil
			}
			found = true
			_ = found
		}

		client.close()
		if attempt%5 == 0 {
			log.Printf("[Outlook IMAP] [%d/%d] 最近邮件中未找到验证码...", attempt, maxRetries)
		}
		time.Sleep(time.Duration(interval) * time.Second)
	}
	return "", fmt.Errorf("等待验证码超时 (%ds)", timeout)
}

// parseIMAPDate 解析 IMAP Date 头（RFC 2822 格式）
func parseIMAPDate(s string) (time.Time, error) {
	formats := []string{
		"Mon, 2 Jan 2006 15:04:05 -0700",
		"Mon, 2 Jan 2006 15:04:05 -0700 (MST)",
		"2 Jan 2006 15:04:05 -0700",
		"Mon, 2 Jan 2006 15:04:05 MST",
		"2 Jan 2006 15:04:05 MST",
	}
	s = strings.TrimSpace(s)
	for _, f := range formats {
		if t, err := time.Parse(f, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("无法解析日期: %s", s)
}

// GetInboxCount 获取收件箱当前邮件数量（带完整重连重试）
func GetInboxCount(acc OutlookAccount) (int, error) {
	if acc.mailMode() == "graph" {
		return getInboxCountGraph(acc)
	}
	accessToken, err := RefreshOutlookToken(acc)
	if err != nil {
		return 0, fmt.Errorf("刷新 Outlook Token 失败: %v", err)
	}

	var lastErr error
	for attempt := 0; attempt < 5; attempt++ {
		if attempt > 0 {
			waitSec := time.Duration(3+attempt*2) * time.Second
			log.Printf("[IMAP] GetInboxCount 重连重试 %d/5，等待 %s...", attempt+1, waitSec)
			time.Sleep(waitSec)
		}
		client, err := newIMAPClient()
		if err != nil {
			lastErr = fmt.Errorf("连接 IMAP 失败: %v", err)
			continue
		}
		authErr := client.authenticate(acc.mailboxEmail(), accessToken)
		if authErr != nil {
			client.close()
			if authErr == errNotConnected {
				// mailbox 未就绪，重新建连即可，无需刷新 token
				log.Printf("[IMAP] GetInboxCount mailbox 未就绪，重建连接...")
				lastErr = authErr
				continue
			}
			// 其他认证错误，刷新 token 后重试
			lastErr = fmt.Errorf("IMAP 认证失败: %v", authErr)
			accessToken, _ = RefreshOutlookToken(acc)
			continue
		}
		total, err := client.selectInbox()
		if err != nil {
			client.close()
			if err == errNotConnected {
				log.Printf("[IMAP] GetInboxCount SELECT mailbox 未就绪，重建连接...")
				lastErr = err
				continue
			}
			lastErr = fmt.Errorf("选择收件箱失败: %v", err)
			continue
		}
		client.close()
		return total, nil
	}
	return 0, wrapNotConnectedErr(lastErr)
}
func wrapNotConnectedErr(err error) error {
	if err == errNotConnected {
		return fmt.Errorf("IMAP mailbox 未就绪 (not connected)，请稍后重试")
	}
	return err
}
