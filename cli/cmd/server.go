package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"skyport-cli/internal/api"
	"skyport-cli/internal/store"
	"skyport-cli/internal/terminal"
	"skyport-cli/internal/ui"
)

func newServerCommand() *cobra.Command {
	cmd := &cobra.Command{Use: "server", Short: "Manage server profiles and VPS access"}
	cmd.AddCommand(newServerListCommand())
	cmd.AddCommand(newServerAddCommand())
	cmd.AddCommand(newServerRemoveCommand())
	cmd.AddCommand(newServerSSHCommand())
	return cmd
}

func newServerListCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "list",
		Short: "List configured server profiles",
		RunE: func(cmd *cobra.Command, args []string) error {
			app, err := currentApp(cmd)
			if err != nil {
				return err
			}
			profiles := app.Store.ListServers()
			rows := make([][]string, 0, len(profiles))
			for _, profile := range profiles {
				active := ""
				if app.Config.ActiveServer == profile.ID {
					active = "*"
				}
				rows = append(rows, []string{active, profile.Name, profile.BaseURL, profile.ID, ui.HumanDuration(timeSince(profile.CreatedAt))})
			}
			if outputFormat() == "json" {
				payload, _ := json.MarshalIndent(profiles, "", "  ")
				fmt.Println(string(payload))
				return nil
			}
			return ui.Table([]string{"", "Name", "URL", "ID", "Age"}, rows)
		},
	}
}

func newServerAddCommand() *cobra.Command {
	var name string
	var baseURL string
	var description string
	var makeDefault bool
	cmd := &cobra.Command{
		Use:   "add",
		Short: "Add a SkyPort server profile",
		RunE: func(cmd *cobra.Command, args []string) error {
			app, err := currentApp(cmd)
			if err != nil {
				return err
			}
			if strings.TrimSpace(name) == "" {
				name, err = ui.Prompt("Profile name", "main")
				if err != nil {
					return err
				}
			}
			if strings.TrimSpace(baseURL) == "" {
				baseURL, err = ui.Prompt("SkyPort server URL", "http://localhost:8080")
				if err != nil {
					return err
				}
			}
			profile, err := app.Store.AddServer(storeProfile(name, baseURL, description, makeDefault))
			if err != nil {
				return err
			}
			app.Profile = profile
			app.Client = api.New(profile.BaseURL, app.Token)
			ui.Successf("Added server profile %s -> %s", profile.Name, profile.BaseURL)
			return nil
		},
	}
	cmd.Flags().StringVarP(&name, "name", "n", "", "profile name")
	cmd.Flags().StringVarP(&baseURL, "url", "u", "", "SkyPort server URL")
	cmd.Flags().StringVarP(&description, "description", "d", "", "profile description")
	cmd.Flags().BoolVar(&makeDefault, "default", false, "set as active profile")
	return cmd
}

func newServerRemoveCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "remove <profile>",
		Short: "Remove a server profile",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			app, err := currentApp(cmd)
			if err != nil {
				return err
			}
			profile, ok := app.Store.ResolveServer(args[0])
			if !ok {
				return fmt.Errorf("profile %q not found", args[0])
			}
			confirmed, err := ui.Confirm(fmt.Sprintf("Remove %s", profile.Name), false)
			if err != nil || !confirmed {
				return err
			}
			return app.Store.RemoveServer(profile.ID)
		},
	}
}

func newServerSSHCommand() *cobra.Command {
	var vpsID string
	cmd := &cobra.Command{
		Use:   "ssh",
		Short: "Open a realtime SSH terminal to a VPS",
		RunE: func(cmd *cobra.Command, args []string) error {
			app, err := requireClient(cmd)
			if err != nil {
				return err
			}
			if strings.TrimSpace(vpsID) == "" && len(args) > 0 {
				vpsID = args[0]
			}
			if strings.TrimSpace(vpsID) == "" {
				vpsID, err = ui.Prompt("VPS ID", "")
				if err != nil {
					return err
				}
			}
			wsConn, _, err := app.Client.OpenWebSocket(context.Background(), "/ws/vps/"+vpsID)
			if err != nil {
				return err
			}
			defer wsConn.Close()
			ui.Infof("Connected to VPS %s", vpsID)
			return terminal.Run(context.Background(), wsConn)
		},
	}
	cmd.Flags().StringVarP(&vpsID, "id", "i", "", "VPS ID")
	return cmd
}

func storeProfile(name, baseURL, description string, makeDefault bool) store.ServerProfile {
	return store.ServerProfile{Name: strings.TrimSpace(name), BaseURL: strings.TrimSpace(baseURL), Description: strings.TrimSpace(description), Default: makeDefault}
}

func timeSince(t time.Time) time.Duration {
	if t.IsZero() {
		return 0
	}
	return time.Since(t)
}