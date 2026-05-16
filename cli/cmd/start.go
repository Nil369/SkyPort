package cmd

import (
	"context"
	"errors"
	"os/exec"
	"runtime"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/spf13/cobra"

	"skyport-cli/internal/daemon"
	"skyport-cli/internal/tui"
	"skyport-cli/internal/ui"
)

func newStartCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "start",
		Short: "Start the SkyPort backend daemon",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runStartDaemon(cmd, daemon.Options{})
		},
	}
	cmd.AddCommand(newStartServerCommand())
	cmd.AddCommand(newStartWebUICommand())
	cmd.AddCommand(newStartTUICommand())
	return cmd
}

func newStartServerCommand() *cobra.Command {
	return &cobra.Command{
		Use:    "server",
		Short:  "Start the SkyPort backend daemon",
		Hidden: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runStartDaemon(cmd, daemon.Options{})
		},
	}
}

func runStartDaemon(cmd *cobra.Command, opts daemon.Options) error {
	manager, err := daemon.NewWithOptions(opts)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(cmd.Context(), 15*time.Second)
	defer cancel()

	pid, err := manager.Start(ctx)
	if err != nil {
		var already *daemon.AlreadyRunningError
		if errors.As(err, &already) {
			return printDaemonSummary(cmd, manager)
		}
		return err
	}

	ui.Successf("SkyPort backend started")
	ui.Successf("Web UI: %s", manager.WebURL())
	ui.Successf("PID: %d", pid)
	return nil
}

func newStartWebUICommand() *cobra.Command {
	var host string
	var port int
	var binaryPath string
	var browser bool
	cmd := &cobra.Command{
		Use:   "webui",
		Short: "Start or open the embedded SkyPort web UI",
		RunE: func(cmd *cobra.Command, args []string) error {
			manager, err := daemon.NewWithOptions(daemon.Options{
				BinaryPath: strings.TrimSpace(binaryPath),
				Host:       strings.TrimSpace(host),
				Port:       port,
			})
			if err != nil {
				return err
			}

			ctx, cancel := context.WithTimeout(cmd.Context(), 90*time.Second)
			defer cancel()

			if err := manager.EnsureRunning(ctx); err != nil {
				return err
			}
			if err := manager.WaitForHealthy(ctx, 45*time.Second); err != nil {
				return err
			}

			ui.Successf("SkyPort backend ready")
			ui.Successf("Web UI available at %s", manager.WebURL())
			if browser {
				return openBrowser(manager.WebURL())
			}
			return nil
		},
	}
	cmd.Flags().StringVar(&host, "host", "", "HTTP bind address for the backend daemon")
	cmd.Flags().IntVar(&port, "port", 8080, "backend port")
	cmd.Flags().StringVar(&binaryPath, "binary", "", "path to the SkyPort backend binary")
	cmd.Flags().BoolVar(&browser, "browser", true, "open the browser once ready")
	return cmd
}

func openBrowser(target string) error {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("cmd", "/c", "start", "", target).Start()
	case "darwin":
		return exec.Command("open", target).Start()
	default:
		return exec.Command("xdg-open", target).Start()
	}
}

func printDaemonSummary(cmd *cobra.Command, manager *daemon.Manager) error {
	ctx, cancel := context.WithTimeout(cmd.Context(), 5*time.Second)
	defer cancel()
	status, err := manager.Status(ctx)
	if err != nil {
		return err
	}
	if !status.Running {
		ui.Warnf("SkyPort backend is not running")
		return nil
	}
	ui.Successf("SkyPort backend already running")
	ui.Successf("Web UI: %s", status.WebURL)
	if status.PID > 0 {
		ui.Successf("PID: %d", status.PID)
	} else {
		ui.Successf("PID: unknown")
	}
	return nil
}

func newStartTUICommand() *cobra.Command {
	return &cobra.Command{
		Use:   "tui",
		Short: "Start the interactive terminal UI",
		Long:  "Launch the embedded SkyPort terminal user interface for managing your infrastructure",
		RunE: func(cmd *cobra.Command, args []string) error {
			app, err := requireClient(cmd)
			if err != nil {
				return err
			}

			serverName := app.Profile.Name
			if strings.TrimSpace(serverName) == "" {
				serverName = app.Profile.BaseURL
			}

			tuiModel, err := tui.New(context.Background(), nil, app.Client, serverName)
			if err != nil {
				return err
			}

			if _, err := tea.NewProgram(tuiModel, tea.WithAltScreen()).Run(); err != nil {
				return err
			}

			return nil
		},
	}
}
