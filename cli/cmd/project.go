package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"path"
	"strings"

	"github.com/pterm/pterm"
	"github.com/spf13/cobra"

	"skyport-cli/internal/ui"
)

func newProjectCommand() *cobra.Command {
	cmd := &cobra.Command{Use: "project", Short: "Manage SkyPort projects"}
	cmd.AddCommand(newProjectListCommand())
	cmd.AddCommand(newProjectPullCommand())
	return cmd
}

func newProjectListCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "list",
		Short: "List projects registered in SkyPort",
		RunE: func(cmd *cobra.Command, args []string) error {
			app, err := requireClient(cmd)
			if err != nil {
				return err
			}
			projects, err := app.Client.ListProjects(context.Background())
			if err != nil {
				return err
			}
			if outputFormat() == "json" {
				payload, _ := json.MarshalIndent(projects, "", "  ")
				fmt.Println(string(payload))
				return nil
			}
			rows := make([][]string, 0, len(projects))
			for _, item := range projects {
				rows = append(rows, []string{fmt.Sprint(item.ID), item.Name, item.Path, item.GitURL})
			}
			return ui.Table([]string{"ID", "Name", "Path", "Git URL"}, rows)
		},
	}
}

func newProjectPullCommand() *cobra.Command {
	var name string
	var privateRepo bool
	var branch string
	cmd := &cobra.Command{
		Use:   "pull <github-url>",
		Short: "Pull a project from GitHub into SkyPort",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			app, err := requireClient(cmd)
			if err != nil {
				return err
			}
			gitURL := strings.TrimSpace(args[0])
			if gitURL == "" {
				return fmt.Errorf("git url is required")
			}
			if name == "" {
				name = deriveProjectName(gitURL)
			}
			spinner, _ := pterm.DefaultSpinner.Start("Pulling project")
			req := map[string]any{
				"name":       name,
				"git_url":    gitURL,
				"private":    privateRepo,
				"git_branch": branch,
			}
			project, err := app.Client.CreateProject(context.Background(), req)
			if err != nil {
				spinner.Fail(err.Error())
				return err
			}
			spinner.Success("Project pulled")
			ui.Successf("Project %s created at %s", project.Name, project.Path)
			if outputFormat() == "json" {
				payload, _ := json.MarshalIndent(project, "", "  ")
				fmt.Println(string(payload))
			}
			return nil
		},
	}
	cmd.Flags().StringVar(&name, "name", "", "project name")
	cmd.Flags().BoolVar(&privateRepo, "private", false, "private repository")
	cmd.Flags().StringVar(&branch, "branch", "", "git branch")
	return cmd
}

func deriveProjectName(gitURL string) string {
	base := strings.TrimSuffix(path.Base(strings.TrimSpace(gitURL)), ".git")
	base = strings.TrimSpace(base)
	if base == "" || base == "." || base == "/" {
		return "project"
	}
	return base
}