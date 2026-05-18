package cmd

import (
	"context"
	"fmt"
	"os"
	"runtime"
	"time"

	"github.com/pterm/pterm"
	"github.com/spf13/cobra"

	"skyport-cli/internal/daemon"
	"skyport-cli/internal/ui"
)

func newServiceCommand() *cobra.Command {
	var binaryPath string
	var serviceName string
	cmd := &cobra.Command{
		Use:   "service",
		Short: "Manage SkyPort backend service (systemd/launchd/Windows)",
		Long:  "Manage SkyPort backend service lifecycle across Linux (systemd), macOS (launchd), and Windows",
	}
	cmd.PersistentFlags().StringVar(&binaryPath, "binary", "", "path to skyport-server binary")
	cmd.PersistentFlags().StringVar(&serviceName, "name", "", "service name (default: platform-specific)")

	cmd.AddCommand(newServiceInstallCommand(&binaryPath, &serviceName))
	cmd.AddCommand(newServiceUninstallCommand(&binaryPath, &serviceName))
	cmd.AddCommand(newServiceStartCommand(&binaryPath, &serviceName))
	cmd.AddCommand(newServiceStopCommand(&binaryPath, &serviceName))
	cmd.AddCommand(newServiceRestartCommand(&binaryPath, &serviceName))
	cmd.AddCommand(newServiceStatusCommand(&binaryPath, &serviceName))
	cmd.AddCommand(newServiceEnableCommand(&binaryPath, &serviceName))
	cmd.AddCommand(newServiceDisableCommand(&binaryPath, &serviceName))

	return cmd
}

func newServiceInstallCommand(binaryPath, serviceName *string) *cobra.Command {
	return &cobra.Command{
		Use:   "install",
		Short: "Install and enable the SkyPort backend service",
		Long:  "Install the SkyPort backend as a native service (systemd on Linux, launchd on macOS, or SC.exe on Windows)",
		RunE: func(cmd *cobra.Command, args []string) error {
			return serviceInstall(cmd, *binaryPath, *serviceName)
		},
	}
}

func newServiceUninstallCommand(binaryPath, serviceName *string) *cobra.Command {
	return &cobra.Command{
		Use:   "uninstall",
		Short: "Remove the SkyPort backend service",
		RunE: func(cmd *cobra.Command, args []string) error {
			return serviceUninstall(cmd, *binaryPath, *serviceName)
		},
	}
}

func newServiceStartCommand(binaryPath, serviceName *string) *cobra.Command {
	return &cobra.Command{
		Use:   "start",
		Short: "Start the SkyPort backend service",
		RunE: func(cmd *cobra.Command, args []string) error {
			return serviceStart(cmd, *binaryPath, *serviceName)
		},
	}
}

func newServiceStopCommand(binaryPath, serviceName *string) *cobra.Command {
	return &cobra.Command{
		Use:   "stop",
		Short: "Stop the SkyPort backend service",
		RunE: func(cmd *cobra.Command, args []string) error {
			return serviceStop(cmd, *binaryPath, *serviceName)
		},
	}
}

func newServiceRestartCommand(binaryPath, serviceName *string) *cobra.Command {
	return &cobra.Command{
		Use:   "restart",
		Short: "Restart the SkyPort backend service",
		RunE: func(cmd *cobra.Command, args []string) error {
			return serviceRestart(cmd, *binaryPath, *serviceName)
		},
	}
}

func newServiceStatusCommand(binaryPath, serviceName *string) *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Show SkyPort backend service status",
		RunE: func(cmd *cobra.Command, args []string) error {
			return serviceStatus(cmd, *binaryPath, *serviceName)
		},
	}
}

func newServiceEnableCommand(binaryPath, serviceName *string) *cobra.Command {
	return &cobra.Command{
		Use:   "enable",
		Short: "Enable auto-start on boot",
		RunE: func(cmd *cobra.Command, args []string) error {
			return serviceEnable(cmd, *binaryPath, *serviceName)
		},
	}
}

func newServiceDisableCommand(binaryPath, serviceName *string) *cobra.Command {
	return &cobra.Command{
		Use:   "disable",
		Short: "Disable auto-start on boot",
		RunE: func(cmd *cobra.Command, args []string) error {
			return serviceDisable(cmd, *binaryPath, *serviceName)
		},
	}
}

// ============================================================
// SERVICE MANAGEMENT IMPLEMENTATIONS
// ============================================================

func serviceInstall(cmd *cobra.Command, binaryPath, serviceName string) error {
	ctx, cancel := context.WithTimeout(cmd.Context(), 30*time.Second)
	defer cancel()

	mgr, err := daemon.NewServiceManager()
	if err != nil {
		return err
	}

	name := serviceName
	if name == "" {
		name = daemon.DefaultServiceName()
	}

	binary := binaryPath
	if binary == "" {
		binary = resolveBinaryPath()
	}

	spinner, _ := pterm.DefaultSpinner.Start(fmt.Sprintf("Installing %s service...", name))
	defer spinner.Stop()

	if err := mgr.Install(ctx, binary, name); err != nil {
		spinner.Fail(err.Error())
		return err
	}

	spinner.Success(fmt.Sprintf("Service installed: %s", name))
	ui.Infof("Run 'skyport service start' to start the service")
	return nil
}

func serviceUninstall(cmd *cobra.Command, binaryPath, serviceName string) error {
	ctx, cancel := context.WithTimeout(cmd.Context(), 30*time.Second)
	defer cancel()

	mgr, err := daemon.NewServiceManager()
	if err != nil {
		return err
	}

	name := serviceName
	if name == "" {
		name = daemon.DefaultServiceName()
	}

	spinner, _ := pterm.DefaultSpinner.Start(fmt.Sprintf("Uninstalling %s service...", name))
	defer spinner.Stop()

	if err := mgr.Uninstall(ctx, name); err != nil {
		spinner.Fail(err.Error())
		return err
	}

	spinner.Success(fmt.Sprintf("Service uninstalled: %s", name))
	return nil
}

func serviceStart(cmd *cobra.Command, binaryPath, serviceName string) error {
	ctx, cancel := context.WithTimeout(cmd.Context(), 15*time.Second)
	defer cancel()

	mgr, err := daemon.NewServiceManager()
	if err != nil {
		return err
	}

	name := serviceName
	if name == "" {
		name = daemon.DefaultServiceName()
	}

	spinner, _ := pterm.DefaultSpinner.Start(fmt.Sprintf("Starting %s service...", name))
	defer spinner.Stop()

	if err := mgr.Start(ctx, name); err != nil {
		spinner.Fail(err.Error())
		return err
	}

	spinner.Success(fmt.Sprintf("Service started: %s", name))
	return nil
}

func serviceStop(cmd *cobra.Command, binaryPath, serviceName string) error {
	ctx, cancel := context.WithTimeout(cmd.Context(), 15*time.Second)
	defer cancel()

	mgr, err := daemon.NewServiceManager()
	if err != nil {
		return err
	}

	name := serviceName
	if name == "" {
		name = daemon.DefaultServiceName()
	}

	spinner, _ := pterm.DefaultSpinner.Start(fmt.Sprintf("Stopping %s service...", name))
	defer spinner.Stop()

	if err := mgr.Stop(ctx, name); err != nil {
		spinner.Fail(err.Error())
		return err
	}

	spinner.Success(fmt.Sprintf("Service stopped: %s", name))
	return nil
}

func serviceRestart(cmd *cobra.Command, binaryPath, serviceName string) error {
	ctx, cancel := context.WithTimeout(cmd.Context(), 15*time.Second)
	defer cancel()

	mgr, err := daemon.NewServiceManager()
	if err != nil {
		return err
	}

	name := serviceName
	if name == "" {
		name = daemon.DefaultServiceName()
	}

	spinner, _ := pterm.DefaultSpinner.Start(fmt.Sprintf("Restarting %s service...", name))
	defer spinner.Stop()

	if err := mgr.Restart(ctx, name); err != nil {
		spinner.Fail(err.Error())
		return err
	}

	spinner.Success(fmt.Sprintf("Service restarted: %s", name))
	return nil
}

func serviceStatus(cmd *cobra.Command, binaryPath, serviceName string) error {
	ctx, cancel := context.WithTimeout(cmd.Context(), 5*time.Second)
	defer cancel()

	mgr, err := daemon.NewServiceManager()
	if err != nil {
		return err
	}

	name := serviceName
	if name == "" {
		name = daemon.DefaultServiceName()
	}

	status, err := mgr.Status(ctx, name)
	if err != nil {
		return fmt.Errorf("status check failed: %w", err)
	}

	// Pretty print status
	fmt.Printf("\nService: %s\n", name)
	fmt.Printf("Platform: %s\n", runtime.GOOS)
	if status.Running {
		fmt.Printf("Status: %s (PID: %d)\n", status.Status, status.PID)
	} else {
		fmt.Printf("Status: %s\n", status.Status)
	}
	fmt.Printf("Enabled: %v\n", status.Enabled)
	if status.Error != "" {
		fmt.Printf("Error: %s\n", status.Error)
	}
	fmt.Printf("\n")

	return nil
}

func serviceEnable(cmd *cobra.Command, binaryPath, serviceName string) error {
	ctx, cancel := context.WithTimeout(cmd.Context(), 15*time.Second)
	defer cancel()

	mgr, err := daemon.NewServiceManager()
	if err != nil {
		return err
	}

	name := serviceName
	if name == "" {
		name = daemon.DefaultServiceName()
	}

	spinner, _ := pterm.DefaultSpinner.Start(fmt.Sprintf("Enabling %s service...", name))
	defer spinner.Stop()

	if err := mgr.Enable(ctx, name); err != nil {
		spinner.Fail(err.Error())
		return err
	}

	spinner.Success(fmt.Sprintf("Service enabled: %s (auto-start on boot)", name))
	return nil
}

func serviceDisable(cmd *cobra.Command, binaryPath, serviceName string) error {
	ctx, cancel := context.WithTimeout(cmd.Context(), 15*time.Second)
	defer cancel()

	mgr, err := daemon.NewServiceManager()
	if err != nil {
		return err
	}

	name := serviceName
	if name == "" {
		name = daemon.DefaultServiceName()
	}

	spinner, _ := pterm.DefaultSpinner.Start(fmt.Sprintf("Disabling %s service...", name))
	defer spinner.Stop()

	if err := mgr.Disable(ctx, name); err != nil {
		spinner.Fail(err.Error())
		return err
	}

	spinner.Success(fmt.Sprintf("Service disabled: %s (no auto-start)", name))
	return nil
}

func resolveBinaryPath() string {
	// Try common installation locations
	candidates := []string{
		"/usr/local/bin/skyport-server",
		"/opt/skyport/bin/skyport-server",
		"/usr/bin/skyport-server",
	}

	if runtime.GOOS == "windows" {
		candidates = []string{
			`C:\Program Files\SkyPort\skyport-server.exe`,
			`C:\Program Files (x86)\SkyPort\skyport-server.exe`,
		}
	}

	for _, path := range candidates {
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}

	// Default
	if runtime.GOOS == "windows" {
		return "skyport-server.exe"
	}
	return "skyport-server"
}
