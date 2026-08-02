package crypto

import (
	"encoding/base64"
	"fmt"
	"hash/crc32"
	"io"
	"log"
	"regexp"
	"strconv"
	"strings"
	"sync"

	fhttp "github.com/bogdanfinn/fhttp"
	httputil "reg_go/internal/http"
)

const (
	delta      uint32 = 0x9E3779B9
	fallbackVer       = "4.0.0"
	identifier        = "ECdITeCs"
)

var (
	fallbackKey = [4]uint32{1888420705, 2576816180, 2347232058, 874813317}

	cacheMu          sync.Mutex
	cachedKey        *[4]uint32
	cachedVersion    string
	cachedIdentifier string
)

// RefreshAppJSConfig 从 app.js 刷新 XXTEA 密钥和 TES 版本
func RefreshAppJSConfig(proxy string) {
	cacheMu.Lock()
	defer cacheMu.Unlock()
	if cachedKey != nil {
		return
	}
	js := fetchAppJS(proxy)
	if js != "" {
		key, ident, ver := extractFromAppJS(js)
		if key != nil {
			cachedKey = key
		}
		if ident != "" {
			cachedIdentifier = ident
		}
		if ver != "" {
			cachedVersion = ver
		}
	}
	if cachedKey == nil {
		log.Println("[xxtea] 使用 fallback 密钥")
		k := fallbackKey
		cachedKey = &k
	}
	if cachedVersion == "" {
		cachedVersion = fallbackVer
	}
	if cachedIdentifier == "" {
		cachedIdentifier = identifier
	}
}

func GetTESVersion() string {
	cacheMu.Lock()
	defer cacheMu.Unlock()
	if cachedVersion != "" {
		return cachedVersion
	}
	return fallbackVer
}

func GetIdentifier() string {
	cacheMu.Lock()
	defer cacheMu.Unlock()
	if cachedIdentifier != "" {
		return cachedIdentifier
	}
	return identifier
}

func GetActiveKey() [4]uint32 {
	cacheMu.Lock()
	defer cacheMu.Unlock()
	if cachedKey != nil {
		return *cachedKey
	}
	return fallbackKey
}

// EncryptFingerprint 加密指纹 JSON 字符串
func EncryptFingerprint(jsonStr string) string {
	crc := crc32.ChecksumIEEE([]byte(jsonStr))
	plaintext := fmt.Sprintf("%08X#%s", crc, jsonStr)
	key := GetActiveKey()
	encrypted := xxteaEncrypt(plaintext, key)
	encoded := base64.StdEncoding.EncodeToString(encrypted)
	return GetIdentifier() + ":" + encoded
}

func xxteaEncrypt(plaintext string, key [4]uint32) []byte {
	if len(plaintext) == 0 {
		return nil
	}
	n := (len(plaintext) + 3) / 4
	v := make([]uint32, n)
	for i := 0; i < n; i++ {
		var b0, b1, b2, b3 byte
		if 4*i < len(plaintext) {
			b0 = plaintext[4*i]
		}
		if 4*i+1 < len(plaintext) {
			b1 = plaintext[4*i+1]
		}
		if 4*i+2 < len(plaintext) {
			b2 = plaintext[4*i+2]
		}
		if 4*i+3 < len(plaintext) {
			b3 = plaintext[4*i+3]
		}
		v[i] = uint32(b0) | uint32(b1)<<8 | uint32(b2)<<16 | uint32(b3)<<24
	}
	rounds := 6 + 52/n
	z := v[n-1]
	var total uint32
	for r := 0; r < rounds; r++ {
		total += delta
		e := (total >> 2) & 3
		for p := 0; p < n; p++ {
			y := v[(p+1)%n]
			mx := ((z>>5 ^ y<<2) + (y>>3 ^ z<<4)) ^ ((total ^ y) + (key[(uint32(p)&3)^e] ^ z))
			v[p] += mx
			z = v[p]
		}
	}
	result := make([]byte, n*4)
	for i, val := range v {
		result[4*i] = byte(val)
		result[4*i+1] = byte(val >> 8)
		result[4*i+2] = byte(val >> 16)
		result[4*i+3] = byte(val >> 24)
	}
	return result
}

func fetchAppJS(proxy string) string {
	client := httputil.NewTLSClient(proxy, true, "144.0.0.0")
	req, _ := fhttp.NewRequest("GET", "https://us-east-1.signin.aws/assets/js/app.js", nil)
	httputil.SetHeaders(req, map[string]string{
		"User-Agent":      httputil.DefaultUA,
		"Accept":          "*/*",
		"Accept-Language": "en-US,en;q=0.9",
		"Referer":         "https://us-east-1.signin.aws/",
		"sec-ch-ua":       httputil.DefaultSecUA,
		"sec-fetch-dest":  "script",
		"sec-fetch-mode":  "no-cors",
		"sec-fetch-site":  "same-origin",
	})
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[xxtea] 下载 app.js 失败: %v", err)
		return ""
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return string(b)
}

func extractFromAppJS(js string) (*[4]uint32, string, string) {
	var key *[4]uint32
	var ident, ver string
	re := regexp.MustCompile(`var\s+\w+\s*=\s*\[(\d+),\s*"([A-Za-z0-9]+)",\s*(\d+),\s*(\d+),\s*(\d+)\]`)
	m := re.FindStringSubmatch(js)
	if len(m) == 6 {
		nums := make([]uint32, 4)
		for i, idx := range []int{1, 3, 4, 5} {
			v, _ := strconv.ParseUint(m[idx], 10, 32)
			nums[i] = uint32(v)
		}
		k := [4]uint32{nums[2], nums[0], nums[3], nums[1]}
		key = &k
		ident = m[2]
	}
	reVer := regexp.MustCompile(`FWCIM_VERSION\s*=\s*"(\d+\.\d+\.\d+)"`)
	vm := reVer.FindStringSubmatch(js)
	if len(vm) == 2 {
		ver = vm[1]
	}
	return key, ident, ver
}

func DecryptFingerprint(encrypted string) (string, error) {
	parts := strings.SplitN(encrypted, ":", 2)
	if len(parts) != 2 {
		return "", fmt.Errorf("格式错误")
	}
	data, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		return "", err
	}
	raw := xxteaDecrypt(data, GetActiveKey())
	if idx := strings.Index(raw[:min(16, len(raw))], "#"); idx >= 0 {
		return raw[idx+1:], nil
	}
	return raw, nil
}

func xxteaDecrypt(data []byte, key [4]uint32) string {
	n := len(data) / 4
	if n < 2 {
		return ""
	}
	v := make([]uint32, n)
	for i := 0; i < n; i++ {
		v[i] = uint32(data[4*i]) | uint32(data[4*i+1])<<8 |
			uint32(data[4*i+2])<<16 | uint32(data[4*i+3])<<24
	}
	rounds := 6 + 52/n
	total := uint32(rounds) * delta
	y := v[0]
	for r := 0; r < rounds; r++ {
		e := (total >> 2) & 3
		for p := n - 1; p >= 0; p-- {
			z := v[(p-1+n)%n]
			mx := ((z>>5 ^ y<<2) + (y>>3 ^ z<<4)) ^ ((total ^ y) + (key[(uint32(p)&3)^e] ^ z))
			v[p] -= mx
			y = v[p]
		}
		total -= delta
	}
	var sb strings.Builder
	for _, val := range v {
		sb.WriteByte(byte(val))
		sb.WriteByte(byte(val >> 8))
		sb.WriteByte(byte(val >> 16))
		sb.WriteByte(byte(val >> 24))
	}
	return strings.TrimRight(sb.String(), "\x00")
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
