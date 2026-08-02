//go:build windows
// +build windows

package main

import (
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

// getPlatformOptions 返回 Windows 平台特定选项
func getPlatformOptions() []func(*options.App) {
	return []func(*options.App){
		func(app *options.App) {
			app.Windows = &windows.Options{
				WebviewIsTransparent: false,
				WindowIsTranslucent:  false,
				DisableWindowIcon:    false,
			}
		},
	}
}
