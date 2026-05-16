package cmd

import (
	"context"
	"time"

	"github.com/spf13/cobra"

	"skyport-cli/internal/daemon"
	"skyport-cli/internal/ui"
)

func newRestartCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "restart",
		Short: "Restart the SkyPort backend daemon",
		RunE: func(cmd *cobra.Command, args []string) error {
			manager, err := daemon.New()
			if err != nil {
				return err
			}

			ctx, cancel := context.WithTimeout(cmd.Context(), 30*time.Second)
			defer cancel()

			if err := manager.Restart(ctx); err != nil {
				return err
			}

			ui.Successf("SkyPort backend restarted")
			ui.Successf("Web UI: %s", manager.WebURL())
			return nil
		},
	}
}
