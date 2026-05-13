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

func newMarketplaceCommand() *cobra.Command {
	cmd := &cobra.Command{Use: "marketplace", Short: "Browse the SkyPort marketplace"}
	cmd.AddCommand(newMarketplaceListCommand())
	cmd.AddCommand(newMarketplaceInstallCommand())
	return cmd
}

func newMarketplaceListCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "list",
		Short: "List marketplace apps",
		RunE: func(cmd *cobra.Command, args []string) error {
			app, err := requireClient(cmd)
			if err != nil {
				return err
			}
			apps, err := app.Client.ListMarketplaceApps(context.Background())
			if err != nil {
				return err
			}
			if outputFormat() == "json" {
				payload, _ := json.MarshalIndent(apps, "", "  ")
				fmt.Println(string(payload))
				return nil
			}
			rows := make([][]string, 0, len(apps))
			for _, item := range apps {
				rows = append(rows, []string{item.Name, item.Slug, item.Category, strings.Join(item.InstallModes, ", ")})
			}
			return ui.Table([]string{"Name", "Slug", "Category", "Install Modes"}, rows)
		},
	}
}

func newMarketplaceInstallCommand() *cobra.Command {
	var slug string
	var mode string
	var notes string
	cmd := &cobra.Command{
		Use:   "install",
		Short: "Record a marketplace install",
		RunE: func(cmd *cobra.Command, args []string) error {
			app, err := requireClient(cmd)
			if err != nil {
				return err
			}
			if slug == "" {
				slug, err = ui.Prompt("App slug", "")
				if err != nil {
					return err
				}
			}
			if mode == "" {
				mode, err = ui.Prompt("Install mode", "native")
				if err != nil {
					return err
				}
			}
			spinner, _ := pterm.DefaultSpinner.Start("Recording install")
			resp, err := app.Client.RecordMarketplaceInstall(context.Background(), slug, mode, "recorded", notes)
			if err != nil {
				spinner.Fail(err.Error())
				return err
			}
			spinner.Success("Install recorded")
			if outputFormat() == "json" {
				payload, _ := json.MarshalIndent(resp, "", "  ")
				fmt.Println(string(payload))
				return nil
			}
			ui.Successf("Recorded %s (%s)", slug, mode)
			return nil
		},
	}
	cmd.Flags().StringVar(&slug, "slug", "", "app slug")
	cmd.Flags().StringVar(&mode, "mode", "native", "install mode")
	cmd.Flags().StringVar(&notes, "notes", "", "install notes")
	return cmd
}
