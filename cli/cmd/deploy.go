package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/pterm/pterm"
	"github.com/spf13/cobra"

	"skyport-cli/internal/api"
	"skyport-cli/internal/ui"
)

func newDeployCommand() *cobra.Command {
	var projectName string
	var projectPath string
	var gitURL string
	var privateRepo bool
	var strategy string
	var autoStart bool
	var port int
	var workingDirectory string
	var startCmd string
	var installCmd string
	var buildCmd string
	var envPairs []string
	cmd := &cobra.Command{
		Use:   "deploy",
		Short: "Create a deployment for a project",
		RunE: func(cmd *cobra.Command, args []string) error {
			app, err := requireClient(cmd)
			if err != nil {
				return err
			}
			if projectPath == "" {
				projectPath, err = ui.Prompt("Project path", "")
				if err != nil {
					return err
				}
			}
			projectPath, err = filepath.Abs(projectPath)
			if err != nil {
				return err
			}
			projects, err := app.Client.ListProjects(context.Background())
			if err != nil {
				return err
			}
			projectID, err := ensureProject(app, projects, projectName, projectPath, gitURL, privateRepo)
			if err != nil {
				return err
			}
			req := map[string]any{"project_id": projectID, "auto_start": autoStart}
			if strings.TrimSpace(strategy) != "" {
				req["strategy"] = strategy
			}
			if port > 0 {
				req["port"] = port
			}
			if strings.TrimSpace(workingDirectory) != "" {
				req["working_directory"] = workingDirectory
			}
			if strings.TrimSpace(startCmd) != "" {
				req["start_cmd"] = startCmd
			}
			if strings.TrimSpace(installCmd) != "" {
				req["install_cmd"] = installCmd
			}
			if strings.TrimSpace(buildCmd) != "" {
				req["build_cmd"] = buildCmd
			}
			if len(envPairs) > 0 {
				req["env"] = parseEnvPairs(envPairs)
			}
			spinner, _ := pterm.DefaultSpinner.Start("Creating deployment")
			dep, err := app.Client.CreateDeployment(context.Background(), req)
			if err != nil {
				spinner.Fail(err.Error())
				return err
			}
			spinner.Success("Deployment created")
			if outputFormat() == "json" {
				payload, _ := json.MarshalIndent(dep, "", "  ")
				fmt.Println(string(payload))
				return nil
			}
			ui.Successf("Deployment #%d created with status %s", dep.ID, dep.Status)
			return nil
		},
	}
	cmd.Flags().StringVar(&projectName, "project-name", "", "project name")
	cmd.Flags().StringVar(&projectPath, "project-path", "", "project path")
	cmd.Flags().StringVar(&gitURL, "git-url", "", "git repository URL")
	cmd.Flags().BoolVar(&privateRepo, "private", false, "private git repository")
	cmd.Flags().StringVar(&strategy, "strategy", "", "deployment strategy")
	cmd.Flags().BoolVar(&autoStart, "auto-start", true, "start immediately")
	cmd.Flags().IntVar(&port, "port", 0, "application port")
	cmd.Flags().StringVar(&workingDirectory, "working-directory", "", "subdirectory inside project")
	cmd.Flags().StringVar(&startCmd, "start-cmd", "", "start command")
	cmd.Flags().StringVar(&installCmd, "install-cmd", "", "install command")
	cmd.Flags().StringVar(&buildCmd, "build-cmd", "", "build command")
	cmd.Flags().StringArrayVar(&envPairs, "env", nil, "environment variable in KEY=VALUE form")
	return cmd
}

func ensureProject(app *App, projects []api.Project, name, path, gitURL string, privateRepo bool) (uint, error) {
	for _, project := range projects {
		if filepath.Clean(project.Path) == filepath.Clean(path) {
			return project.ID, nil
		}
		if strings.EqualFold(project.Name, name) && name != "" {
			return project.ID, nil
		}
	}
	if strings.TrimSpace(name) == "" {
		name = filepath.Base(path)
	}
	req := map[string]any{"name": name, "private": privateRepo}
	if gitURL != "" {
		req["git_url"] = gitURL
		req["private"] = privateRepo
	}
	created, err := app.Client.CreateProject(context.Background(), req)
	if err != nil {
		return 0, err
	}
	return created.ID, nil
}

func parseEnvPairs(items []string) map[string]string {
	out := map[string]string{}
	for _, item := range items {
		parts := strings.SplitN(item, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		if key == "" {
			continue
		}
		out[key] = parts[1]
	}
	return out
}
