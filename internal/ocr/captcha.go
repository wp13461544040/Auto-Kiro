package ocr

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/png"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// TesseractConfig Tesseract配置
type TesseractConfig struct {
	BinPath  string // tesseract可执行文件路径
	DataPath string // tessdata数据文件路径
	Lang     string // 识别语言,默认eng
	PSM      int    // Page Segmentation Mode,默认7(单行文本)
	OEM      int    // OCR Engine Mode,默认3(默认引擎)
}

// DefaultTesseractConfig 默认配置
func DefaultTesseractConfig() TesseractConfig {
	return TesseractConfig{
		BinPath:  "tesseract", // 假设在PATH中
		DataPath: "",          // 使用系统默认
		Lang:     "eng",
		PSM:      7,  // 单行文本
		OEM:      3,  // 默认引擎
	}
}

// RecognizeCaptcha 识别验证码
// imageData: 图片数据(URL或base64)
func RecognizeCaptcha(imageData string, config TesseractConfig) (string, error) {
	log.Printf("[OCR] 开始识别验证码...")
	log.Printf("[OCR] 图片源: %s", imageData[:min(100, len(imageData))])
	
	// 1. 下载/解码图片
	imgBytes, err := fetchImage(imageData)
	if err != nil {
		return "", fmt.Errorf("获取图片失败: %w", err)
	}
	log.Printf("[OCR] 图片大小: %d bytes", len(imgBytes))

	// 2. 预处理图片(提高识别率)
	imgBytes, err = preprocessImage(imgBytes)
	if err != nil {
		log.Printf("[OCR] 图片预处理失败,使用原图: %v", err)
	} else {
		log.Printf("[OCR] 图片预处理完成")
	}

	// 3. 保存临时文件
	tmpDir := os.TempDir()
	inputFile := filepath.Join(tmpDir, fmt.Sprintf("captcha_%d.png", time.Now().UnixNano()))
	outputBase := filepath.Join(tmpDir, fmt.Sprintf("captcha_out_%d", time.Now().UnixNano()))
	
	defer os.Remove(inputFile)
	defer os.Remove(outputBase + ".txt")

	if err := os.WriteFile(inputFile, imgBytes, 0644); err != nil {
		return "", fmt.Errorf("保存临时文件失败: %w", err)
	}
	log.Printf("[OCR] 临时文件: %s", inputFile)

	// 4. 调用Tesseract
	text, err := runTesseract(inputFile, outputBase, config)
	if err != nil {
		return "", fmt.Errorf("OCR识别失败: %w", err)
	}

	// 5. 清理结果
	result := cleanCaptchaText(text)
	log.Printf("[OCR] 识别结果: '%s' (原始: '%s')", result, strings.TrimSpace(text))

	return result, nil
}

// min 返回两个整数中的较小值
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// fetchImage 获取图片数据
func fetchImage(imageData string) ([]byte, error) {
	// 判断是URL还是base64
	if strings.HasPrefix(imageData, "http://") || strings.HasPrefix(imageData, "https://") {
		log.Printf("[OCR] 从URL下载图片...")
		// 下载URL
		resp, err := http.Get(imageData)
		if err != nil {
			return nil, fmt.Errorf("下载图片失败: %w", err)
		}
		defer resp.Body.Close()
		
		if resp.StatusCode != 200 {
			return nil, fmt.Errorf("HTTP错误: %d %s", resp.StatusCode, resp.Status)
		}
		
		data, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, fmt.Errorf("读取响应失败: %w", err)
		}
		
		log.Printf("[OCR] 下载成功，大小: %d bytes", len(data))
		return data, nil
	}

	log.Printf("[OCR] 解码base64图片...")
	// 处理base64
	// 去掉data:image/png;base64,前缀
	imageData = regexp.MustCompile(`^data:image/[^;]+;base64,`).ReplaceAllString(imageData, "")
	data, err := base64.StdEncoding.DecodeString(imageData)
	if err != nil {
		return nil, fmt.Errorf("base64解码失败: %w", err)
	}
	
	log.Printf("[OCR] base64解码成功，大小: %d bytes", len(data))
	return data, nil
}

// preprocessImage 图片预处理(灰度化、二值化)
func preprocessImage(imgBytes []byte) ([]byte, error) {
	// 解码图片
	img, _, err := image.Decode(bytes.NewReader(imgBytes))
	if err != nil {
		return imgBytes, err
	}

	// 转换为灰度图(简单处理,可以后续优化)
	bounds := img.Bounds()
	grayImg := image.NewGray(bounds)
	
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			grayImg.Set(x, y, img.At(x, y))
		}
	}

	// 编码回PNG
	var buf bytes.Buffer
	if err := png.Encode(&buf, grayImg); err != nil {
		return imgBytes, err
	}

	return buf.Bytes(), nil
}

// runTesseract 运行Tesseract OCR
func runTesseract(inputFile, outputBase string, config TesseractConfig) (string, error) {
	args := []string{
		inputFile,
		outputBase,
	}

	// 添加配置参数
	if config.DataPath != "" {
		args = append(args, "--tessdata-dir", config.DataPath)
	}
	args = append(args, "-l", config.Lang)
	args = append(args, "--psm", fmt.Sprintf("%d", config.PSM))
	args = append(args, "--oem", fmt.Sprintf("%d", config.OEM))
	
	// 只输出字母数字
	args = append(args, "-c", "tessedit_char_whitelist=0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz")

	log.Printf("[OCR] 执行Tesseract: %s %v", config.BinPath, args)
	
	cmd := exec.Command(config.BinPath, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("[OCR] Tesseract错误输出: %s", string(output))
		return "", fmt.Errorf("tesseract执行失败: %w", err)
	}
	
	log.Printf("[OCR] Tesseract执行成功")

	// 读取输出文件
	resultFile := outputBase + ".txt"
	resultBytes, err := os.ReadFile(resultFile)
	if err != nil {
		return "", fmt.Errorf("读取结果失败: %w", err)
	}

	return string(resultBytes), nil
}

// cleanCaptchaText 清理识别结果
func cleanCaptchaText(text string) string {
	// 去除空格、换行等
	text = strings.TrimSpace(text)
	text = strings.ReplaceAll(text, " ", "")
	text = strings.ReplaceAll(text, "\n", "")
	text = strings.ReplaceAll(text, "\r", "")
	
	// 只保留字母数字
	re := regexp.MustCompile(`[^a-zA-Z0-9]`)
	text = re.ReplaceAllString(text, "")
	
	return text
}

// CheckTesseract 检查Tesseract是否可用
func CheckTesseract(config TesseractConfig) error {
	log.Printf("[OCR] 检查Tesseract可用性...")
	log.Printf("[OCR] BinPath: %s", config.BinPath)
	
	cmd := exec.Command(config.BinPath, "--version")
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("[OCR] Tesseract不可用，错误: %v", err)
		log.Printf("[OCR] 输出: %s", string(output))
		return fmt.Errorf("tesseract不可用: %w\n请确认已安装并添加到PATH: https://github.com/tesseract-ocr/tesseract", err)
	}
	
	log.Printf("[OCR] Tesseract版本信息:\n%s", string(output))
	return nil
}
