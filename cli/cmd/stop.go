package cmd

import (
	"context"
	"time"

	"github.com/spf13/cobra"

	"skyport-cli/internal/daemon"
	"skyport-cli/internal/ui"
)

func newStopCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "stop",
		Short: "Stop the SkyPort backend daemon",
		RunE: func(cmd *cobra.Command, args []string) error {
			manager, err := daemon.New()
			if err != nil {
				return err
			}

			ctx, cancel := context.WithTimeout(cmd.Context(), 15*time.Second)
			defer cancel()

			if err := manager.Stop(ctx); err != nil {
				return err
			}

			ui.Successf("SkyPort backend stopped")
			return nil
		},
	}
}
