//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

// detectOSLanguageNative 通过 Windows API GetUserDefaultLocaleName 获取系统语言
func detectOSLanguageNative() string {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	proc := kernel32.NewProc("GetUserDefaultLocaleName")
	const localeNameMaxLength = 85
	buf := make([]uint16, localeNameMaxLength)
	n, _, _ := proc.Call(uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)))
	if n == 0 {
		return ""
	}
	name := syscall.UTF16ToString(buf[:n])
	return mapLocaleToLang(name)
}
