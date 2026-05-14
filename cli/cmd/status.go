package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"

	"skyport-cli/internal/api"
	"skyport-cli/internal/ui"
)

type statusModel struct {
	client       *api.Client
	deploymentID string
	serverInfo   map[string]any
	metrics      *api.HostSnapshot
	deployment   *api.Deployment
	err          error
	width        int
	height       int
	loading      bool
}

func newStatusCommand() *cobra.Command {
	var deploymentID string
	cmd := &cobra.Command{
		Use:   "status",
		Short: "Open a live server dashboard",
		RunE: func(cmd *cobra.Command, args []string) error {
			app, err := requireClient(cmd)
			if err != nil {
				return err
			}
			model := &statusModel{client: app.Client, deploymentID: deploymentID, loading: true}
			program := tea.NewProgram(model, tea.WithAltScreen())
			_, err = program.Run()
			return err
		},
	}
	cmd.Flags().StringVarP(&deploymentID, "deployment", "d", "", "deployment ID to monitor")
	return cmd
}

func (m *statusModel) Init() tea.Cmd { return m.refresh() }

func (m *statusModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height
		return m, nil
	case statusPayload:
		m.serverInfo = msg.health
		m.metrics = msg.metrics
		m.deployment = msg.deployment
		m.err = msg.err
		m.loading = false
		return m, tea.Tick(2*time.Second, func(time.Time) tea.Msg { return refreshMsg{} })
	case refreshMsg:
		return m, m.refresh()
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q", "esc":
			return m, tea.Quit
		}
	}
	return m, nil
}

func (m *statusModel) View() string {
	if m.loading {
		return ui.Accent.Render("Loading SkyPort dashboard...") + "\n"
	}
	if m.err != nil {
		return ui.Danger.Render(m.err.Error()) + "\n"
	}
	header := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("86")).Render("SkyPort Status")
	health := fmt.Sprintf("Server: %v\nVersion: %v", m.serverInfo["service"], m.serverInfo["version"])
	metrics := "metrics unavailable"
	if m.metrics != nil {
		metrics = fmt.Sprintf("Host: %s\nCPU: %.1f%% (%d cores)\nMemory: %s used / %s free\nDisk: %s used / %s free", m.metrics.Host.Hostname, m.metrics.CPU.UsagePercent, m.metrics.CPU.CoresLogical, m.metrics.Memory.UsedHuman, m.metrics.Memory.FreeHuman, m.metrics.Disk.UsedHuman, m.metrics.Disk.FreeHuman)
	}
	deployment := "deployment: none"
	if m.deployment != nil {
		deployment = fmt.Sprintf("Deployment #%d\nStatus: %s\nStrategy: %s\nRuntime: %s", m.deployment.ID, m.deployment.Status, m.deployment.Strategy, m.deployment.Runtime)
	}
	return lipgloss.JoinVertical(lipgloss.Left,
		header,
		"",
		ui.Muted.Render(health),
		"",
		ui.Muted.Render(metrics),
		"",
		ui.Muted.Render(deployment),
		"",
		ui.Warning.Render("Press q to quit"),
	)
}

type refreshMsg struct{}

type statusPayload struct {
	health     map[string]any
	metrics    *api.HostSnapshot
	deployment *api.Deployment
	err        error
}

func (m *statusModel) refresh() tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		health, err := m.client.Health(ctx)
		if err != nil {
			return statusPayload{err: err}
		}
		metrics, err := m.client.Metrics(ctx)
		if err != nil {
			return statusPayload{health: health, err: err}
		}
		var dep *api.Deployment
		if strings.TrimSpace(m.deploymentID) != "" {
			dep, _ = m.client.GetDeployment(ctx, m.deploymentID)
		}
		payload, _ := json.Marshal(statusPayload{health: health, metrics: metrics, deployment: dep})
		var out statusPayload
		_ = json.Unmarshal(payload, &out)
		out.health = health
		out.metrics = metrics
		out.deployment = dep
		return out
	}
}
