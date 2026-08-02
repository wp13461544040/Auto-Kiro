package email

import (
	"bufio"
	"context"
	"encoding/base64"
	"fmt"
	"net"
	"net/http"
	stdurl "net/url"
	"strings"
	"time"

	xproxy "golang.org/x/net/proxy"
)

// dialThroughProxy 通过给定代理 URL 与目标 host:port 建立 TCP/SOCKS 连接。
// 支持的 scheme：http / https / socks5 / socks5h。proxyURL 为空时直连。
func dialThroughProxy(proxyURL, network, addr string, timeout time.Duration) (net.Conn, error) {
	if proxyURL == "" {
		return (&net.Dialer{Timeout: timeout}).Dial(network, addr)
	}
	u, err := stdurl.Parse(proxyURL)
	if err != nil {
		return nil, fmt.Errorf("代理地址解析失败: %w", err)
	}
	switch strings.ToLower(u.Scheme) {
	case "socks5", "socks5h":
		var auth *xproxy.Auth
		if u.User != nil {
			pwd, _ := u.User.Password()
			auth = &xproxy.Auth{User: u.User.Username(), Password: pwd}
		}
		d, err := xproxy.SOCKS5("tcp", u.Host, auth, &net.Dialer{Timeout: timeout})
		if err != nil {
			return nil, err
		}
		return d.Dial(network, addr)
	case "http", "https":
		return dialHTTPConnect(u, addr, timeout)
	default:
		return nil, fmt.Errorf("不支持的代理协议: %s", u.Scheme)
	}
}

// dialHTTPConnect 通过 HTTP(S) 代理用 CONNECT 方法建立到目标的 TCP 隧道。
func dialHTTPConnect(u *stdurl.URL, target string, timeout time.Duration) (net.Conn, error) {
	conn, err := (&net.Dialer{Timeout: timeout}).Dial("tcp", u.Host)
	if err != nil {
		return nil, err
	}
	conn.SetDeadline(time.Now().Add(timeout))

	req := "CONNECT " + target + " HTTP/1.1\r\nHost: " + target + "\r\n"
	if u.User != nil {
		pwd, _ := u.User.Password()
		token := base64.StdEncoding.EncodeToString([]byte(u.User.Username() + ":" + pwd))
		req += "Proxy-Authorization: Basic " + token + "\r\n"
	}
	req += "\r\n"
	if _, err := conn.Write([]byte(req)); err != nil {
		conn.Close()
		return nil, err
	}

	br := bufio.NewReader(conn)
	resp, err := http.ReadResponse(br, &http.Request{Method: "CONNECT"})
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("CONNECT 响应解析失败: %w", err)
	}
	resp.Body.Close()
	if resp.StatusCode != 200 {
		conn.Close()
		return nil, fmt.Errorf("CONNECT 失败: %s", resp.Status)
	}
	conn.SetDeadline(time.Time{}) // 清掉握手 deadline
	return conn, nil
}

// httpClientWithProxy 返回带代理的 http.Client（用于 OAuth refresh 等）。
func httpClientWithProxy(proxyURL string, timeout time.Duration) *http.Client {
	transport := &http.Transport{
		DialContext: (&net.Dialer{Timeout: 15 * time.Second}).DialContext,
	}
	if proxyURL != "" {
		if u, err := stdurl.Parse(proxyURL); err == nil {
			switch strings.ToLower(u.Scheme) {
			case "http", "https":
				transport.Proxy = http.ProxyURL(u)
			case "socks5", "socks5h":
				transport.DialContext = func(_ context.Context, network, addr string) (net.Conn, error) {
					return dialThroughProxy(proxyURL, network, addr, 15*time.Second)
				}
			}
		}
	}
	return &http.Client{Timeout: timeout, Transport: transport}
}
