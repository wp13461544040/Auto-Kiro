//go:build !windows

package updater

import "os/exec"

func hideWindow(cmd *exec.Cmd) {
	// 仅 Windows 需要隐藏控制台窗口
}
