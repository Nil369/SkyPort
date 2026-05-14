package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/spf13/cobra"

	"skyport-cli/internal/pm2"
	"skyport-cli/internal/ui"
)

func newPM2Command() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "pm2",
		Short: "Manage PM2 processes",
		Long:  "Manage and monitor PM2 managed processes on your SkyPort instance",
	}
	cmd.AddCommand(newPM2ListCommand())
	cmd.AddCommand(newPM2LogsCommand())
	cmd.AddCommand(newPM2RestartCommand())
	cmd.AddCommand(newPM2StopCommand())
	cmd.AddCommand(newPM2StartCommand())
	cmd.AddCommand(newPM2DeleteCommand())
	return cmd
}

func newPM2ListCommand() *cobra.Command {
	var watch bool
	var filter string

	cmd := &cobra.Command{
		Use:   "list",
		Short: "List all PM2 processes",
		RunE: func(cmd *cobra.Command, args []string) error {
			app, err := requireClient(cmd)
			if err != nil {
				return err
			}

			ctx, cancel := context.WithTimeout(context.Background(), defaultTimeout)
			defer cancel()

			// Create PM2 client (pass app.Client which has the req method)
			pm2Client := pm2.NewHTTPClient(app.Client)

			processes, err := pm2Client.ListProcesses(ctx)
			if err != nil {
				return err
			}

			// Filter if needed
			if strings.TrimSpace(filter) != "" {
				filtered := make([]pm2.Process, 0)
				for _, p := range processes {
					if strings.Contains(strings.ToLower(p.Name), strings.ToLower(filter)) {
						filtered = append(filtered, p)
					}
				}
				processes = filtered
			}

			if outputFormat() == "json" {
				payload, _ := json.MarshalIndent(processes, "", "  ")
				fmt.Println(string(payload))
				return nil
			}

			// Format as beautiful table
			table := ui.NewTable([]string{"Name", "Mode", "Script", "PID", "CPU", "Memory", "Status", "Restarts", "Uptime"})

			for _, p := range processes {
				formatter := pm2.NewProcessFormatter(&p)
				table.AddRow(formatter.FormatRow()...)
			}

			table.Print(os.Stdout)

			if len(processes) == 0 {
				ui.Infof("No PM2 processes found")
			} else {
				fmt.Printf("\nShowing %d process(es)\n", len(processes))
			}

			return nil
		},
	}

	cmd.Flags().BoolVarP(&watch, "watch", "w", false, "Watch process updates (interactive)")
	cmd.Flags().StringVarP(&filter, "filter", "f", "", "Filter by process name")

	return cmd
}

func newPM2LogsCommand() *cobra.Command {
	var lines int
	var follow bool

	cmd := &cobra.Command{
		Use:   "logs [name|id]",
		Short: "View PM2 process logs",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			app, err := requireClient(cmd)
			if err != nil {
				return err
			}

			ctx, cancel := context.WithTimeout(context.Background(), defaultTimeout)
			defer cancel()

			pm2Client := pm2.NewHTTPClient(app.Client)

			nameOrID := args[0]
			logs, err := pm2Client.GetLogs(ctx, nameOrID, lines)
			if err != nil {
				return err
			}

			if len(logs.Lines) == 0 {
				ui.Infof("No logs found for process %q", nameOrID)
				return nil
			}

			ui.Infof("Logs for %s (last %d lines):", logs.Name, len(logs.Lines))
			fmt.Println(strings.Repeat("-", 80))
			for _, line := range logs.Lines {
				fmt.Println(line)
			}
			fmt.Println(strings.Repeat("-", 80))

			return nil
		},
	}

	cmd.Flags().IntVarP(&lines, "lines", "n", 50, "Number of log lines to show")
	cmd.Flags().BoolVarP(&follow, "follow", "f", false, "Follow logs (tail -f)")

	return cmd
}

func newPM2RestartCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "restart [name|id|all]",
		Short: "Restart PM2 process(es)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			app, err := requireClient(cmd)
			if err != nil {
				return err
			}

			ctx, cancel := context.WithTimeout(context.Background(), defaultTimeout)
			defer cancel()

			pm2Client := pm2.NewHTTPClient(app.Client)

			nameOrID := args[0]
			if err := pm2Client.RestartProcess(ctx, nameOrID); err != nil {
				return err
			}

			ui.Successf("Process %q restarted", nameOrID)
			return nil
		},
	}

	return cmd
}

func newPM2StopCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "stop [name|id|all]",
		Short: "Stop PM2 process(es)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			app, err := requireClient(cmd)
			if err != nil {
				return err
			}

			ctx, cancel := context.WithTimeout(context.Background(), defaultTimeout)
			defer cancel()

			pm2Client := pm2.NewHTTPClient(app.Client)

			nameOrID := args[0]
			if err := pm2Client.StopProcess(ctx, nameOrID); err != nil {
				return err
			}

			ui.Successf("Process %q stopped", nameOrID)
			return nil
		},
	}

	return cmd
}

func newPM2StartCommand() *cobra.Command {
	var script string
	var args string

	cmd := &cobra.Command{
		Use:   "start <name>",
		Short: "Start a new PM2 process",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			app, err := requireClient(cmd)
			if err != nil {
				return err
			}

			ctx, cancel := context.WithTimeout(context.Background(), defaultTimeout)
			defer cancel()

			pm2Client := pm2.NewHTTPClient(app.Client)

			name := args[0]
			opts := make(map[string]interface{})
			if len(args) > 1 && strings.TrimSpace(strings.Join(args[1:], " ")) != "" {
				opts["args"] = strings.Join(args[1:], " ")
			}

			if err := pm2Client.StartProcess(ctx, name, script, opts); err != nil {
				return err
			}

			ui.Successf("Process %q started", name)
			return nil
		},
	}

	cmd.Flags().StringVarP(&script, "script", "s", "", "Script path to run")
	cmd.Flags().StringVarP(&args, "args", "a", "", "Arguments to pass to script")
	cmd.MarkFlagRequired("script")

	return cmd
}

func newPM2DeleteCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "delete [name|id|all]",
		Short: "Delete PM2 process(es)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			app, err := requireClient(cmd)
			if err != nil {
				return err
			}

			ctx, cancel := context.WithTimeout(context.Background(), defaultTimeout)
			defer cancel()

			pm2Client := pm2.NewHTTPClient(app.Client)

			nameOrID := args[0]
			if err := pm2Client.DeleteProcess(ctx, nameOrID); err != nil {
				return err
			}

			ui.Successf("Process %q deleted", nameOrID)
			return nil
		},
	}

	return cmd
}

// Helper to convert string to int, returning 0 if invalid
func parseInt(s string) int {
	if n, err := strconv.Atoi(s); err == nil {
		return n
	}
	return 0
}
