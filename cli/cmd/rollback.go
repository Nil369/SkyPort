package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/pterm/pterm"
	"github.com/spf13/cobra"

	"skyport-cli/internal/ui"
)

func newRollbackCommand() *cobra.Command {
	var mode string
	cmd := &cobra.Command{
		Use:   "rollback <deployment-id>",
		Short: "Roll a deployment forward or restart it",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			app, err := requireClient(cmd)
			if err != nil {
				return err
			}
			spinner, _ := pterm.DefaultSpinner.Start("Rolling deployment")
			resp, err := app.Client.RolloutDeployment(context.Background(), args[0], mode)
			if err != nil {
				spinner.Fail(err.Error())
				return err
			}
			spinner.Success("Deployment rolled out")
			if outputFormat() == "json" {
				payload, _ := json.MarshalIndent(resp, "", "  ")
				fmt.Println(string(payload))
				return nil
			}
			ui.Successf("Deployment %s rolled out (%s)", args[0], strings.TrimSpace(mode))
			return nil
		},
	}
	cmd.Flags().StringVar(&mode, "mode", "restart", "reload or restart")
	return cmd
}
