package tui

import (
	"context"
	"fmt"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/gorilla/websocket"

	"skyport-cli/internal/api"
	"skyport-cli/internal/config"
	"skyport-cli/internal/docker"
	"skyport-cli/internal/ui"
)

// Model represents the TUI application state
type Model struct {
	// Core
	ctx       context.Context
	config    *config.Manager
	apiClient *api.Client
	server    string
	term      *Terminal
	err       error

	// UI State
	width      int
	height     int
	view       ViewType
	focused    ComponentType
	lastUpdate time.Time
	showHelp   bool

	// Data
	health      map[string]any
	projects    []api.Project
	processes   []map[string]any
	containers  []api.DockerContainer
	deployments []api.Deployment
	marketplace []api.MarketplaceApp
	vpsServers  []api.VPS
	metrics     *api.HostSnapshot
	logs        []string
	wsConnected bool
	wsReconnect int

	// Sidebar
	sidebarActive bool
	menuIndex     int
	// Selection indices for list views
	containerIndex   int
	marketplaceIndex int
	fileIndex        int
	vpsIndex         int

	// Files browser/editor state
	filesRoot   string
	fileEntries []api.FileEntry
	fileContent string
	filePath    string
	fileEditing bool
	fileDirty   bool

	// Terminal websocket
	termConn *websocket.Conn

	// Message queue
	notifications []Notification
}

// ViewType represents the current view
type ViewType string

const (
	ViewOverview    ViewType = "overview"
	ViewProjects    ViewType = "projects"
	ViewPM2         ViewType = "pm2"
	ViewDocker      ViewType = "docker"
	ViewMarketplace ViewType = "marketplace"
	ViewServers     ViewType = "servers"
	ViewLogs        ViewType = "logs"
	ViewFiles       ViewType = "files"
	ViewFileEditor  ViewType = "file_editor"
	ViewSettings    ViewType = "settings"
	ViewTerminal    ViewType = "terminal"
)

// ComponentType represents UI components
type ComponentType string

const (
	ComponentSidebar ComponentType = "sidebar"
	ComponentMain    ComponentType = "main"
	ComponentBottom  ComponentType = "bottom"
)

// Notification represents a status notification
type Notification struct {
	Level     string // info, success, warning, error
	Message   string
	Duration  time.Duration
	CreatedAt time.Time
}

// Terminal represents the embedded terminal
type Terminal struct {
	active      bool
	lastCommand string
	output      []string
	input       string
}

// New creates a new TUI model
func New(ctx context.Context, cfg *config.Manager, client *api.Client, serverName string) (*Model, error) {
	if client == nil {
		return nil, fmt.Errorf("API client required for TUI")
	}
	if ctx == nil {
		ctx = context.Background()
	}

	return &Model{
		ctx:           ctx,
		config:        cfg,
		apiClient:     client,
		server:        strings.TrimSpace(serverName),
		view:          ViewOverview,
		focused:       ComponentSidebar,
		sidebarActive: true,
		health:        map[string]any{},
		projects:      []api.Project{},
		processes:     []map[string]any{},
		containers:    []api.DockerContainer{},
		deployments:   []api.Deployment{},
		marketplace:   []api.MarketplaceApp{},
		vpsServers:    []api.VPS{},
		logs:          make([]string, 0),
		term:          &Terminal{output: make([]string, 0)},
		filesRoot:     "/",
		fileEntries:   []api.FileEntry{},
		wsConnected:   false,
		lastUpdate:    time.Now(),
	}, nil
}

// Init implements tea.Model
func (m *Model) Init() tea.Cmd {
	return tea.Batch(
		m.loadData(),
		m.tickCmd(),
	)
}

// Update implements tea.Model
func (m *Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.KeyMsg:
		cmd := m.handleKeyPress(msg)
		if cmd != nil {
			cmds = append(cmds, cmd)
		}

	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height

	case TickMsg:
		m.lastUpdate = time.Now()
		cmds = append(cmds, m.tickCmd())
		cmds = append(cmds, m.loadData())
		if m.view == ViewFiles {
			cmds = append(cmds, m.loadFilesCmd(m.filesRoot))
		}

	case DataLoadedMsg:
		m.processDataUpdate(msg)

	case ErrorMsg:
		m.AddNotification("error", msg.Error(), 5*time.Second)

	case SuccessMsg:
		m.AddNotification("success", string(msg), 3*time.Second)
		cmds = append(cmds, m.loadData())
		if m.view == ViewFiles || m.fileEditing {
			cmds = append(cmds, m.loadFilesCmd(m.filesRoot))
		}
		if m.termConn != nil {
			cmds = append(cmds, m.terminalReadCmd(m.termConn))
		}

	case TerminalOutputMsg:
		if m.term == nil {
			m.term = &Terminal{output: make([]string, 0)}
		}
		m.term.output = append(m.term.output, msg.Line)
		// continue reading
		if m.termConn != nil {
			cmds = append(cmds, m.terminalReadCmd(m.termConn))
		}

	case FileListLoadedMsg:
		if msg.Err != nil {
			m.AddNotification("error", msg.Err.Error(), 5*time.Second)
			break
		}
		m.filesRoot = msg.Path
		m.fileEntries = msg.Items
		m.fileIndex = 0

	case FileListRequestMsg:
		cmds = append(cmds, m.loadFilesCmd(msg.Path))

	case FileOpenRequestMsg:
		cmds = append(cmds, m.openFileCmd(msg.Path))

	case FileContentLoadedMsg:
		if msg.Err != nil {
			m.AddNotification("error", msg.Err.Error(), 5*time.Second)
			break
		}
		m.filePath = msg.Path
		m.fileContent = msg.Content
		m.fileDirty = false
		m.fileEditing = true
		m.view = ViewFileEditor
		m.focused = ComponentMain
	}

	return m, tea.Batch(cmds...)
}

// View implements tea.Model
func (m *Model) View() string {
	if m.err != nil {
		return fmt.Sprintf("Error: %v", m.err)
	}

	// Build UI sections
	top := m.renderTopBar()
	banner := m.renderBanner()
	serverLine := m.renderServerLine()

	body := lipgloss.JoinHorizontal(
		lipgloss.Top,
		m.renderSidebar(),
		m.renderMainContent(),
	)
	bottom := m.renderBottomBar()

	// Arrange vertical
	content := lipgloss.JoinVertical(
		lipgloss.Left,
		top,
		banner,
		serverLine,
		body,
		bottom,
	)

	if m.showHelp {
		help := m.renderHelpOverlay()
		content = lipgloss.JoinVertical(lipgloss.Left, content, "", help)
	}

	return content
}

// Rendering methods
func (m *Model) renderTopBar() string {
	return lipgloss.NewStyle().
		Foreground(lipgloss.Color("45")).
		Render(strings.Repeat("─", max(40, m.width-2)))
}

func (m *Model) renderBanner() string {
	return strings.TrimRight(ui.BannerString(), "\n")
}

func (m *Model) renderServerLine() string {
	server := lipgloss.NewStyle().
		Foreground(lipgloss.Color("87")).
		Bold(true).
		Render(fmt.Sprintf("Server: %s", m.getCurrentServerName()))

	wsText := "● connected"
	wsStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("10"))
	if !m.wsConnected {
		wsText = "● disconnected"
		wsStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("9"))
	}

	lastUpdate := lipgloss.NewStyle().Foreground(lipgloss.Color("8")).Render(
		fmt.Sprintf("Last update: %s", m.lastUpdate.Format("15:04:05")),
	)

	return lipgloss.NewStyle().Padding(0, 1).Render(
		lipgloss.JoinHorizontal(lipgloss.Left, server, "   ", wsStyle.Render(wsText), "   ", lastUpdate),
	)
}

func (m *Model) renderSidebar() string {
	items := []string{
		"Overview",
		"Projects",
		"PM2",
		"Docker",
		"Marketplace",
		"Servers",
		"Logs",
		"Files",
		"Terminal",
		"Settings",
	}

	var sidebarLines []string
	for i, item := range items {
		marker := " "
		if i == m.menuIndex {
			marker = ">"
		}
		
		line := fmt.Sprintf("%s %s", marker, item)
		if i == m.menuIndex {
			if m.focused == ComponentSidebar {
				line = lipgloss.NewStyle().Foreground(lipgloss.Color("45")).Bold(true).Render(line)
			} else {
				line = lipgloss.NewStyle().Foreground(lipgloss.Color("240")).Render(line)
			}
		}
		sidebarLines = append(sidebarLines, line)
	}

	borderColor := lipgloss.Color("240")
	if m.focused == ComponentSidebar {
		borderColor = lipgloss.Color("45")
	}

	sidebar := lipgloss.JoinVertical(lipgloss.Left, sidebarLines...)
	return lipgloss.NewStyle().
		Width(20).
		Padding(0, 1).
		BorderRight(true).
		BorderForeground(borderColor).
		Render(sidebar)
}

func (m *Model) renderMainContent() string {
	var content string
	switch m.view {
	case ViewOverview:
		content = m.renderOverview()
	case ViewProjects:
		content = m.renderProjectsView()
	case ViewPM2:
		content = m.renderPM2View()
	case ViewDocker:
		content = m.renderDockerView()
	case ViewMarketplace:
		content = m.renderMarketplaceView()
	case ViewServers:
		content = m.renderServersView()
	case ViewLogs:
		content = m.renderLogsView()
	case ViewFiles:
		content = m.renderFilesView()
	case ViewFileEditor:
		content = m.renderFileEditorView()
	case ViewTerminal:
		content = m.renderTerminalView()
	case ViewSettings:
		content = m.renderSettingsView()
	default:
		content = "View not implemented yet"
	}

	return lipgloss.NewStyle().
		Width(max(80, m.width-24)).
		Padding(1, 2).
		Render(content)
}

func (m *Model) renderOverview() string {
	sb := &strings.Builder{}
	fmt.Fprintf(sb, "Overview\n\n")
	fmt.Fprintf(sb, "Projects: %d\n", len(m.projects))
	fmt.Fprintf(sb, "Processes: %d\n", len(m.processes))
	fmt.Fprintf(sb, "Containers: %d\n", len(m.containers))
	fmt.Fprintf(sb, "Deployments: %d\n", len(m.deployments))
	fmt.Fprintf(sb, "WebSocket: %s\n", map[bool]string{true: "Connected", false: "Disconnected"}[m.wsConnected])
	fmt.Fprintf(sb, "Last Update: %s\n\n", m.lastUpdate.Format("15:04:05"))

	if m.metrics != nil {
		fmt.Fprintf(sb, "CPU:    %5.1f%%  %s\n", m.metrics.CPU.UsagePercent, renderBar(m.metrics.CPU.UsagePercent, 24))
		fmt.Fprintf(sb, "Memory: %5.1f%%  %s\n", m.metrics.Memory.UsedPercent, renderBar(m.metrics.Memory.UsedPercent, 24))
		fmt.Fprintf(sb, "Disk:   %5.1f%%  %s\n", m.metrics.Disk.UsedPercent, renderBar(m.metrics.Disk.UsedPercent, 24))
		fmt.Fprintf(sb, "Uptime: %s\n", m.metrics.Host.UptimeHuman)
	}

	return sb.String()
}

func renderBar(percent float64, width int) string {
	if width <= 0 {
		width = 20
	}
	filled := int((percent / 100.0) * float64(width))
	if filled < 0 {
		filled = 0
	}
	if filled > width {
		filled = width
	}
	bar := strings.Repeat("█", filled) + strings.Repeat(" ", width-filled)
	return fmt.Sprintf("[%s]", bar)
}

func (m *Model) renderProjectsView() string {
	if len(m.projects) == 0 {
		return "Projects\n\nNo projects returned by API."
	}
	lines := []string{"Projects", ""}
	for _, p := range m.projects {
		lines = append(lines, fmt.Sprintf("[%d] %s", p.ID, p.Name))
		if p.Path != "" {
			lines = append(lines, "  Path: "+p.Path)
		}
		if p.GitURL != "" {
			lines = append(lines, "  Git:  "+p.GitURL)
		}
	}
	return strings.Join(lines, "\n")
}

func (m *Model) renderPM2View() string {
	if len(m.processes) == 0 {
		return "PM2 Processes\n\nNo PM2 processes returned by API."
	}
	lines := []string{"PM2 Processes", ""}
	for _, p := range m.processes {
		name := fmt.Sprint(p["name"])
		status := fmt.Sprint(p["status"])
		pid := fmt.Sprint(p["pid"])
		lines = append(lines, fmt.Sprintf("%s  pid=%s  status=%s", name, pid, status))
	}
	return strings.Join(lines, "\n")
}

func (m *Model) renderDockerView() string {
	if len(m.containers) == 0 {
		return "Docker Containers\n\nNo containers returned by API."
	}
	lines := []string{"Docker Containers", ""}
	for i, c := range m.containers {
		marker := " "
		if i == m.containerIndex {
			marker = ">"
		}
		line := fmt.Sprintf("%s %s  image=%s  state=%s", marker, c.Names, c.Image, c.State)
		if i == m.containerIndex {
			if m.focused == ComponentMain {
				line = lipgloss.NewStyle().Foreground(lipgloss.Color("45")).Bold(true).Render(line)
			} else {
				line = lipgloss.NewStyle().Foreground(lipgloss.Color("240")).Render(line)
			}
		}
		lines = append(lines, line)
	}
	lines = append(lines, "", "Actions: s=start  t=stop  r=restart  x=exec  l=logs  d=remove  enter=logs")
	return strings.Join(lines, "\n")
}

func (m *Model) renderMarketplaceView() string {
	if len(m.marketplace) == 0 {
		return "Marketplace\n\nNo marketplace apps returned by API."
	}
	lines := []string{"Marketplace", ""}
	for i, app := range m.marketplace {
		marker := " "
		if i == m.marketplaceIndex {
			marker = ">"
		}
		line := fmt.Sprintf("%s %s (%s)  [%s]", marker, app.Name, app.Slug, app.Category)
		if i == m.marketplaceIndex {
			if m.focused == ComponentMain {
				line = lipgloss.NewStyle().Foreground(lipgloss.Color("45")).Bold(true).Render(line)
			} else {
				line = lipgloss.NewStyle().Foreground(lipgloss.Color("240")).Render(line)
			}
		}
		lines = append(lines, line)
	}
	lines = append(lines, "", "Actions: i=install  enter=install")
	return strings.Join(lines, "\n")
}

func (m *Model) renderFilesView() string {
	if len(m.fileEntries) == 0 {
		return fmt.Sprintf("Files\n\nPath: %s\n\nNo files returned by API.\n\nActions: enter=open  backspace=up  c=create folder  n=new file", m.filesRoot)
	}
	lines := []string{"Files", "", fmt.Sprintf("Path: %s", m.filesRoot), ""}
	for i, entry := range m.fileEntries {
		marker := "├"
		if i == len(m.fileEntries)-1 {
			marker = "└"
		}
		selector := " "
		if i == m.fileIndex {
			selector = ">"
		}
		kind := "FILE"
		if entry.IsDir {
			kind = "DIR "
		}
		name := entry.Name
		if entry.IsDir {
			name += "/"
		}
		line := fmt.Sprintf("%s%s [%s] %-32s %s", selector, marker, kind, name, formatSize(entry.Size))
		if i == m.fileIndex {
			if m.focused == ComponentMain {
				line = lipgloss.NewStyle().Foreground(lipgloss.Color("45")).Bold(true).Render(line)
			} else {
				line = lipgloss.NewStyle().Foreground(lipgloss.Color("240")).Render(line)
			}
		}
		lines = append(lines, line)
	}
	lines = append(lines, "", "Actions: enter=open  backspace=up  c=create folder  n=new file  e=edit file")
	return strings.Join(lines, "\n")
}

func (m *Model) renderFileEditorView() string {
	head := []string{"File Editor", "", fmt.Sprintf("Path: %s", m.filePath), ""}
	status := "READ ONLY"
	if m.fileDirty {
		status = "MODIFIED"
	}
	head = append(head, fmt.Sprintf("Status: %s", status), "", "--- content ---", "")
	return strings.Join(append(head, m.fileContent, "", "Actions: ctrl+s save  esc back  enter newline"), "\n")
}

func (m *Model) renderServersView() string {
	lines := []string{
		"Servers",
		"",
		fmt.Sprintf("Active profile: %s", m.getCurrentServerName()),
		fmt.Sprintf("API status: %s", map[bool]string{true: "Connected", false: "Disconnected"}[m.wsConnected]),
	}
	if len(m.vpsServers) > 0 {
		lines = append(lines, "")
		for _, s := range m.vpsServers {
			lines = append(lines, fmt.Sprintf("%s  %s  (%s)", s.ServerName, s.IPAddress, s.Status))
		}
	}
	return strings.Join(lines, "\n")
}

func (m *Model) renderLogsView() string {
	if len(m.logs) == 0 {
		return "Logs\n\nNo logs yet."
	}
	return "Logs\n\n" + strings.Join(m.logs, "\n")
}

func (m *Model) renderTerminalView() string {
	if m.term == nil {
		m.term = &Terminal{output: make([]string, 0)}
	}
	if !m.term.active {
		return "Terminal\n\nPress i to connect, then type to send input."
	}
	lines := []string{"Terminal", "", "Connected. Type to send input. Esc pauses.", ""}
	lines = append(lines, m.term.output...)
	if strings.TrimSpace(m.term.input) != "" || len(m.term.output) > 0 {
		lines = append(lines, "> "+m.term.input)
	}
	return strings.Join(lines, "\n")
}

func (m *Model) renderSettingsView() string {
	baseURL := "(unknown)"
	if m.apiClient != nil {
		baseURL = m.apiClient.BaseURL
	}
	return fmt.Sprintf("Settings\n\nTheme: sky\nRefresh: 5s\nOutput: rich\nAPI Base URL: %s", baseURL)
}

func (m *Model) renderHelpOverlay() string {
	content := []string{
		"Help",
		"",
		"h: toggle help",
		"q: quit",
		"Tab: cycle focus",
		"Up/Down or k/j: move menu",
		"1-9: jump to view",
		"Enter: select/open item",
		"Files: enter open, backspace up, c create folder, n new file, e edit",
		"Editor: ctrl+s save, esc exit",
		"Terminal: i connect, type to send, esc pause",
		"Docker: s start, t stop, r restart, l logs, x exec, d remove",
	}

	return lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("45")).
		Padding(1, 2).
		Render(strings.Join(content, "\n"))
}

func (m *Model) renderBottomBar() string {
	shortcuts := "q:quit  h:help  1-9:menu  Tab:focus"
	status := lipgloss.NewStyle().
		Foreground(lipgloss.Color("8")).
		Render(shortcuts)

	notifications := ""
	for _, notif := range m.notifications {
		if time.Since(notif.CreatedAt) < notif.Duration {
			notifications = lipgloss.NewStyle().
				Foreground(lipgloss.Color("10")).
				Render(notif.Message)
			break
		}
	}

	return lipgloss.JoinHorizontal(
		lipgloss.Center,
		status,
		"  ",
		notifications,
	)
}

// Event handlers
func (m *Model) handleKeyPress(msg tea.KeyMsg) tea.Cmd {
	if m.view == ViewFileEditor {
		switch msg.String() {
		case "esc":
			m.fileEditing = false
			m.view = ViewFiles
			return nil
		case "ctrl+s":
			return m.saveCurrentFileCmd()
		case "backspace":
			if len(m.fileContent) > 0 {
				r := []rune(m.fileContent)
				m.fileContent = string(r[:len(r)-1])
				m.fileDirty = true
			}
			return nil
		case "enter":
			m.fileContent += "\n"
			m.fileDirty = true
			return nil
		case "tab":
			m.fileContent += "\t"
			m.fileDirty = true
			return nil
		}
		if msg.Type == tea.KeyRunes {
			m.fileContent += string(msg.Runes)
			m.fileDirty = true
		}
		return nil
	}

	// Terminal input handling when active
	if m.view == ViewTerminal && m.term != nil && m.term.active {
		switch msg.Type {
		case tea.KeyRunes:
			m.term.input += string(msg.Runes)
			return nil
		case tea.KeyEnter:
			if m.termConn != nil {
				_ = m.termConn.WriteMessage(websocket.TextMessage, []byte(m.term.input))
			}
			if strings.TrimSpace(m.term.input) != "" {
				m.term.output = append(m.term.output, "> "+m.term.input)
			}
			m.term.input = ""
			return nil
		case tea.KeyBackspace:
			if len(m.term.input) > 0 {
				r := []rune(m.term.input)
				m.term.input = string(r[:len(r)-1])
			}
			return nil
		case tea.KeyEsc:
			m.term.active = false
			m.AddNotification("info", "Terminal mode paused", 2*time.Second)
			return nil
		}
	}

	switch msg.String() {
	case "left":
		m.focused = ComponentSidebar
	case "right":
		m.focused = ComponentMain
	case "q":
		return tea.Quit
	case "h":
		m.showHelp = !m.showHelp
	case "tab":
		m.cycleComponent()
	case "1", "2", "3", "4", "5", "6", "7", "8", "9":
		idx := int(msg.String()[0] - '1')
		if idx >= 0 && idx <= 8 {
			m.menuIndex = idx
			m.updateView()
			if m.view == ViewFiles {
				return m.loadFilesCmd(m.filesRoot)
			}
		}
	case "i":
		if m.view == ViewTerminal {
			if m.term == nil {
				m.term = &Terminal{output: make([]string, 0)}
			}
			return m.startTerminalCmd()
		}
		if m.view == ViewFiles {
			return m.openSelectedFileCmd()
		}
	case "esc":
		if m.view == ViewTerminal && m.term != nil && m.term.active {
			m.term.active = false
			m.AddNotification("info", "Terminal mode paused", 2*time.Second)
		}
	case "up", "k":
		if m.focused == ComponentMain {
			switch m.view {
			case ViewDocker:
				if m.containerIndex > 0 {
					m.containerIndex--
				}
			case ViewMarketplace:
				if m.marketplaceIndex > 0 {
					m.marketplaceIndex--
				}
			case ViewFiles:
				if m.fileIndex > 0 {
					m.fileIndex--
				}
			}
			return nil
		}
		if m.menuIndex > 0 {
			m.menuIndex--
			m.updateView()
			if m.view == ViewFiles {
				return m.loadFilesCmd(m.filesRoot)
			}
		}
	case "down", "j":
		if m.focused == ComponentMain {
			switch m.view {
			case ViewDocker:
				if m.containerIndex < len(m.containers)-1 {
					m.containerIndex++
				}
			case ViewMarketplace:
				if m.marketplaceIndex < len(m.marketplace)-1 {
					m.marketplaceIndex++
				}
			case ViewFiles:
				if m.fileIndex < len(m.fileEntries)-1 {
					m.fileIndex++
				}
			}
			return nil
		}
		if m.menuIndex < 9 {
			m.menuIndex++
			m.updateView()
			if m.view == ViewFiles {
				return m.loadFilesCmd(m.filesRoot)
			}
		}
	case "backspace":
		if m.view == ViewFiles {
			return m.loadFilesCmd(parentPath(m.filesRoot))
		}
	case "enter":
		switch m.view {
		case ViewMarketplace:
			if len(m.marketplace) > 0 {
				return m.installMarketplaceCmd(m.marketplaceIndex)
			}
		case ViewFiles:
			return m.openSelectedFileCmd()
		case ViewDocker:
			if len(m.containers) > 0 {
				return m.dockerActionCmd("logs", m.containerIndex)
			}
		default:
			if m.focused == ComponentSidebar {
				m.focused = ComponentMain
			} else {
				m.updateView()
			}
		}
	case "s":
		if m.view == ViewDocker {
			return m.dockerActionCmd("start", m.containerIndex)
		}
	case "t":
		if m.view == ViewDocker {
			return m.dockerActionCmd("stop", m.containerIndex)
		}
	case "r":
		if m.view == ViewDocker {
			return m.dockerActionCmd("restart", m.containerIndex)
		}
	case "x":
		if m.view == ViewDocker {
			return m.dockerActionCmd("exec", m.containerIndex)
		}
	case "l":
		if m.view == ViewDocker {
			return m.dockerActionCmd("logs", m.containerIndex)
		}
	case "d":
		if m.view == ViewDocker {
			return m.dockerActionCmd("remove", m.containerIndex)
		}
	case "I":
		if m.view == ViewMarketplace {
			return m.installMarketplaceCmd(m.marketplaceIndex)
		}
	case "c":
		if m.view == ViewFiles {
			return m.createFolderCmd()
		}
	case "n":
		if m.view == ViewFiles {
			return m.createFileCmd()
		}
	case "e":
		if m.view == ViewFiles {
			return m.openSelectedFileCmd()
		}
	}
	return nil
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func (m *Model) cycleComponent() {
	if m.focused == ComponentSidebar {
		m.focused = ComponentMain
	} else {
		m.focused = ComponentSidebar
	}
}

func (m *Model) updateView() {
	views := []ViewType{
		ViewOverview,
		ViewProjects,
		ViewPM2,
		ViewDocker,
		ViewMarketplace,
		ViewServers,
		ViewLogs,
		ViewFiles,
		ViewTerminal,
		ViewSettings,
	}
	if m.menuIndex < len(views) {
		m.view = views[m.menuIndex]
	}
}

// Data loading
func (m *Model) loadData() tea.Cmd {
	return func() tea.Msg {
		if m.apiClient == nil {
			return ErrorMsg{Err: fmt.Errorf("api client not initialized")}
		}

		ctx, cancel := context.WithTimeout(m.ctx, 4*time.Second)
		defer cancel()

		loaded := DataLoadedMsg{Connected: false}
		errors := make([]string, 0)

		health, err := m.apiClient.Health(ctx)
		if err != nil {
			errors = append(errors, "health: "+err.Error())
		} else {
			loaded.Health = health
			loaded.Connected = true
		}

		projects, err := m.apiClient.ListProjects(ctx)
		if err != nil {
			errors = append(errors, "projects: "+err.Error())
		} else {
			loaded.Projects = projects
		}

		deployments, err := m.apiClient.ListDeployments(ctx)
		if err != nil {
			errors = append(errors, "deployments: "+err.Error())
		} else {
			loaded.Deployments = deployments
		}

		apps, err := m.apiClient.ListMarketplaceApps(ctx)
		if err != nil {
			errors = append(errors, "marketplace: "+err.Error())
		} else {
			loaded.Marketplace = apps
		}

		vps, err := m.apiClient.ListVPS(ctx)
		if err != nil {
			errors = append(errors, "servers: "+err.Error())
		} else {
			loaded.VPSServers = vps
		}

		metrics, err := m.apiClient.Metrics(ctx)
		if err != nil {
			errors = append(errors, "metrics: "+err.Error())
		} else {
			loaded.Metrics = metrics
		}

		var pm2Rows []map[string]any
		if err := m.apiClient.Req(ctx, "GET", "/api/v1/pm2/list", nil, &pm2Rows); err != nil {
			errors = append(errors, "pm2: "+err.Error())
		} else {
			loaded.Processes = pm2Rows
		}

		var containers []api.DockerContainer
		if err := m.apiClient.Req(ctx, "GET", "/api/v1/docker/containers", nil, &containers); err != nil {
			errors = append(errors, "docker: "+err.Error())
		} else {
			loaded.Containers = containers
		}

		if len(errors) > 0 {
			loaded.Errors = errors
		}

		return loaded
	}
}

func (m *Model) processDataUpdate(msg DataLoadedMsg) {
	m.wsConnected = msg.Connected
	if msg.Health != nil {
		m.health = msg.Health
	}
	if msg.Projects != nil {
		m.projects = msg.Projects
	}
	if msg.Deployments != nil {
		m.deployments = msg.Deployments
	}
	if msg.Marketplace != nil {
		m.marketplace = msg.Marketplace
	}
	if msg.VPSServers != nil {
		m.vpsServers = msg.VPSServers
	}
	if msg.Processes != nil {
		m.processes = msg.Processes
	}
	if msg.Containers != nil {
		m.containers = msg.Containers
	}
	if msg.Metrics != nil {
		m.metrics = msg.Metrics
	}

	if len(msg.Errors) > 0 {
		m.AddNotification("warning", strings.Join(msg.Errors, " | "), 4*time.Second)
	}
}

// Helpers
func (m *Model) getCurrentServerName() string {
	if strings.TrimSpace(m.server) != "" {
		return m.server
	}
	if m.config == nil {
		return "unknown"
	}
	active := m.config.GetActiveServer()
	if active != nil {
		return active.Name
	}
	return "no server"
}

// AddNotification adds a notification to the queue
func (m *Model) AddNotification(level, message string, duration time.Duration) {
	m.notifications = append(m.notifications, Notification{
		Level:     level,
		Message:   message,
		Duration:  duration,
		CreatedAt: time.Now(),
	})
}

// Message types
type TickMsg struct{}

type DataLoadedMsg struct {
	Connected   bool
	Health      map[string]any
	Projects    []api.Project
	Deployments []api.Deployment
	Marketplace []api.MarketplaceApp
	VPSServers  []api.VPS
	Processes   []map[string]any
	Containers  []api.DockerContainer
	Metrics     *api.HostSnapshot
	Errors      []string
}

type ErrorMsg struct {
	Err error
}

func (e ErrorMsg) Error() string {
	return e.Err.Error()
}

type SuccessMsg string

// TerminalOutputMsg carries a line received from terminal websocket
type TerminalOutputMsg struct {
	Line string
}

// Ticking command for periodic updates
func (m *Model) tickCmd() tea.Cmd {
	return tea.Tick(5*time.Second, func(t time.Time) tea.Msg {
		return TickMsg{}
	})
}

// terminalReadCmd returns a Cmd that reads a single message from the websocket
func (m *Model) terminalReadCmd(conn *websocket.Conn) tea.Cmd {
	return func() tea.Msg {
		if conn == nil {
			return ErrorMsg{Err: fmt.Errorf("terminal connection closed")}
		}
		_, msg, err := conn.ReadMessage()
		if err != nil {
			return ErrorMsg{Err: err}
		}
		return TerminalOutputMsg{Line: string(msg)}
	}
}

// startTerminalCmd establishes a websocket terminal session to the first VPS
func (m *Model) startTerminalCmd() tea.Cmd {
	return func() tea.Msg {
		if len(m.vpsServers) == 0 {
			return ErrorMsg{Err: fmt.Errorf("no VPS servers available")}
		}
		idx := m.vpsIndex
		if idx < 0 || idx >= len(m.vpsServers) {
			idx = 0
		}
		vpsID := strings.TrimSpace(m.vpsServers[idx].ID)
		if vpsID == "" {
			return ErrorMsg{Err: fmt.Errorf("selected VPS has no ID")}
		}
		conn, _, err := m.apiClient.OpenWebSocket(m.ctx, "/ws/vps/"+vpsID)
		if err != nil {
			return ErrorMsg{Err: err}
		}
		m.term = &Terminal{output: make([]string, 0)}
		m.term.active = true
		m.termConn = conn
		return SuccessMsg("terminal connected")
	}
}

// dockerActionCmd executes an action on the selected container
func (m *Model) dockerActionCmd(action string, idx int) tea.Cmd {
	return func() tea.Msg {
		if idx < 0 || idx >= len(m.containers) {
			return ErrorMsg{Err: fmt.Errorf("no container selected")}
		}
		name := m.containers[idx].Names
		client := docker.NewHTTPClient(m.apiClient)
		ctx, cancel := context.WithTimeout(m.ctx, 10*time.Second)
		defer cancel()
		var err error
		switch action {
		case "start":
			err = client.StartContainer(ctx, name)
		case "stop":
			err = client.StopContainer(ctx, name)
		case "restart":
			err = client.RestartContainer(ctx, name)
		case "remove":
			err = client.RemoveContainer(ctx, name, true)
		case "logs":
			// just notify; UI will refresh
			_, err = client.GetLogs(ctx, name, 200)
		case "exec":
			_, err = client.ExecCommand(ctx, name, []string{"/bin/sh", "-c", "echo exec from tui"})
		default:
			return ErrorMsg{Err: fmt.Errorf("unknown action")}
		}
		if err != nil {
			return ErrorMsg{Err: err}
		}
		return SuccessMsg(fmt.Sprintf("%s: %s", action, name))
	}
}

// installMarketplaceCmd triggers a marketplace install for selected index
func (m *Model) installMarketplaceCmd(idx int) tea.Cmd {
	return func() tea.Msg {
		if idx < 0 || idx >= len(m.marketplace) {
			return ErrorMsg{Err: fmt.Errorf("no app selected")}
		}
		app := m.marketplace[idx]
		mode := "docker"
		if len(app.InstallModes) > 0 {
			mode = app.InstallModes[0]
		}
		payload := map[string]any{"app_slug": app.Slug, "install_mode": mode}
		var out map[string]any
		ctx, cancel := context.WithTimeout(m.ctx, 30*time.Second)
		defer cancel()
		if err := m.apiClient.Req(ctx, "POST", "/api/v1/marketplace/install", payload, &out); err != nil {
			return ErrorMsg{Err: err}
		}
		return SuccessMsg(fmt.Sprintf("install started: %s", app.Slug))
	}
}

func (m *Model) loadFilesCmd(path string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(m.ctx, 10*time.Second)
		defer cancel()
		resp, err := m.apiClient.ListFiles(ctx, path)
		if err != nil {
			return FileListLoadedMsg{Err: err}
		}
		return FileListLoadedMsg{Path: resp.Path, Items: resp.Items}
	}
}

func (m *Model) openSelectedFileCmd() tea.Cmd {
	return func() tea.Msg {
		if len(m.fileEntries) == 0 || m.fileIndex < 0 || m.fileIndex >= len(m.fileEntries) {
			return ErrorMsg{Err: fmt.Errorf("no file selected")}
		}
		entry := m.fileEntries[m.fileIndex]
		if entry.IsDir {
			return FileListRequestMsg{Path: entry.Path}
		}
		return FileOpenRequestMsg{Path: entry.Path}
	}
}

func (m *Model) openFileCmd(path string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(m.ctx, 10*time.Second)
		defer cancel()
		resp, err := m.apiClient.ReadFile(ctx, path)
		if err != nil {
			return FileContentLoadedMsg{Err: err}
		}
		content := resp.Content
		if resp.Encoding == "base64" && resp.Preview != "" {
			content = resp.Preview
		}
		return FileContentLoadedMsg{Path: resp.Path, Content: content}
	}
}

func (m *Model) saveCurrentFileCmd() tea.Cmd {
	return func() tea.Msg {
		if strings.TrimSpace(m.filePath) == "" {
			return ErrorMsg{Err: fmt.Errorf("file path is empty")}
		}
		ctx, cancel := context.WithTimeout(m.ctx, 20*time.Second)
		defer cancel()
		if _, err := m.apiClient.WriteFile(ctx, m.filePath, m.fileContent); err != nil {
			return ErrorMsg{Err: err}
		}
		m.fileDirty = false
		return SuccessMsg(fmt.Sprintf("saved %s", m.filePath))
	}
}

func (m *Model) createFolderCmd() tea.Cmd {
	return func() tea.Msg {
		base := strings.TrimSpace(m.filesRoot)
		if base == "" {
			base = "/"
		}
		newPath := strings.TrimRight(base, "/\\") + "/new-folder"
		ctx, cancel := context.WithTimeout(m.ctx, 10*time.Second)
		defer cancel()
		if _, err := m.apiClient.CreateFolder(ctx, newPath); err != nil {
			return ErrorMsg{Err: err}
		}
		return SuccessMsg(fmt.Sprintf("created folder %s", newPath))
	}
}

func (m *Model) createFileCmd() tea.Cmd {
	return func() tea.Msg {
		base := strings.TrimSpace(m.filesRoot)
		if base == "" {
			base = "/"
		}
		path := strings.TrimRight(base, "/\\") + "/new-file.txt"
		ctx, cancel := context.WithTimeout(m.ctx, 10*time.Second)
		defer cancel()
		var out map[string]any
		if err := m.apiClient.Req(ctx, "POST", "/api/v1/files/file", map[string]string{"path": path, "content": ""}, &out); err != nil {
			return ErrorMsg{Err: err}
		}
		return SuccessMsg(fmt.Sprintf("created file %s", path))
	}
}

func parentPath(path string) string {
	clean := strings.TrimSpace(path)
	if clean == "" || clean == "/" {
		return "/"
	}
	clean = strings.TrimRight(clean, "/\\")
	if idx := strings.LastIndexAny(clean, "/\\"); idx > 0 {
		return clean[:idx]
	}
	return "/"
}

func formatSize(size int64) string {
	if size < 1024 {
		return fmt.Sprintf("%d B", size)
	}
	if size < 1024*1024 {
		return fmt.Sprintf("%.1f KB", float64(size)/1024)
	}
	if size < 1024*1024*1024 {
		return fmt.Sprintf("%.1f MB", float64(size)/(1024*1024))
	}
	return fmt.Sprintf("%.1f GB", float64(size)/(1024*1024*1024))
}

type FileListLoadedMsg struct {
	Path  string
	Items []api.FileEntry
	Err   error
}

type FileListRequestMsg struct {
	Path string
}

type FileOpenRequestMsg struct {
	Path string
}

type FileContentLoadedMsg struct {
	Path    string
	Content string
	Err     error
}
