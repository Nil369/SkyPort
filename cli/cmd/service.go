package cmd

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/pterm/pterm"
	"github.com/spf13/cobra"

	"skyport-cli/internal/ui"
)

func newServiceCommand() *cobra.Command {
	var binaryName string
	var serviceName string
	cmd := &cobra.Command{Use: "service", Short: "Manage Linux systemd services"}
	cmd.PersistentFlags().StringVar(&binaryName, "binary", "skyport-server", "binary name to manage")
	cmd.PersistentFlags().StringVar(&serviceName, "name", "skyport-server", "systemd service name")
	cmd.AddCommand(&cobra.Command{
		Use:   "install",
		Short: "Generate and install a systemd service",
		RunE: func(cmd *cobra.Command, args []string) error {
			return installService(binaryName, serviceName)
		},
	})
	cmd.AddCommand(&cobra.Command{
		Use:   "uninstall",
		Short: "Remove the systemd service",
		RunE: func(cmd *cobra.Command, args []string) error {
			return uninstallService(serviceName)
		},
	})
	cmd.AddCommand(&cobra.Command{
		Use:   "restart",
		Short: "Restart the systemd service",
		RunE: func(cmd *cobra.Command, args []string) error {
			return systemctl("restart", serviceName)
		},
	})
	cmd.AddCommand(&cobra.Command{
		Use:   "status",
		Short: "Show systemd service status",
		RunE: func(cmd *cobra.Command, args []string) error {
			return systemctl("status", serviceName)
		},
	})
	return cmd
}

func installService(binaryName, serviceName string) error {
	if runtime.GOOS != "linux" {
		return fmt.Errorf("systemd services are only supported on linux")
	}
	unit := fmt.Sprintf(`[Unit]
Description=SkyPort server
After=network-online.target

[Service]
Type=simple
ExecStart=%s
Restart=always
RestartSec=5
Environment=SKYPORT_SERVER=localhost

[Install]
WantedBy=multi-user.target
`, filepath.Base(binaryName))
	path := filepath.Join("/etc/systemd/system", serviceName+".service")
	if isRootUser() {
		if err := os.WriteFile(path, []byte(unit), 0o644); err != nil {
			return err
		}
		return systemctl("enable", serviceName)
	}
	ui.Warnf("Not running as root; printing generated unit file")
	fmt.Println(unit)
	return nil
}

func uninstallService(serviceName string) error {
	if runtime.GOOS != "linux" {
		return fmt.Errorf("systemd services are only supported on linux")
	}
	if isRootUser() {
		_ = systemctl("disable", serviceName)
		path := filepath.Join("/etc/systemd/system", serviceName+".service")
		_ = os.Remove(path)
		return systemctl("daemon-reload", "")
	}
	return fmt.Errorf("uninstall requires root")
}

func isRootUser() bool {
	if runtime.GOOS != "linux" {
		return false
	}
	cmd := exec.Command("id", "-u")
	out, err := cmd.Output()
	if err != nil {
		return false
	}
	return strings.TrimSpace(string(out)) == "0"
}

func systemctl(action, serviceName string) error {
	if runtime.GOOS != "linux" {
		return fmt.Errorf("systemd services are only supported on linux")
	}
	args := []string{action}
	if strings.TrimSpace(serviceName) != "" && action != "daemon-reload" {
		args = append(args, serviceName+".service")
	}
	cmd := exec.Command("systemctl", args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	spinner, _ := pterm.DefaultSpinner.Start(strings.Title(action) + " service")
	err := cmd.Run()
	if err != nil {
		spinner.Fail(err.Error())
		return err
	}
	spinner.Success("systemctl " + action + " complete")
	return nil
}
