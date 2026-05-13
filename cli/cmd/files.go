package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"

	"github.com/pterm/pterm"
	"github.com/spf13/cobra"

	"skyport-cli/internal/ui"
)

func newFilesCommand() *cobra.Command {
	cmd := &cobra.Command{Use: "files", Short: "Browse remote file systems"}
	cmd.AddCommand(newFilesListCommand())
	cmd.AddCommand(newFilesUploadCommand())
	cmd.AddCommand(newFilesDownloadCommand())
	return cmd
}

func newFilesListCommand() *cobra.Command {
	var path string
	cmd := &cobra.Command{
		Use:   "ls",
		Short: "List remote files",
		RunE: func(cmd *cobra.Command, args []string) error {
			app, err := requireClient(cmd)
			if err != nil {
				return err
			}
			if path == "" {
				path, err = ui.Prompt("Remote path", "/")
				if err != nil {
					return err
				}
			}
			resp, err := app.Client.ListFiles(context.Background(), path)
			if err != nil {
				return err
			}
			if outputFormat() == "json" {
				payload, _ := json.MarshalIndent(resp, "", "  ")
				fmt.Println(string(payload))
				return nil
			}
			items, _ := resp["items"].([]any)
			rows := make([][]string, 0, len(items))
			for _, item := range items {
				m, _ := item.(map[string]any)
				rows = append(rows, []string{fmt.Sprint(m["name"]), fmt.Sprint(m["path"]), fmt.Sprint(m["is_dir"]), fmt.Sprint(m["size"] )})
			}
			return ui.Table([]string{"Name", "Path", "Dir", "Size"}, rows)
		},
	}
	cmd.Flags().StringVarP(&path, "path", "p", "", "remote path")
	return cmd
}

func newFilesUploadCommand() *cobra.Command {
	var remotePath string
	cmd := &cobra.Command{
		Use:   "upload <local-file>",
		Short: "Upload a local file to the remote host",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			app, err := requireClient(cmd)
			if err != nil {
				return err
			}
			if remotePath == "" {
				remotePath, err = ui.Prompt("Remote destination path", "/")
				if err != nil {
					return err
				}
			}
			spinner, _ := pterm.DefaultSpinner.Start("Uploading file")
			resp, err := app.Client.UploadFile(context.Background(), remotePath, args[0])
			if err != nil {
				spinner.Fail(err.Error())
				return err
			}
			spinner.Success("Upload complete")
			if outputFormat() == "json" {
				payload, _ := json.MarshalIndent(resp, "", "  ")
				fmt.Println(string(payload))
				return nil
			}
			ui.Successf("Uploaded %s", args[0])
			return nil
		},
	}
	cmd.Flags().StringVarP(&remotePath, "path", "p", "", "remote destination path")
	return cmd
}

func newFilesDownloadCommand() *cobra.Command {
	var remotePath string
	var outPath string
	cmd := &cobra.Command{
		Use:   "download",
		Short: "Download a remote file",
		RunE: func(cmd *cobra.Command, args []string) error {
			app, err := requireClient(cmd)
			if err != nil {
				return err
			}
			if remotePath == "" {
				remotePath, err = ui.Prompt("Remote file path", "")
				if err != nil {
					return err
				}
			}
			if outPath == "" {
				outPath = filepath.Base(remotePath)
			}
			spinner, _ := pterm.DefaultSpinner.Start("Downloading file")
			if err := app.Client.DownloadFile(context.Background(), remotePath, outPath); err != nil {
				spinner.Fail(err.Error())
				return err
			}
			spinner.Success("Download complete")
			ui.Successf("Saved to %s", outPath)
			return nil
		},
	}
	cmd.Flags().StringVarP(&remotePath, "path", "p", "", "remote file path")
	cmd.Flags().StringVarP(&outPath, "output", "o", "", "local output path")
	return cmd
}
