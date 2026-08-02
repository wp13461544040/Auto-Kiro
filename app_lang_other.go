//go:build !windows

package main

// detectOSLanguageNative 非 Windows 平台依赖环境变量，无原生回落
func detectOSLanguageNative() string { return "" }
