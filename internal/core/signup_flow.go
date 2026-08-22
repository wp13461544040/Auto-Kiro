package core

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"strings"
	"time"

	"github.com/wp13461544040/Auto-Kiro/internal/email"
	httputil "github.com/wp13461544040/Auto-Kiro/internal/http"
)

// Step6SubmitEmail 提交邮箱
func (r *Registrar) Step6SubmitEmail() (string, error) {
	log.Printf("[6] 提交邮箱 %s", r.Email)
	api := fmt.Sprintf("%s/platform/%s/api/execute", r.Cfg.SigninBase, r.Cfg.DirectoryID)
	ref := fmt.Sprintf("%s/platform/%s/login?workflowStateHandle=%s",
		r.Cfg.SigninBase, r.Cfg.DirectoryID, r.WorkflowHandle)
	fp := r.GenFP("signin", "PageSubmit", len(r.Email), r.Email)

	rid := NewUUID()
	h := r.BuildHeaders(ref, r.Cfg.SigninBase)
	h["x-amzn-requestid"] = rid
	h["x-amz-date"] = GmtDate()
	h["priority"] = "u=1, i"

	body, status, respH, err := r.DoPostRaw(api, map[string]interface{}{
		"stepId":              "get-identity-user",
		"workflowStateHandle": r.WorkflowHandle,
		"actionId":            "SUBMIT",
		"inputs": []interface{}{
			map[string]string{"input_type": "UserRequestInput", "username": r.Email},
			map[string]string{"input_type": "ApplicationTypeRequestInput", "applicationType": "SSO_INDIVIDUAL_ID"},
			map[string]interface{}{
				"input_type":  "UserEventRequestInput",
				"directoryId": r.Cfg.DirectoryID,
				"userName":    r.Email,
				"userEvents": []map[string]interface{}{{
					"input_type":      "UserEvent",
					"eventType":       "PAGE_SUBMIT",
					"pageName":        "IDENTIFICATION",
					"timeSpentOnPage": 5000,
				}},
			},
			map[string]string{"input_type": "FingerPrintRequestInput", "fingerPrint": fp},
		},
		"visitorId": r.VisitorID,
		"requestId": rid,
	}, h)
	if err != nil {
		return "", err
	}
	httputil.SaveCookies(r.Cookies, respH)

	var data map[string]interface{}
	json.Unmarshal(body, &data)
	if wh, ok := data["workflowStateHandle"].(string); ok {
		r.WorkflowHandle = wh
	}

	if status == 400 {
		return "signup", nil
	} else if status == 200 {
		return "login", nil
	}
	return "", fmt.Errorf("提交邮箱失败: %d - %s", status, string(body)[:min(200, len(body))])
}

// Step7Signup 注册
func (r *Registrar) Step7Signup() error {
	log.Println("[7] 注册 (SIGNUP)")
	api := fmt.Sprintf("%s/platform/%s/api/execute", r.Cfg.SigninBase, r.Cfg.DirectoryID)
	ref := fmt.Sprintf("%s/platform/%s/login?workflowStateHandle=%s",
		r.Cfg.SigninBase, r.Cfg.DirectoryID, r.WorkflowHandle)
	fp := r.GenFP("signup", "PageSubmit", 0, "")

	rid := NewUUID()
	h := r.BuildHeaders(ref, r.Cfg.SigninBase)
	h["x-amzn-requestid"] = rid
	h["x-amz-date"] = GmtDate()
	h["priority"] = "u=1, i"

	body, _, respH, err := r.DoPostRaw(api, map[string]interface{}{
		"stepId":              "get-identity-user",
		"workflowStateHandle": r.WorkflowHandle,
		"actionId":            "SIGNUP",
		"inputs": []interface{}{
			map[string]string{"input_type": "UserRequestInput", "username": r.Email},
			map[string]string{"input_type": "FingerPrintRequestInput", "fingerPrint": fp},
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
	if redir, ok := data["redirect"].(map[string]interface{}); ok {
		if rurl, ok := redir["url"].(string); ok && strings.Contains(rurl, "workflowStateHandle=") {
			r.WorkflowHandle = httputil.SplitAfter(rurl, "workflowStateHandle=")
		}
	}
	return nil
}

// Step7_5SignupInit Signup API 初始化
func (r *Registrar) Step7_5SignupInit() error {
	log.Println("[7.5] Signup API 初始化")
	api := fmt.Sprintf("%s/platform/%s/signup/api/execute", r.Cfg.SigninBase, r.Cfg.DirectoryID)
	ref := fmt.Sprintf("%s/platform/%s/signup?workflowStateHandle=%s",
		r.Cfg.SigninBase, r.Cfg.DirectoryID, r.WorkflowHandle)

	fp := r.GenFP("signup", "first_load", 0, "")
	rid := NewUUID()
	h := r.BuildHeaders(ref, r.Cfg.SigninBase)
	h["x-amzn-requestid"] = rid
	h["x-amz-date"] = GmtDate()
	h["priority"] = "u=1, i"

	body, _, respH, err := r.DoPostRaw(api, map[string]interface{}{
		"stepId": "", "workflowStateHandle": r.WorkflowHandle,
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
	if wh, ok := data["workflowStateHandle"].(string); ok {
		r.WorkflowHandle = wh
	}

	// 若第一次响应已经包含 workflowID，直接提取并跳过第二次请求
	if redir, ok := data["redirect"].(map[string]interface{}); ok {
		if rurl, ok := redir["url"].(string); ok && strings.Contains(rurl, "workflowID=") {
			wid := httputil.SplitAfter(rurl, "workflowID=")
			if i := strings.IndexByte(wid, '#'); i >= 0 {
				wid = wid[:i]
			}
			if wid != "" {
				r.WorkflowID = wid
				return nil
			}
		}
	}

	stepID, _ := data["stepId"].(string)
	if stepID != "start" {
		if r.Cfg.Debug {
			log.Printf("[DEBUG] Signup init 第一次响应 stepId=%v, body=%s", data["stepId"], string(body)[:min(500, len(body))])
		}
		return fmt.Errorf("Signup init 返回意外 stepId: %v", data["stepId"])
	}

	// 第二次请求
	fp = r.GenFP("signup", "PageLoad", 0, "")
	rid = NewUUID()
	h = r.BuildHeaders(ref, r.Cfg.SigninBase)
	h["x-amzn-requestid"] = rid
	h["x-amz-date"] = GmtDate()
	h["priority"] = "u=1, i"

	body, _, respH, err = r.DoPostRaw(api, map[string]interface{}{
		"stepId": "start", "workflowStateHandle": r.WorkflowHandle,
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

	json.Unmarshal(body, &data)
	if wh, ok := data["workflowStateHandle"].(string); ok {
		r.WorkflowHandle = wh
	}

	// 方式1: 从 redirect.url 中提取 workflowID
	if redir, ok := data["redirect"].(map[string]interface{}); ok {
		if rurl, ok := redir["url"].(string); ok && strings.Contains(rurl, "workflowID=") {
			wid := httputil.SplitAfter(rurl, "workflowID=")
			if i := strings.IndexByte(wid, '#'); i >= 0 {
				wid = wid[:i]
			}
			r.WorkflowID = wid
		}
	}

	// 方式2: 从顶层字段 workflowID / workflowId 提取
	if r.WorkflowID == "" {
		if wid, ok := data["workflowID"].(string); ok && wid != "" {
			r.WorkflowID = wid
		} else if wid, ok := data["workflowId"].(string); ok && wid != "" {
			r.WorkflowID = wid
		}
	}

	if r.WorkflowID == "" {
		if r.Cfg.Debug {
			log.Printf("[DEBUG] Signup init 完整响应: %s", string(body))
		} else {
			log.Printf("[DEBUG] Signup init 响应摘要: %s", string(body)[:min(500, len(body))])
		}
		return fmt.Errorf("Signup init 未返回 workflowID，请检查响应结构")
	}
	
	log.Printf("[DEBUG] 成功提取 workflowID: %s", r.WorkflowID)
	return nil
}

// Step7_8ProfileInit Profile 页面初始化
func (r *Registrar) Step7_8ProfileInit() error {
	log.Println("[7.8] Profile 页面初始化")
	r.Ubid = httputil.UbidGen()
	r.Cookies["aws-user-profile-ubid"] = r.Ubid
	r.Cookies["i18next"] = "zh-CN"
	if _, ok := r.Cookies["awsccc"]; !ok {
		r.Cookies["awsccc"] = httputil.Awsccc()
	}

	url := fmt.Sprintf("%s/?workflowID=%s", r.Cfg.ProfileBase, r.WorkflowID)
	_, _, respH, err := r.DoGet(url, map[string]string{
		"Accept":         "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"User-Agent":     r.Identity.UA,
		"sec-fetch-dest": "document",
		"sec-fetch-mode": "navigate",
	})
	if err != nil {
		return err
	}
	httputil.SaveCookies(r.Cookies, respH)
	r.FPCtx.ResetPerfTiming()
	return r.FetchD2CToken(r.Cfg.ProfileBase, url)
}

// Step8ProfileStart Profile 启动
func (r *Registrar) Step8ProfileStart() error {
	log.Println("[8] Profile 启动")
	ref := fmt.Sprintf("%s/?workflowID=%s", r.Cfg.ProfileBase, r.WorkflowID)
	fp := r.GenFP("profile", "PageLoad", 0, "")

	body, _, _, err := r.DoPostRaw(r.Cfg.ProfileBase+"/api/start", map[string]interface{}{
		"workflowID": r.WorkflowID,
		"browserData": map[string]interface{}{
			"attributes": map[string]interface{}{
				"fingerprint":     fp,
				"eventTimestamp":  time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
				"timeSpentOnPage": "38",
				"eventType":       "PageLoad",
				"ubid":            r.Ubid,
				"visitorId":       r.VisitorID,
			},
			"cookies": map[string]interface{}{},
		},
	}, r.BuildProfileHeaders(ref))
	if err != nil {
		return err
	}

	var data map[string]interface{}
	json.Unmarshal(body, &data)
	r.WorkflowState, _ = data["workflowState"].(string)
	if r.WorkflowState == "" {
		return fmt.Errorf("Profile start 未返回 workflowState: %s", string(body))
	}
	if len(r.WorkflowState) > 30 {
		log.Printf("workflowState=%s...", r.WorkflowState[:30])
	}
	return nil
}

// Step9SendOTP 发送验证码
func (r *Registrar) Step9SendOTP() error {
	log.Println("[9] 发送验证码")

	// Outlook 模式：改为时间窗口过滤，不再需要发送前邮件数量
	// WaitForOTP 会自动只检查调用时刻之后 1 分钟内到达的邮件

	ref := fmt.Sprintf("%s/?workflowID=%s", r.Cfg.ProfileBase, r.WorkflowID)
	// 使用正态分布生成更真实的页面停留时间
	timeOnPage := genRealisticTimeOnPage(4000, 10000) // 4-10秒，平均7秒
	fp := r.GenFPWithTime("profile", "PageSubmit", timeOnPage, len(r.Email), r.Email)
	tsp := fmt.Sprintf("%d", timeOnPage)

	reqPayload := map[string]interface{}{
		"workflowState": r.WorkflowState,
		"email":         r.Email,
		"browserData": map[string]interface{}{
			"attributes": map[string]interface{}{
				"fingerprint":     fp,
				"eventTimestamp":  time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
				"timeSpentOnPage": tsp,
				"pageName":        "EMAIL_COLLECTION",
				"eventType":       "PageSubmit",
				"ubid":            r.Ubid,
				"visitorId":       r.VisitorID,
			},
			"cookies": map[string]interface{}{},
		},
	}

	respBody, status, _, err := r.DoPostRaw(r.Cfg.ProfileBase+"/api/send-otp", reqPayload, r.BuildProfileHeaders(ref))
	if err != nil {
		return err
	}
	if status != 200 {
		if r.Cfg.Debug {
			log.Printf("[DEBUG] send-otp 失败: status=%d, body=%s, fp_len=%d", status, string(respBody), len(fp))
		}
		return fmt.Errorf("send-otp 失败 (%d)", status)
	}
	log.Println("验证码已发送")
	return nil
}

// genRealisticTimeOnPage 生成更真实的页面停留时间（正态分布）
func genRealisticTimeOnPage(minMs, maxMs int) int {
	mean := float64(minMs+maxMs) / 2
	stdDev := float64(maxMs-minMs) / 6 // 6σ 覆盖几乎所有情况
	
	val := rand.NormFloat64()*stdDev + mean
	result := int(val)
	
	// 限制在合理范围内
	if result < minMs {
		result = minMs
	}
	if result > maxMs {
		result = maxMs
	}
	
	return result
}

// Step10GetOTP 等待验证码 (临时邮箱或 Outlook IMAP)
func (r *Registrar) Step10GetOTP() (string, error) {
	log.Println("[10] 等待验证码")
	
	// 根据邮箱类型调整超时时间
	timeout := 120 // 默认2分钟
	interval := 5  // 默认5秒轮询
	
	// Outlook 可能延迟较大，延长超时时间
	if r.Cfg.UseOutlook && r.Cfg.OutlookAccount != nil {
		timeout = 180 // 3分钟
		interval = 8  // 8秒轮询，减少服务器压力
		
		log.Printf("[10] 使用 Outlook 模式，超时时间: %ds, 轮询间隔: %ds", timeout, interval)
		code, err := email.WaitForOTP(*r.Cfg.OutlookAccount, r.OutlookMailCount, timeout, interval)
		if err != nil {
			// 区分错误类型
			if strings.Contains(err.Error(), "超时") {
				return "", fmt.Errorf("等待验证码超时(%ds)，可能是邮件服务延迟", timeout)
			}
			return "", fmt.Errorf("获取验证码失败: %w", err)
		}
		log.Printf("验证码: %s", code)
		return code, nil
	}
	
	// 临时邮箱通常较快
	log.Printf("[10] 使用临时邮箱模式，超时时间: %ds, 轮询间隔: %ds", timeout, interval)
	code, err := r.EmailSvc.WaitForCode(timeout, interval)
	if err != nil {
		if strings.Contains(err.Error(), "超时") {
			return "", fmt.Errorf("等待验证码超时(%ds)，请检查邮箱服务", timeout)
		}
		return "", fmt.Errorf("获取验证码失败: %w", err)
	}
	log.Printf("验证码: %s", code)
	return code, nil
}
