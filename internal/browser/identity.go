package browser

import (
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"math/rand"
	"sort"
)

// ──────────────────── Chrome 多版本支持 ────────────────────

type chromeVersion struct {
	Version string
	SecUA   string
}

// genChromeVersion 动态生成 Chrome 版本信息 (带权重分布)
func genChromeVersion() chromeVersion {
	type versionWeight struct {
		version string
		weight  int
	}

	// Chrome 版本池 (包含旧版本)
	versions := []versionWeight{
		// 旧版本 (10% - 模拟未及时更新的用户)
		{"127", 3}, {"128", 4}, {"129", 5},
		// 中间版本 (30%)
		{"130", 8}, {"131", 10}, {"132", 10}, {"133", 10}, {"134", 10}, {"135", 10},
		// 较新版本 (40%)
		{"136", 12}, {"137", 12}, {"138", 15}, {"139", 15}, {"140", 18},
		// 最新版本 (20%)
		{"141", 10}, {"142", 8}, {"143", 6}, {"144", 5},
	}

	totalWeight := 0
	for _, vw := range versions {
		totalWeight += vw.weight
	}

	r := rand.Intn(totalWeight)
	accumulated := 0
	var selectedVersion string
	for _, vw := range versions {
		accumulated += vw.weight
		if r < accumulated {
			selectedVersion = vw.version
			break
		}
	}

	// 如果没有选中（理论上不会发生），使用最常见的版本
	if selectedVersion == "" {
		selectedVersion = "140"
	}

	greaseBrands := []string{"Not_A Brand", "Not(A:Brand", "Not-A.Brand", "Not)A;Brand", "Not/A)Brand", "Not A;Brand", "Not?A_Brand"}
	greaseBrand := greaseBrands[rand.Intn(len(greaseBrands))]
	greaseVer := fmt.Sprintf("%d", 8+rand.Intn(92)) // 8~99

	secUA := fmt.Sprintf(`"%s";v="%s", "Chromium";v="%s", "Google Chrome";v="%s"`, greaseBrand, greaseVer, selectedVersion, selectedVersion)
	return chromeVersion{
		Version: selectedVersion + ".0.0.0",
		SecUA:   secUA,
	}
}

// ──────────────────── lsUbid 前缀池 ────────────────────

var lsubidPrefixes = []string{"X10", "X19", "X42", "X55", "X73", "X81", "X96"}

// ──────────────────── WebGL 扩展 ────────────────────

var webglExtCore = []string{
	"ANGLE_instanced_arrays", "EXT_blend_minmax", "EXT_color_buffer_half_float",
	"EXT_float_blend", "EXT_frag_depth", "EXT_shader_texture_lod",
	"EXT_texture_filter_anisotropic", "EXT_sRGB", "KHR_parallel_shader_compile",
	"OES_element_index_uint", "OES_fbo_render_mipmap", "OES_standard_derivatives",
	"OES_texture_float", "OES_texture_float_linear", "OES_texture_half_float",
	"OES_texture_half_float_linear", "OES_vertex_array_object",
	"WEBGL_color_buffer_float", "WEBGL_compressed_texture_s3tc",
	"WEBGL_compressed_texture_s3tc_srgb", "WEBGL_debug_renderer_info",
	"WEBGL_debug_shaders", "WEBGL_depth_texture", "WEBGL_draw_buffers",
	"WEBGL_lose_context", "WEBGL_multi_draw",
}

var webglExtOptional = []string{
	"EXT_disjoint_timer_query", "EXT_texture_compression_bptc",
	"EXT_texture_compression_rgtc", "WEBGL_compressed_texture_astc",
	"WEBGL_compressed_texture_etc", "OES_draw_buffers_indexed",
	"EXT_color_buffer_float",
}

// ──────────────────── 插件 (Chrome 固有) ────────────────────

var pluginsPool = []map[string]string{
	{"name": "PDF Viewer", "filename": "internal-pdf-viewer", "description": "Portable Document Format"},
	{"name": "Chrome PDF Viewer", "filename": "internal-pdf-viewer", "description": "Portable Document Format"},
	{"name": "Chromium PDF Viewer", "filename": "internal-pdf-viewer", "description": "Portable Document Format"},
	{"name": "Microsoft Edge PDF Viewer", "filename": "internal-pdf-viewer", "description": "Portable Document Format"},
	{"name": "WebKit built-in PDF", "filename": "internal-pdf-viewer", "description": "Portable Document Format"},
}

// ──────────────────── 数据结构 ────────────────────

// ScreenInfo 屏幕信息
type ScreenInfo struct {
	Width, Height, AvailWidth, AvailHeight, ColorDepth int
}

// BrowserIdentity 浏览器身份
type BrowserIdentity struct {
	ChromeVer           string
	UA                  string
	SecUA               string
	GPUVendor           string
	GPUModel            string
	WebGLExts           []string
	CanvasHash          int32
	HistogramBase       [256]int
	MathTan             string
	MathSin             string
	MathCos             string
	Plugins             []map[string]string
	Screen              ScreenInfo
	DeviceMemory        int
	HardwareConcurrency int
	Platform            string
	LsubidPrefixSignin  string
	LsubidPrefixProfile string
	WebpackHash         string
}

// ──────────────────── 算法: 硬件配置生成 ────────────────────
// 生成合理的 CPU + 内存组合

func genHardwareConfig() (cpu int, mem int) {
	type config struct {
		cpu int
		mem int
	}

	// 合理的配置组合 (低端、中端、高端)
	configs := []config{
		// 低端配置 (30%)
		{2, 4}, {2, 8}, {4, 8}, {4, 12},
		// 中端配置 (50%)
		{4, 16}, {6, 16}, {8, 16}, {8, 24}, {10, 24}, {12, 24},
		// 高端配置 (20%)
		{12, 32}, {16, 32}, {16, 48}, {20, 48}, {24, 64},
	}

	weights := []int{
		10, 10, 10, 10, // 低端
		12, 12, 15, 15, 15, 15, // 中端
		8, 8, 5, 3, 2, // 高端
	}

	totalWeight := 0
	for _, w := range weights {
		totalWeight += w
	}

	r := rand.Intn(totalWeight)
	accumulated := 0
	for i, w := range weights {
		accumulated += w
		if r < accumulated {
			return configs[i].cpu, configs[i].mem
		}
	}

	// 默认返回中端配置
	return 8, 16
}

// ──────────────────── 算法: GPU 智能选择 ────────────────────
// 根据 CPU 和内存档次选择合理的 GPU

func selectGPU(cpuCores int, memoryGB int) (vendor, model string) {
	type gpuFamily struct {
		chipVendor string
		prefix     string
		models     []string
	}

	// Intel 集成显卡 (低端)
	intelLowEnd := gpuFamily{
		chipVendor: "Intel",
		prefix:     "Intel(R) ",
		models: []string{
			"HD Graphics 520", "HD Graphics 530", "HD Graphics 620", "HD Graphics 630",
			"HD Graphics 4600", "HD Graphics 5500", "UHD Graphics 620", "UHD Graphics 630",
		},
	}

	// Intel 高端集显 (中端)
	intelHighEnd := gpuFamily{
		chipVendor: "Intel",
		prefix:     "Intel(R) ",
		models: []string{
			"Iris(R) Xe Graphics", "Iris(R) Plus Graphics 640", "Iris(R) Plus Graphics 655",
			"UHD Graphics 730", "UHD Graphics 770",
		},
	}

	// NVIDIA 入门独显 (中端)
	nvidiaEntry := gpuFamily{
		chipVendor: "NVIDIA",
		prefix:     "NVIDIA ",
		models: []string{
			"GeForce GTX 1050 Ti", "GeForce GTX 1650", "GeForce GTX 1060 6GB",
			"GeForce MX450", "GeForce MX550",
		},
	}

	// NVIDIA 主流独显 (高端)
	nvidiaMain := gpuFamily{
		chipVendor: "NVIDIA",
		prefix:     "NVIDIA ",
		models: []string{
			"GeForce GTX 1660 Super", "GeForce RTX 2060", "GeForce RTX 3050 Laptop GPU",
			"GeForce RTX 3060", "GeForce RTX 3060 Ti", "GeForce RTX 3070",
			"GeForce RTX 4060", "GeForce RTX 4070",
		},
	}

	// AMD 显卡 (中高端)
	amdGPUs := gpuFamily{
		chipVendor: "AMD",
		prefix:     "AMD ",
		models: []string{
			"Radeon RX 580", "Radeon RX 5500 XT", "Radeon RX 5600 XT",
			"Radeon RX 6600 XT", "Radeon RX 6700 XT", "Radeon RX 7600",
			"Radeon(TM) Graphics", "Radeon Vega 8 Graphics",
		},
	}

	var selectedFamily gpuFamily

	// 根据硬件配置档次选择 GPU
	if cpuCores <= 4 && memoryGB <= 12 {
		// 低端配置 → Intel 低端集显
		selectedFamily = intelLowEnd
	} else if cpuCores <= 8 && memoryGB <= 24 {
		// 中端配置 → Intel 高端集显 / NVIDIA 入门独显 / AMD
		choices := []gpuFamily{intelHighEnd, intelHighEnd, nvidiaEntry, amdGPUs}
		selectedFamily = choices[rand.Intn(len(choices))]
	} else {
		// 高端配置 → NVIDIA 主流独显 / AMD 高端
		choices := []gpuFamily{nvidiaMain, nvidiaMain, amdGPUs}
		selectedFamily = choices[rand.Intn(len(choices))]
	}

	// 从选中的 GPU 系列中随机选择一个型号
	m := selectedFamily.models[rand.Intn(len(selectedFamily.models))]

	vendor = fmt.Sprintf("Google Inc. (%s)", selectedFamily.chipVendor)
	model = fmt.Sprintf("ANGLE (%s, %s%s Direct3D11 vs_5_0 ps_5_0, D3D11)", selectedFamily.chipVendor, selectedFamily.prefix, m)
	return
}

// ──────────────────── 算法: GPU 配置生成 (保留原函数作为后备) ────────────────────
// 规律: Vendor = "Google Inc. ({芯片厂商})"
//       Model  = "ANGLE ({芯片厂商}, {芯片型号} Direct3D11 vs_5_0 ps_5_0, D3D11)"

func genGPU() (vendor, model string) {
	type gpuFamily struct {
		chipVendor string
		prefix     string
		models     []string
	}

	families := []gpuFamily{
		{
			chipVendor: "Intel",
			prefix:     "Intel(R) ",
			models: []string{
				"UHD Graphics 630", "UHD Graphics 730", "UHD Graphics 770",
				"HD Graphics 530", "HD Graphics 620", "HD Graphics 630",
				"Iris(R) Xe Graphics", "Iris(R) Xe Graphics (0x000046A6)",
				"Iris(R) Plus Graphics", "UHD Graphics", "HD Graphics 520",
				"UHD Graphics 620", "Iris(R) Plus Graphics 655", "Iris(R) Plus Graphics 640",
				"HD Graphics 4600", "HD Graphics 5500",
			},
		},
		{
			chipVendor: "NVIDIA",
			prefix:     "NVIDIA ",
			models: []string{
				"GeForce GTX 960", "GeForce GTX 970", "GeForce GTX 980 Ti",
				"GeForce GTX 1050 Ti", "GeForce GTX 1060 6GB", "GeForce GTX 1070",
				"GeForce GTX 1080", "GeForce GTX 1080 Ti", "GeForce GTX 1650",
				"GeForce GTX 1660 Super", "GeForce RTX 2060", "GeForce RTX 2070",
				"GeForce RTX 2080", "GeForce RTX 3050 Laptop GPU", "GeForce RTX 3060",
				"GeForce RTX 3060 Ti", "GeForce RTX 3070", "GeForce RTX 3080",
				"GeForce RTX 4060", "GeForce RTX 4070", "GeForce RTX 4080", "GeForce RTX 4090",
			},
		},
		{
			chipVendor: "AMD",
			prefix:     "AMD ",
			models: []string{
				"Radeon RX 580", "Radeon RX 5600 XT", "Radeon RX 5700 XT",
				"Radeon RX 6600 XT", "Radeon RX 6700 XT", "Radeon RX 6800 XT",
				"Radeon RX 7600", "Radeon RX 7800 XT", "Radeon RX 7900 XTX",
				"Radeon Vega 8 Graphics", "Radeon(TM) Graphics", "Radeon RX Vega 11 Graphics",
				"Radeon RX 5500 XT", "Radeon R9 390", "Radeon RX 480",
			},
		},
	}

	f := families[rand.Intn(len(families))]
	m := f.models[rand.Intn(len(f.models))]

	vendor = fmt.Sprintf("Google Inc. (%s)", f.chipVendor)
	model = fmt.Sprintf("ANGLE (%s, %s%s Direct3D11 vs_5_0 ps_5_0, D3D11)", f.chipVendor, f.prefix, m)
	return
}

// ──────────────────── 算法: 屏幕分辨率生成 ────────────────────
// 规律: AvailHeight = Height - taskbar(32~48), AvailWidth = Width, ColorDepth = 24

// genScreen 动态生成屏幕分辨率 (带权重分布)
func genScreen() ScreenInfo {
	type resolution struct {
		w, h int
	}

	type resolutionWeight struct {
		res    resolution
		weight int
	}

	// 按市场份额分配权重
	resolutions := []resolutionWeight{
		// 低分辨率 (20% - 老旧设备)
		{resolution{1366, 768}, 8}, {resolution{1440, 900}, 8}, {resolution{1536, 864}, 6}, {resolution{1600, 900}, 6},
		// 标准 FHD (50% - 主流)
		{resolution{1680, 1050}, 15}, {resolution{1920, 1080}, 20}, {resolution{1920, 1200}, 10},
		// 高分辨率 (30% - 高端设备)
		{resolution{2560, 1440}, 12}, {resolution{2560, 1600}, 10}, {resolution{3440, 1440}, 6}, {resolution{3840, 2160}, 5},
	}

	totalWeight := 0
	for _, rw := range resolutions {
		totalWeight += rw.weight
	}

	r := rand.Intn(totalWeight)
	accumulated := 0
	var selectedRes resolution
	for _, rw := range resolutions {
		accumulated += rw.weight
		if r < accumulated {
			selectedRes = rw.res
			break
		}
	}

	// 如果没有选中，使用最常见的分辨率
	if selectedRes.w == 0 {
		selectedRes = resolution{1920, 1080}
	}

	// 任务栏高度 32~48 像素，圆整到 8 的倍数
	taskbar := 32 + rand.Intn(17) // 32-48
	taskbar = (taskbar / 8) * 8
	if taskbar < 32 {
		taskbar = 32
	}

	// ColorDepth: 24 常见, 30 是 HDR
	colorDepths := []int{24, 24, 24, 24, 30}
	colorDepth := colorDepths[rand.Intn(len(colorDepths))]

	return ScreenInfo{
		Width:       selectedRes.w,
		Height:      selectedRes.h,
		AvailWidth:  selectedRes.w,
		AvailHeight: selectedRes.h - taskbar,
		ColorDepth:  colorDepth,
	}
}

// ──────────────────── 算法: Math 精度生成 ────────────────────
// 规律: Math.tan/sin/cos(-1e300) 在不同硬件上仅末位 1-2 位有差异
// tan 基准: "-1.4214488238747245"  末位 3~7
// sin 基准: "0.8178819121159085"   末位 3~7
// cos 有两个家族:
//   家族A: "-0.5753861119575491"   末位 89~93
//   家族B: "-0.5765775004286854"   末位 53~55

func genMath() (tan, sin, cos string) {
	tanEnd := 3 + rand.Intn(100) // 放大截断随机差
	sinEnd := 3 + rand.Intn(100)
	tan = fmt.Sprintf("-1.42144882387472%03d", tanEnd)
	sin = fmt.Sprintf("0.81788191211590%03d", sinEnd)

	// cos 有两个家族, 家族A 更常见 (~70%)
	if rand.Intn(10) < 7 {
		cosEnd := 89 + rand.Intn(15) // 更大范围
		cos = fmt.Sprintf("-0.5753861119575%03d", cosEnd)
	} else {
		cosEnd := 53 + rand.Intn(10)
		cos = fmt.Sprintf("-0.5765775004286%03d", cosEnd)
	}
	return
}

// ──────────────────── 算法: Canvas Histogram 模拟 ────────────────────
// 分析 collect_histogram.html 的渲染逻辑 (150×60 canvas, 36000 RGBA 样本):
//
// 1. 大量透明背景 → bins[0] 极大 (R=0,G=0,B=0,A=0 → 每个透明像素贡献 4 个 0)
// 2. 绘制区域 alpha=255 → bins[255] 极大
// 3. #f60 = RGB(255,102,0) 矩形 → bins[102] 出现 spike (~500-700)
// 4. multiply/difference 混合模式 + 圆形 → 产生 ~153 附近的 spike (~400-700)
// 5. 文字抗锯齿 + 渐变 + 曲线 → 中间 bins 分散在 4-120

func generateCanvasData() (int32, [256]int) {
	var bins [256]int
	const totalSamples = 36000 // 150×60×4(RGBA)

	// ── 主峰: 背景透明区 + Alpha 通道 ──
	bins[0] = 5000 + rand.Intn(10001)   // 5000~15000
	bins[255] = 6000 + rand.Intn(10001) // 6000~16000

	// ── 次要 spike: 来自特定颜色值 ──
	// #f60 矩形的 G 通道 = 102
	spike1Pos := 100 + rand.Intn(6) // 100~105, 围绕 102
	bins[spike1Pos] = 500 + rand.Intn(200)

	// multiply 混合产生的值, 围绕 153
	spike2Pos := 150 + rand.Intn(8) // 150~157, 围绕 153
	bins[spike2Pos] = 400 + rand.Intn(300)

	// ── 计算已分配的样本数 ──
	assigned := bins[0] + bins[255] + bins[spike1Pos] + bins[spike2Pos]
	remaining := totalSamples - assigned

	// ── 特征颜色区 (中等值, 来自绘图操作) ──
	// 这些是 circle/gradient/text 渲染常产生的值范围
	featureBins := []struct {
		lo, hi   int // bin 范围
		avgCount int // 每个 bin 平均计数
	}{
		{1, 30, 30},    // 深色区 (暗部抗锯齿)
		{31, 70, 20},   // 中暗区 (曲线/渐变)
		{71, 99, 25},   // 中间区 (混合色)
		{106, 149, 15}, // 中高区 (文字/渐变过渡)
		{158, 200, 18}, // 高亮区 (圆形着色)
		{201, 254, 25}, // 亮区 (接近白色)
	}

	for _, fb := range featureBins {
		for i := fb.lo; i <= fb.hi; i++ {
			if remaining <= 0 {
				break
			}
			// 正态分布风格: 中心值多，两侧少
			center := (fb.lo + fb.hi) / 2
			dist := abs(i - center)
			maxDist := (fb.hi - fb.lo) / 2
			if maxDist == 0 {
				maxDist = 1
			}
			// 衰减因子
			scale := float64(maxDist-dist) / float64(maxDist)
			if scale < 0.2 {
				scale = 0.2
			}
			base := int(float64(fb.avgCount) * scale)
			v := max(2, base+rand.Intn(max(1, base/2+1))-base/4)
			if v > remaining {
				v = remaining
			}
			bins[i] = v
			remaining -= v
		}
	}

	// ── 未分配的 bins 补充少量噪声 ──
	for i := 1; i < 255; i++ {
		if bins[i] == 0 && remaining > 0 {
			v := 2 + rand.Intn(8) // 2-9 的微小噪声
			if v > remaining {
				v = remaining
			}
			bins[i] = v
			remaining -= v
		}
	}

	// ── 余量归入 bins[0] (最大的 bin 微调不影响分布形状) ──
	if remaining > 0 {
		bins[0] += remaining
	} else if remaining < 0 {
		// 如果超出了, 从 bins[0] 扣除
		bins[0] += remaining // remaining is negative
		if bins[0] < 10000 {
			bins[0] = 10000
		}
	}

	// ── 计算 hash: SHA256(bins 的 LE 字节序列) 截取前 4 字节 → int32 ──
	raw := make([]byte, 256*4)
	for i, v := range bins {
		binary.LittleEndian.PutUint32(raw[i*4:], uint32(v))
	}
	digest := sha256.Sum256(raw)
	hash := int32(binary.LittleEndian.Uint32(digest[:4]))
	return hash, bins
}

// abs 整数绝对值
func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

// ──────────────────── 核心: 随机身份生成 ────────────────────

// RandomIdentity 创建随机浏览器身份 (带去重检查)
func RandomIdentity() *BrowserIdentity {
	const maxAttempts = 100 // 最多尝试100次生成唯一指纹
	
	for attempt := 0; attempt < maxAttempts; attempt++ {
		id := generateRandomIdentity()
		
		// 检查是否24小时内使用过
		if !globalFpCache.IsRecentlyUsed(id) {
			globalFpCache.MarkUsed(id)
			if attempt > 0 {
				fmt.Printf("[指纹] 生成唯一指纹 (尝试 %d 次): %s\n", attempt+1, id.Hash()[:16])
			}
			return id
		}
		
		// 如果重复，继续尝试
		if attempt < maxAttempts-1 {
			continue
		}
	}
	
	// 100次尝试后仍重复，记录警告但继续使用
	fmt.Printf("[指纹] ⚠️  警告: %d 次尝试后仍有重复，强制使用新指纹\n", maxAttempts)
	id := generateRandomIdentity()
	globalFpCache.MarkUsed(id)
	return id
}

// generateRandomIdentity 生成随机身份 (内部函数)
func generateRandomIdentity() *BrowserIdentity {
	// Chrome 版本
	cv := genChromeVersion()

	// 硬件配置 (CPU + 内存)
	hardwareConcurrency, deviceMemory := genHardwareConfig()

	// GPU (根据硬件配置智能选择)
	gpuVendor, gpuModel := selectGPU(hardwareConcurrency, deviceMemory)

	// Screen
	screen := genScreen()

	platform := "Win32"

	// Math 精度
	mathTan, mathSin, mathCos := genMath()

	// Canvas 数据
	canvasHash, histogram := generateCanvasData()

	// WebGL 扩展
	exts := make([]string, len(webglExtCore))
	copy(exts, webglExtCore)
	nOpt := rand.Intn(5)
	if nOpt > 0 && nOpt <= len(webglExtOptional) {
		perm := rand.Perm(len(webglExtOptional))
		for i := 0; i < nOpt; i++ {
			exts = append(exts, webglExtOptional[perm[i]])
		}
	}
	sort.Strings(exts)

	// 插件 (Chrome 内置 PDF 插件, 随机排列)
	plugins := make([]map[string]string, len(pluginsPool))
	copy(plugins, pluginsPool)
	rand.Shuffle(len(plugins), func(i, j int) { plugins[i], plugins[j] = plugins[j], plugins[i] })

	ua := fmt.Sprintf("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Safari/537.36", cv.Version)

	return &BrowserIdentity{
		ChromeVer:           cv.Version,
		UA:                  ua,
		SecUA:               cv.SecUA,
		GPUVendor:           gpuVendor,
		GPUModel:            gpuModel,
		WebGLExts:           exts,
		CanvasHash:          canvasHash,
		HistogramBase:       histogram,
		MathTan:             mathTan,
		MathSin:             mathSin,
		MathCos:             mathCos,
		Plugins:             plugins,
		Screen:              screen,
		DeviceMemory:        deviceMemory,
		HardwareConcurrency: hardwareConcurrency,
		Platform:            platform,
		LsubidPrefixSignin:  lsubidPrefixes[rand.Intn(len(lsubidPrefixes))],
		LsubidPrefixProfile: lsubidPrefixes[rand.Intn(len(lsubidPrefixes))],
		WebpackHash:         fmt.Sprintf("%x", rand.Int63())[:10],
	}
}
