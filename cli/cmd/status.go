package cmd

import (
	"context"
	"fmt"
	"time"

	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"

	"skyport-cli/internal/daemon"
	"skyport-cli/internal/ui"
)

func newStatusCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Show the SkyPort backend daemon status",
		RunE: func(cmd *cobra.Command, args []string) error {
			manager, err := daemon.New()
			if err != nil {
				return err
			}

			ctx, cancel := context.WithTimeout(cmd.Context(), 10*time.Second)
			defer cancel()

			status, err := manager.Status(ctx)
			if err != nil {
				return err
			}

			header := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("86")).Render("SkyPort Backend")
			fmt.Println(header)
			if !status.Running {
				fmt.Println(ui.Danger.Render("STOPPED"))
				return nil
			}

			fmt.Println(ui.Success.Render("RUNNING"))
			if status.PID > 0 {
				fmt.Printf("PID: %d\n", status.PID)
			} else {
				fmt.Println("PID: unknown")
			}
			if status.Uptime > 0 {
				fmt.Printf("Uptime: %s\n", ui.HumanDuration(status.Uptime))
			} else {
				fmt.Println("Uptime: starting")
			}
			if status.Healthy {
				fmt.Printf("Health: %s\n", ui.Success.Render("healthy"))
			} else {
				fmt.Printf("Health: %s\n", ui.Warning.Render("checking"))
			}
			fmt.Printf("Web UI: %s\n", status.WebURL)
			fmt.Printf("Logs: %s\n", status.LogsPath)
			return nil
		},
	}
}
