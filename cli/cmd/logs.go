package cmd

import (
	"context"
	"fmt"
	"time"

	"github.com/gorilla/websocket"
	"github.com/spf13/cobra"

	"skyport-cli/internal/ui"
)

func newLogsCommand() *cobra.Command {
	var deploymentID string
	var follow bool
	cmd := &cobra.Command{
		Use:   "logs",
		Short: "Stream deployment logs",
		RunE: func(cmd *cobra.Command, args []string) error {
			app, err := requireClient(cmd)
			if err != nil {
				return err
			}
			if deploymentID == "" && len(args) > 0 {
				deploymentID = args[0]
			}
			if deploymentID == "" {
				deploymentID, err = ui.Prompt("Deployment ID", "")
				if err != nil {
					return err
				}
			}
			conn, _, err := app.Client.OpenWebSocket(context.Background(), "/ws/deployments/"+deploymentID+"/logs")
			if err != nil {
				return err
			}
			defer conn.Close()
			ui.Infof("Streaming logs for deployment %s", deploymentID)
			if follow {
				return streamWebSocket(conn)
			}
			return streamWebSocket(conn)
		},
	}
	cmd.Flags().StringVarP(&deploymentID, "deployment", "d", "", "deployment ID")
	cmd.Flags().BoolVarP(&follow, "follow", "f", true, "follow log stream")
	return cmd
}

func streamWebSocket(conn *websocket.Conn) error {
	defer conn.SetReadDeadline(time.Now().Add(0))
	for {
		_, payload, err := conn.ReadMessage()
		if err != nil {
			return err
		}
		fmt.Print(string(payload))
	}
}
