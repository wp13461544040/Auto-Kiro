package core

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand"
	"os"
	"time"

	fhttp "github.com/bogdanfinn/fhttp"
	httputil "github.com/wp13461544040/Auto-Kiro/internal/http"
	"github.com/wp13461544040/Auto-Kiro/internal/ocr"
)

// Step11CreateIdentity 创建身份
func (r *Registrar) Step11CreateIdentity(otp string) error {
	log.Println("[11] 创建身份")
	ref := fmt.Sprintf("%s/?workflowID=%s", r.Cfg.ProfileBase, r.WorkflowID)
	fp := r.GenFP("profile", "EmailVerification", 0, "")

	body, _, _, err := r.DoPostRaw(r.Cfg.ProfileBase+"/api/create-identity", map[string]interface{}{
		"workflowState": r.WorkflowState,
		"userData":      map[string]string{"email": r.Email, "fullName": r.Cfg.FullName},
		"otpCode":       otp,
		"browserData": map[string]interface{}{
			"attributes": map[string]interface{}{
				"fingerprint":    fp,
				"eventTimestamp": time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
				"timeSpentOnPage": "45000",
				"pageName":       "EMAIL_VERIFICATION",
				"eventType":      "EmailVerification",
				"ubid":           r.Ubid,
				"visitorId":      r.VisitorID,
			},
			"cookies": map[string]interface{}{},
		},
	}, r.BuildProfileHeaders(ref))
	if err != nil {
		return err
	}

	var data map[string]interface{}
	json.Unmarshal(body, &data)
	r.RegCode, _ = data["registrationCode"].(string)
	r.SignState, _ = data["signInState"].(string)
	if r.RegCode == "" {
		return fmt.Errorf("create-identity 未返回 registrationCode: %s", string(body))
	}
	if len(r.RegCode) > 20 {
		log.Printf("regCode=%s...", r.RegCode[:20])
	}
	return nil
}

// Step12SetPassword 设置密码
func (r *Registrar) Step12SetPassword() error {
	log.Println("[12] 设置密码")
	api := fmt.Sprintf("%s/platform/%s/signup/api/execute", r.Cfg.SigninBase, r.Cfg.DirectoryID)
	ref := fmt.Sprintf("%s/platform/%s/signup?registrationCode=%s&state=%s",
		r.Cfg.SigninBase, r.Cfg.DirectoryID, r.RegCode, r.SignState)
	fp := r.GenFP("signup", "PageSubmit", 0, "")

	// 12a: 获取加密公钥
	rid := NewUUID()
	h := r.BuildHeaders(ref, r.Cfg.SigninBase)
	h["x-amzn-requestid"] = rid
	h["x-amz-date"] = GmtDate()
	h["priority"] = "u=1, i"

	body, _, respH, err := r.DoPostRaw(api, map[string]interface{}{
		"stepId": "", "state": r.SignState,
		"inputs": []interface{}{
			map[string]string{
				"input_type":       "UserRegistrationRequestInput",
				"registrationCode": r.RegCode, "state": r.SignState,
			},
			map[string]string{"input_type": "FingerPrintRequestInput", "fingerPrint": fp},
		},
		"requestId": rid,
	}, h)
	if err != nil {
		return err
	}
	httputil.SaveCookies(r.Cookies, respH)

	var data map[string]interface{}
	json.Unmarshal(body, &data)
	r.WorkflowHandle, _ = data["workflowStateHandle"].(string)

	encCtx := httputil.GetNestedMap(data, "workflowResponseData", "encryptionContextResponse")
	pubKeyMap := httputil.GetNestedStringMap(encCtx, "publicKey")
	if pubKeyMap == nil || pubKeyMap["n"] == "" {
		return fmt.Errorf("未获取到加密公钥: %s", string(body))
	}

	issuer, _ := encCtx["issuer"].(string)
	if issuer == "" {
		issuer = "signin"
	}
	audience, _ := encCtx["audience"].(string)
	if audience == "" {
		audience = "AWSPasswordService"
	}
	region, _ := encCtx["region"].(string)
	if region == "" {
		region = "us-east-1"
	}

	encrypted, err := r.JWE.Encrypt(r.Cfg.Password, pubKeyMap, issuer, audience, region)
	if err != nil {
		return fmt.Errorf("JWE 加密失败: %w", err)
	}

	// 12b: 提交密码(不需要confirmPassword,AWS会自动验证)
	fp = r.GenFP("signup", "PageSubmit", 0, "")
	rid = NewUUID()
	h = r.BuildHeaders(ref, r.Cfg.SigninBase)
	h["x-amzn-requestid"] = rid
	h["x-amz-date"] = GmtDate()
	h["priority"] = "u=1, i"

	// 计算页面停留时间(模拟真实用户,30-60秒)
	timeSpent := 30000 + rand.Intn(30000) // 30-60秒,单位毫秒

	body, _, respH, err = r.DoPostRaw(api, map[string]interface{}{
		"stepId":              "get-new-password-for-password-creation",
		"workflowStateHandle": r.WorkflowHandle,
		"actionId":            "SUBMIT",
		"inputs": []interface{}{
			map[string]interface{}{
				"input_type":            "PasswordRequestInput",
				"password":              encrypted,
				"successfullyEncrypted": "SUCCESSFUL",
				"errorLog":              nil,
			},
			map[string]interface{}{
				"input_type":  "UserEventRequestInput",
				"directoryId": r.Cfg.DirectoryID,
				"userName":    r.Email,
				"userEvents": []map[string]interface{}{
					{
						"input_type":      "UserEvent",
						"eventType":       "PAGE_SUBMIT",
						"pageName":        "CREDENTIAL_COLLECTION",
						"timeSpentOnPage": timeSpent,
					},
				},
			},
			map[string]string{"input_type": "UserRequestInput", "username": r.Email},
			map[string]string{"input_type": "FingerPrintRequestInput", "fingerPrint": fp},
		},
		"visitorId": r.VisitorID, "requestId": rid,
	}, h)
	if err != nil {
		return err
	}
	httputil.SaveCookies(r.Cookies, respH)

	json.Unmarshal(body, &data)
	
	// 检查是否需要人机验证
	if captchaResp, ok := data["captchaResponse"].(map[string]interface{}); ok {
		captchaToken, _ := captchaResp["captchaToken"].(string)
		captchaURL, _ := captchaResp["captchaURL"].(string)
		captchaCDN, _ := captchaResp["captchaCDN"].(string)
		
		if captchaToken != "" {
			log.Printf("[12] ⚠️  检测到人机验证 (AWS Threat Mitigation)")
			
			// 保存验证码相关信息用于分析
			if err := r.saveCaptchaInfo(captchaResp, data, body, ref); err != nil {
				log.Printf("[12] 警告: 保存验证码信息失败: %v", err)
			}
			
			log.Printf("[12] 验证码Token: %s...", captchaToken[:min(20, len(captchaToken))])
			log.Printf("[12] 验证码CDN: %s", captchaCDN)
			log.Printf("[12] 验证码URL: %s", captchaURL)
			
			// AWS Threat Mitigation 验证码分两种情况:
			// 1. captchaURL 为空 → 需要加载 SDK 自动处理 (交互式验证)
			// 2. captchaURL 有值 → 传统图片验证码,可以OCR
			
			if captchaURL == "" && captchaCDN != "" {
				// 情况1: AWS 威胁缓解令牌 (无图片,需要 JavaScript SDK)
				log.Printf("[12] ⚠️  AWS威胁缓解系统 - 无法自动通过")
				log.Printf("[12] 这是交互式验证,需要浏览器环境")
				log.Printf("[12] 建议: 降低注册频率、更换代理、增强指纹多样性")
				
				// 保存详细信息后继续
				return fmt.Errorf("AWS威胁缓解系统拦截 - 需要交互式验证")
			}
			
			if captchaURL != "" {
				// 情况2: 传统图片验证码
				log.Printf("[12] 检测到图片验证码,尝试OCR识别...")
				
				// 尝试OCR识别
				captchaText, err := r.solveCaptcha(captchaURL)
				if err != nil {
					log.Printf("[12] OCR识别失败: %v", err)
					return fmt.Errorf("OCR识别失败: %w", err)
				}
				
				if captchaText == "" {
					log.Printf("[12] OCR未识别到内容")
					return fmt.Errorf("OCR未识别到验证码内容")
				}
				
				log.Printf("[12] OCR识别成功: %s (长度: %d)", captchaText, len(captchaText))
				
				// 等待1-2秒模拟真实用户
				time.Sleep(time.Duration(1000+rand.Intn(1000)) * time.Millisecond)
				
				// 重试设置密码,附带验证码
				return r.retrySetPasswordWithCaptcha(encrypted, ref, captchaToken, captchaText)
			}
			
			// 既没有 URL 也没有 CDN,异常情况
			log.Printf("[12] 异常: 验证码响应不完整")
			return fmt.Errorf("验证码响应异常")
		}
	}
	
	redir, _ := data["redirect"].(map[string]interface{})
	rurl, _ := redir["url"].(string)
	if rurl == "" {
		return fmt.Errorf("密码设置未返回 redirect: %s", string(body))
	}

	wh := httputil.ExtractParam(rurl, "workflowStateHandle")
	st := httputil.ExtractParam(rurl, "state")
	rh := httputil.ExtractParam(rurl, "workflowResultHandle")
	return r.completeSignup(wh, st, rh)
}

// solveCaptcha 使用OCR识别验证码
func (r *Registrar) solveCaptcha(captchaURL string) (string, error) {
	log.Printf("[12] 尝试OCR识别验证码...")
	
	config := ocr.DefaultTesseractConfig()
	if err := ocr.CheckTesseract(config); err != nil {
		return "", err
	}
	
	return ocr.RecognizeCaptcha(captchaURL, config)
}

// saveCaptchaInfo 保存验证码相关信息用于分析
func (r *Registrar) saveCaptchaInfo(captchaResp map[string]interface{}, fullResp map[string]interface{}, rawBody []byte, referer string) error {
	// 创建验证码信息目录
	captchaDir := "data/captcha_logs"
	if err := os.MkdirAll(captchaDir, 0755); err != nil {
		return fmt.Errorf("创建目录失败: %w", err)
	}
	
	// 生成时间戳文件名
	timestamp := time.Now().Format("20060102_150405")
	baseFilename := fmt.Sprintf("%s/captcha_%s_%s", captchaDir, timestamp, r.Email)
	
	// 1. 保存完整响应 JSON
	fullFile := baseFilename + "_response.json"
	prettyJSON, _ := json.MarshalIndent(fullResp, "", "  ")
	if err := os.WriteFile(fullFile, prettyJSON, 0644); err != nil {
		log.Printf("[保存] 写入完整响应失败: %v", err)
	} else {
		log.Printf("[保存] 完整响应已保存: %s", fullFile)
	}
	
	// 2. 保存原始响应体
	rawFile := baseFilename + "_raw.json"
	if err := os.WriteFile(rawFile, rawBody, 0644); err != nil {
		log.Printf("[保存] 写入原始响应失败: %v", err)
	}
	
	// 3. 保存验证码详细信息
	captchaInfo := map[string]interface{}{
		"timestamp":   time.Now().Format("2006-01-02 15:04:05"),
		"email":       r.Email,
		"proxy":       r.Cfg.Proxy,
		"referer":     referer,
		"user_agent":  r.Identity.UA,
		"chrome_ver":  r.Identity.ChromeVer,
		"captcha": captchaResp,
		"identity": map[string]interface{}{
			"gpu_vendor": r.Identity.GPUVendor,
			"gpu_model":  r.Identity.GPUModel,
			"platform":   r.Identity.Platform,
			"memory_gb":  r.Identity.DeviceMemory,
			"cpu_cores":  r.Identity.HardwareConcurrency,
			"screen":     r.Identity.Screen,
		},
		"cookies": r.Cookies,
		"workflow": map[string]string{
			"workflow_handle": r.WorkflowHandle,
			"workflow_id":     r.WorkflowID,
			"reg_code":        r.RegCode,
			"sign_state":      r.SignState,
		},
	}
	
	infoFile := baseFilename + "_info.json"
	infoJSON, _ := json.MarshalIndent(captchaInfo, "", "  ")
	if err := os.WriteFile(infoFile, infoJSON, 0644); err != nil {
		log.Printf("[保存] 写入验证码信息失败: %v", err)
	} else {
		log.Printf("[保存] 验证码信息已保存: %s", infoFile)
	}
	
	// 4. 保存请求分析报告
	analysisFile := baseFilename + "_analysis.txt"
	analysis := fmt.Sprintf(`=== 人机验证分析报告 ===
时间: %s
邮箱: %s
代理: %s

【验证码信息】
Token: %v
URL: %v
类型: %v
其他字段: %v

【用户环境】
User-Agent: %s
Chrome版本: %s
GPU: %s %s
平台: %s
内存: %d GB
CPU核心: %d
屏幕: %dx%d

【工作流状态】
WorkflowHandle: %s
WorkflowID: %s
RegCode: %s
SignState: %s

【请求头】
Referer: %s

【Cookie数量】
%d 个

【分析建议】
1. 检查代理IP是否被标记
2. 检查指纹是否异常
3. 检查请求频率是否过高
4. 分析验证码类型和难度
5. 考虑更换代理或调整指纹

【下一步】
- 使用 captcha_*_response.json 分析完整响应结构
- 检查 captchaURL 获取验证码图片
- 研究 captchaToken 的生成和使用方式
- 尝试不同的OCR配置或第三方验证码服务
`,
		time.Now().Format("2006-01-02 15:04:05"),
		r.Email,
		r.Cfg.Proxy,
		captchaResp["captchaToken"],
		captchaResp["captchaURL"],
		captchaResp["captchaType"],
		captchaResp,
		r.Identity.UA,
		r.Identity.ChromeVer,
		r.Identity.GPUVendor,
		r.Identity.GPUModel,
		r.Identity.Platform,
		r.Identity.DeviceMemory,
		r.Identity.HardwareConcurrency,
		r.Identity.Screen.Width,
		r.Identity.Screen.Height,
		r.WorkflowHandle,
		r.WorkflowID,
		r.RegCode,
		r.SignState,
		referer,
		len(r.Cookies),
	)
	
	if err := os.WriteFile(analysisFile, []byte(analysis), 0644); err != nil {
		log.Printf("[保存] 写入分析报告失败: %v", err)
	} else {
		log.Printf("[保存] 分析报告已保存: %s", analysisFile)
	}
	
	// 5. 如果有验证码URL，尝试下载图片
	if captchaURL, ok := captchaResp["captchaURL"].(string); ok && captchaURL != "" {
		imageFile := baseFilename + "_captcha.png"
		if err := r.downloadCaptchaImage(captchaURL, imageFile); err != nil {
			log.Printf("[保存] 下载验证码图片失败: %v", err)
		} else {
			log.Printf("[保存] 验证码图片已保存: %s", imageFile)
		}
	}
	
	log.Printf("[保存] ✓ 验证码信息已完整保存到: %s", captchaDir)
	return nil
}

// downloadCaptchaImage 下载验证码图片
func (r *Registrar) downloadCaptchaImage(url, filename string) error {
	req, err := fhttp.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	
	req.Header.Set("User-Agent", r.Identity.UA)
	req.Header.Set("Referer", r.Cfg.SigninBase)
	
	resp, err := r.Client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != 200 {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	
	return os.WriteFile(filename, data, 0644)
}

// retrySetPasswordWithCaptcha 重试设置密码(附带验证码)
func (r *Registrar) retrySetPasswordWithCaptcha(encrypted, ref, captchaToken, captchaText string) error {
	log.Printf("[12.1] 重试设置密码(附带OCR识别的验证码: %s)", captchaText)
	api := fmt.Sprintf("%s/platform/%s/signup/api/execute", r.Cfg.SigninBase, r.Cfg.DirectoryID)
	
	fp := r.GenFP("signup", "PageSubmit", 0, "")
	rid := NewUUID()
	h := r.BuildHeaders(ref, r.Cfg.SigninBase)
	h["x-amzn-requestid"] = rid
	h["x-amz-date"] = GmtDate()
	h["priority"] = "u=1, i"

	// 计算页面停留时间
	timeSpent := 30000 + rand.Intn(30000)

	body, _, respH, err := r.DoPostRaw(api, map[string]interface{}{
		"stepId":              "get-new-password-for-password-creation",
		"workflowStateHandle": r.WorkflowHandle,
		"actionId":            "SUBMIT",
		"inputs": []interface{}{
			map[string]interface{}{
				"input_type":            "PasswordRequestInput",
				"password":              encrypted,
				"successfullyEncrypted": "SUCCESSFUL",
				"errorLog":              nil,
			},
			map[string]interface{}{
				"input_type":  "UserEventRequestInput",
				"directoryId": r.Cfg.DirectoryID,
				"userName":    r.Email,
				"userEvents": []map[string]interface{}{
					{
						"input_type":      "UserEvent",
						"eventType":       "PAGE_SUBMIT",
						"pageName":        "CREDENTIAL_COLLECTION",
						"timeSpentOnPage": timeSpent,
					},
				},
			},
			map[string]string{"input_type": "UserRequestInput", "username": r.Email},
			map[string]string{"input_type": "FingerPrintRequestInput", "fingerPrint": fp},
			map[string]string{
				"input_type":     "CaptchaResponseInput",
				"captchaToken":   captchaToken,
				"captchaAnswer":  captchaText, // OCR识别的答案
			},
		},
		"visitorId": r.VisitorID,
		"requestId": rid,
	}, h)
	
	if err != nil {
		return err
	}
	httputil.SaveCookies(r.Cookies, respH)

	var data map[string]interface{}
	json.Unmarshal(body, &data)
	
	// 检查是否还需要验证码
	if captchaResp, ok := data["captchaResponse"].(map[string]interface{}); ok {
		if newToken, ok := captchaResp["captchaToken"].(string); ok && newToken != "" {
			log.Printf("[12.1] 验证码错误,放弃重试")
			return fmt.Errorf("验证码识别错误")
		}
	}
	
	redir, _ := data["redirect"].(map[string]interface{})
	rurl, _ := redir["url"].(string)
	if rurl == "" {
		log.Printf("[12.1] 响应: %s", string(body))
		return fmt.Errorf("密码设置(附带验证码)未返回 redirect")
	}

	log.Printf("[12.1] 验证码验证成功")
	wh := httputil.ExtractParam(rurl, "workflowStateHandle")
	st := httputil.ExtractParam(rurl, "state")
	rh := httputil.ExtractParam(rurl, "workflowResultHandle")
	return r.completeSignup(wh, st, rh)
}

// completeSignup 完成注册工作流
func (r *Registrar) completeSignup(wh, state, rh string) error {
	log.Println("[12.5] 完成注册工作流")
	api := fmt.Sprintf("%s/platform/%s/api/execute", r.Cfg.SigninBase, r.Cfg.DirectoryID)
	ref := fmt.Sprintf("%s/platform/%s/login?workflowStateHandle=%s&state=%s&workflowResultHandle=%s",
		r.Cfg.SigninBase, r.Cfg.DirectoryID, wh, state, rh)
	fp := r.GenFP("signin", "PageLoad", 0, "")

	rid := NewUUID()
	h := r.BuildHeaders(ref, r.Cfg.SigninBase)
	h["x-amzn-requestid"] = rid
	h["x-amz-date"] = GmtDate()
	h["priority"] = "u=1, i"

	body, _, respH, err := r.DoPostRaw(api, map[string]interface{}{
		"stepId": "", "workflowStateHandle": wh,
		"workflowResultHandle": rh, "state": state,
		"inputs": []interface{}{
			map[string]string{"input_type": "UserRequestInput", "username": r.Email},
			map[string]string{"input_type": "FingerPrintRequestInput", "fingerPrint": fp},
		},
		"visitorId": r.VisitorID, "requestId": rid,
	}, h)
	if err != nil {
		return err
	}
	httputil.SaveCookies(r.Cookies, respH)

	var data map[string]interface{}
	json.Unmarshal(body, &data)
	if data["stepId"] != "end-of-workflow-success" {
		return fmt.Errorf("完成工作流失败: %v", data["stepId"])
	}

	if redir, ok := data["redirect"].(map[string]interface{}); ok {
		if rurl, ok := redir["url"].(string); ok {
			r.AuthCode = httputil.ExtractParam(rurl, "workflowResultHandle")
			r.SSOState = httputil.ExtractParam(rurl, "state")
			r.WdcCSRFToken = httputil.ExtractParam(rurl, "wdc_csrf_token")
		}
	}
	return nil
}
