//go:build !windows

package daemon

import (
	"os/exec"
	"syscall"
	"time"
)

func configureDetachedCommand(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true, Setpgid: true}
}

func terminateProcess(pid int) error {
	if !processExists(pid) {
		return nil
	}
	if err := syscall.Kill(pid, syscall.SIGTERM); err != nil && err != syscall.ESRCH {
		return err
	}
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if !processExists(pid) {
			return nil
		}
		time.Sleep(200 * time.Millisecond)
	}
	if err := syscall.Kill(pid, syscall.SIGKILL); err != nil && err != syscall.ESRCH {
		return err
	}
	return nil
}

func processExists(pid int) bool {
	if pid <= 0 {
		return false
	}
	err := syscall.Kill(pid, syscall.Signal(0))
	return err == nil || err == syscall.EPERM
}
