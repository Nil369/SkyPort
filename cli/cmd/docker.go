package cmd

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/pterm/pterm"
	"github.com/spf13/cobra"

	"skyport-cli/internal/ui"
)

func newDockerCommand() *cobra.Command {
	cmd := &cobra.Command{Use: "docker", Short: "Control the local Docker runtime"}
	cmd.AddCommand(newDockerPSCommand())
	cmd.AddCommand(newDockerLogsCommand())
	cmd.AddCommand(newDockerRestartCommand())
	return cmd
}

func newDockerPSCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "ps",
		Short: "List local Docker containers",
		RunE: func(cmd *cobra.Command, args []string) error {
			out, err := dockerCommandOutput("ps", "-a", "--format", "{{json .}}")
			if err != nil {
				return err
			}
			rows := [][]string{}
			for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
				if strings.TrimSpace(line) == "" {
					continue
				}
				var row map[string]any
				if json.Unmarshal([]byte(line), &row) != nil {
					continue
				}
				rows = append(rows, []string{
					stringField(row["ID"]),
					stringField(row["Names"]),
					stringField(row["Image"]),
					stringField(row["Status"]),
					stringField(row["Ports"]),
				})
			}
			if len(rows) == 0 {
				ui.Warnf("No containers found")
				return nil
			}
			return ui.Table([]string{"ID", "Name", "Image", "Status", "Ports"}, rows)
		},
	}
}

func newDockerLogsCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "logs <container>",
		Short: "Follow local Docker container logs",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runDockerInteractive("logs", "-f", args[0])
		},
	}
}

func newDockerRestartCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "restart <container>",
		Short: "Restart a local Docker container",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			spinner, _ := pterm.DefaultSpinner.Start("Restarting container")
			out, err := dockerCommandOutput("restart", args[0])
			if err != nil {
				spinner.Fail(err.Error())
				return err
			}
			spinner.Success("Container restarted")
			if strings.TrimSpace(string(out)) != "" {
				ui.Infof(strings.TrimSpace(string(out)))
			}
			return nil
		},
	}
}

func dockerCommandOutput(args ...string) ([]byte, error) {
	if _, err := exec.LookPath("docker"); err != nil {
		return nil, errors.New("docker executable not found in PATH")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "docker", args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.CombinedOutput()
}

func runDockerInteractive(args ...string) error {
	if _, err := exec.LookPath("docker"); err != nil {
		return errors.New("docker executable not found in PATH")
	}
	cmd := exec.Command("docker", args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	return cmd.Run()
}

func stringField(v any) string {
	s, _ := v.(string)
	return s
}
