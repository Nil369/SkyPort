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

func newLoginCommand() *cobra.Command {
	var email string
	var password string
	cmd := &cobra.Command{
		Use:   "login",
		Short: "Authenticate with the active SkyPort server",
		RunE: func(cmd *cobra.Command, args []string) error {
			app, err := requireClient(cmd)
			if err != nil {
				return err
			}
			if email == "" {
				email, err = ui.Prompt("Email", "")
				if err != nil {
					return err
				}
			}
			if password == "" {
				password, err = ui.Prompt("Password", "")
				if err != nil {
					return err
				}
			}
			if strings.TrimSpace(email) == "" || strings.TrimSpace(password) == "" {
				return fmt.Errorf("email and password are required")
			}
			spinner, _ := pterm.DefaultSpinner.Start("Signing in")
			resp, err := app.Client.Login(context.Background(), email, password)
			if err != nil {
				spinner.Fail(err.Error())
				return err
			}
			if err := app.Store.SaveToken(app.Profile.ID, resp.AccessToken); err != nil {
				spinner.Fail(err.Error())
				return err
			}
			spinner.Success("Signed in")
			ui.Successf("Authenticated as %s <%s>", resp.User.Name, resp.User.Email)
			if outputFormat() == "json" {
				payload, _ := json.MarshalIndent(resp, "", "  ")
				fmt.Println(string(payload))
			}
			return nil
		},
	}
	cmd.Flags().StringVarP(&email, "email", "e", "", "email address")
	cmd.Flags().StringVarP(&password, "password", "p", "", "password")
	return cmd
}

func newLogoutCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "logout",
		Short: "Revoke the active token",
		RunE: func(cmd *cobra.Command, args []string) error {
			app, err := requireClient(cmd)
			if err != nil {
				return err
			}
			if err := app.Client.Logout(context.Background()); err != nil {
				return err
			}
			if err := app.Store.DeleteToken(app.Profile.ID); err != nil {
				return err
			}
			ui.Successf("Logged out from %s", app.Profile.Name)
			return nil
		},
	}
}

func newWhoAmICommand() *cobra.Command {
	return &cobra.Command{
		Use:   "whoami",
		Short: "Show the authenticated user",
		RunE: func(cmd *cobra.Command, args []string) error {
			app, err := requireClient(cmd)
			if err != nil {
				return err
			}
			me, err := app.Client.WhoAmI(context.Background())
			if err != nil {
				return err
			}
			if outputFormat() == "json" {
				b, _ := json.MarshalIndent(me, "", "  ")
				fmt.Println(string(b))
				return nil
			}
			fmt.Println(ui.Accent.Sprint(me.Name), "<"+me.Email+">")
			fmt.Println(ui.Muted.Sprint(strings.Join(me.Roles, ", ")))
			return nil
		},
	}
}
