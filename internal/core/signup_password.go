package core

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	httputil "github.com/wp13461544040/Auto-Kiro/internal/http"
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

	// 12b: 提交密码
	fp = r.GenFP("signup", "PageSubmit", 0, "")
	rid = NewUUID()
	h = r.BuildHeaders(ref, r.Cfg.SigninBase)
	h["x-amzn-requestid"] = rid
	h["x-amz-date"] = GmtDate()
	h["priority"] = "u=1, i"

	body, _, respH, err = r.DoPostRaw(api, map[string]interface{}{
		"stepId":              "get-new-password-for-password-creation",
		"workflowStateHandle": r.WorkflowHandle,
		"actionId":            "SUBMIT",
		"inputs": []interface{}{
			map[string]interface{}{
				"input_type":            "PasswordRequestInput",
				"password":              encrypted,
				"successfullyEncrypted": "SUCCESSFUL",
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
		if captchaToken != "" {
			log.Printf("[12] 检测到需要人机验证")
			// AWS captcha需要解析token中的redemptionToken
			var tokenData map[string]interface{}
			if err := json.Unmarshal([]byte(captchaToken), &tokenData); err == nil {
				if redemptionToken, ok := tokenData["redemptionToken"].(string); ok && redemptionToken != "" {
					log.Printf("[12] 使用 redemptionToken 重试")
					// 等待1秒再重试,避免请求太快
					time.Sleep(1 * time.Second)
					return r.retrySetPasswordWithCaptcha(encrypted, fp, rid, ref, redemptionToken)
				}
			}
			// 如果解析失败,直接用原token重试
			log.Printf("[12] captchaToken 解析失败,使用原token重试")
			time.Sleep(1 * time.Second)
			return r.retrySetPasswordWithCaptcha(encrypted, fp, rid, ref, captchaToken)
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

// retrySetPasswordWithCaptcha 重试设置密码(附带人机验证token)
func (r *Registrar) retrySetPasswordWithCaptcha(encrypted, fp, rid, ref, captchaToken string) error {
	log.Println("[12.1] 重试设置密码(附带人机验证)")
	api := fmt.Sprintf("%s/platform/%s/signup/api/execute", r.Cfg.SigninBase, r.Cfg.DirectoryID)
	
	fp = r.GenFP("signup", "PageSubmit", 0, "")
	rid = NewUUID()
	h := r.BuildHeaders(ref, r.Cfg.SigninBase)
	h["x-amzn-requestid"] = rid
	h["x-amz-date"] = GmtDate()
	h["priority"] = "u=1, i"

	body, _, respH, err := r.DoPostRaw(api, map[string]interface{}{
		"stepId":              "get-new-password-for-password-creation",
		"workflowStateHandle": r.WorkflowHandle,
		"actionId":            "SUBMIT",
		"inputs": []interface{}{
			map[string]interface{}{
				"input_type":            "PasswordRequestInput",
				"password":              encrypted,
				"successfullyEncrypted": "SUCCESSFUL",
			},
			map[string]string{"input_type": "UserRequestInput", "username": r.Email},
			map[string]string{"input_type": "FingerPrintRequestInput", "fingerPrint": fp},
			map[string]string{
				"input_type":      "CaptchaResponseInput",
				"redemptionToken": captchaToken,
			},
		},
		"visitorId": r.VisitorID, "requestId": rid,
	}, h)
	if err != nil {
		return err
	}
	httputil.SaveCookies(r.Cookies, respH)

	var data map[string]interface{}
	json.Unmarshal(body, &data)
	
	// 再次检查是否还需要captcha(可能需要多次)
	if captchaResp, ok := data["captchaResponse"].(map[string]interface{}); ok {
		if newToken, ok := captchaResp["captchaToken"].(string); ok && newToken != "" {
			log.Printf("[12.1] 仍需要验证,放弃重试: %s", string(body))
			return fmt.Errorf("人机验证失败,需要手动处理")
		}
	}
	
	redir, _ := data["redirect"].(map[string]interface{})
	rurl, _ := redir["url"].(string)
	if rurl == "" {
		return fmt.Errorf("密码设置(附带captcha)未返回 redirect: %s", string(body))
	}

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
