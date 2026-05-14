package ui

import (
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/charmbracelet/lipgloss"
)

// Colors and styles
var (
	// Color palette
	ColorPrimary = lipgloss.Color("12") // Cyan
	ColorSuccess = lipgloss.Color("10") // Green
	ColorWarning = lipgloss.Color("11") // Yellow
	ColorDanger  = lipgloss.Color("9")  // Red
	ColorMuted   = lipgloss.Color("8")  // Gray
	ColorBorder  = lipgloss.Color("8")  // Gray
	ColorHeader  = lipgloss.Color("15") // White

	// Compatibility color variables (pterm-like)
	Accent  = lipgloss.NewStyle().Foreground(ColorPrimary).Bold(true)
	Success = lipgloss.NewStyle().Foreground(ColorSuccess).Bold(true)
	Warning = lipgloss.NewStyle().Foreground(ColorWarning)
	Danger  = lipgloss.NewStyle().Foreground(ColorDanger)
	Muted   = lipgloss.NewStyle().Foreground(ColorMuted)

	// Styles
	StyleSuccess = lipgloss.NewStyle().Foreground(ColorSuccess).Bold(true)
	StyleWarning = lipgloss.NewStyle().Foreground(ColorWarning)
	StyleDanger  = lipgloss.NewStyle().Foreground(ColorDanger)
	StyleMuted   = lipgloss.NewStyle().Foreground(ColorMuted)
	StyleHeader  = lipgloss.NewStyle().Foreground(ColorHeader).Bold(true)

	// Border style
	StyleBorder = lipgloss.NewStyle().
			BorderStyle(lipgloss.RoundedBorder()).
			BorderForeground(ColorBorder).
			Padding(0, 1)

	// Table header style
	StyleTableHeader = lipgloss.NewStyle().
				Foreground(ColorHeader).
				Bold(true).
				Padding(0, 1).
				Background(lipgloss.Color("0"))

	// Table row style
	StyleTableRow = lipgloss.NewStyle().Padding(0, 1)

	// Status badge styles
	BadgeOnline = lipgloss.NewStyle().
			Foreground(lipgloss.Color("0")).
			Background(ColorSuccess).
			Padding(0, 1)

	BadgeStopped = lipgloss.NewStyle().
			Foreground(lipgloss.Color("15")).
			Background(ColorDanger).
			Padding(0, 1)

	BadgeWaiting = lipgloss.NewStyle().
			Foreground(lipgloss.Color("0")).
			Background(ColorWarning).
			Padding(0, 1)

	BadgeUnknown = lipgloss.NewStyle().
			Foreground(lipgloss.Color("15")).
			Background(ColorMuted).
			Padding(0, 1)
)

// TableFormatter represents a beautiful formatted table
type TableFormatter struct {
	headers []string
	rows    [][]string
	style   lipgloss.Style
}

// NewTable creates a new table formatter
func NewTable(headers []string) *TableFormatter {
	return &TableFormatter{
		headers: headers,
		rows:    make([][]string, 0),
	}
}

// AddRow adds a row to the table
func (t *TableFormatter) AddRow(cells ...string) *TableFormatter {
	t.rows = append(t.rows, cells)
	return t
}

// AddRows adds multiple rows
func (t *TableFormatter) AddRows(rows [][]string) *TableFormatter {
	t.rows = append(t.rows, rows...)
	return t
}

// Render renders the table as a string
func (t *TableFormatter) Render() string {
	if len(t.rows) == 0 {
		return StyleMuted.Render("(empty)")
	}

	// Calculate column widths
	colWidths := make([]int, len(t.headers))
	for i, h := range t.headers {
		colWidths[i] = len(h)
	}
	for _, row := range t.rows {
		for i, cell := range row {
			if i < len(colWidths) && len(cell) > colWidths[i] {
				colWidths[i] = len(cell)
			}
		}
	}

	// Build header
	headerCells := make([]string, len(t.headers))
	for i, h := range t.headers {
		headerCells[i] = StyleTableHeader.
			Width(colWidths[i]).
			Render(padRight(h, colWidths[i]))
	}
	header := lipgloss.JoinHorizontal(lipgloss.Top, headerCells...)

	// Build rows
	var lines []string
	lines = append(lines, header)

	for _, row := range t.rows {
		cells := make([]string, len(t.headers))
		for i := 0; i < len(t.headers); i++ {
			cell := ""
			if i < len(row) {
				cell = row[i]
			}
			cells[i] = StyleTableRow.
				Width(colWidths[i]).
				Render(padRight(cell, colWidths[i]))
		}
		lines = append(lines, lipgloss.JoinHorizontal(lipgloss.Top, cells...))
	}

	return lipgloss.JoinVertical(lipgloss.Left, lines...)
}

// Print renders and prints the table
func (t *TableFormatter) Print(w io.Writer) {
	fmt.Fprintln(w, t.Render())
}

// StatusBadge returns a formatted status badge
func StatusBadge(status string) string {
	switch strings.ToLower(status) {
	case "online", "running", "active":
		return BadgeOnline.Render("●")
	case "stopped", "exited", "offline":
		return BadgeStopped.Render("●")
	case "waiting", "pending", "paused":
		return BadgeWaiting.Render("●")
	default:
		return BadgeUnknown.Render("●")
	}
}

// ProgressBar returns a formatted progress bar
func ProgressBar(value, max float64, width int) string {
	if max == 0 {
		return strings.Repeat("─", width)
	}

	filled := int((value / max) * float64(width))
	if filled > width {
		filled = width
	}

	bar := strings.Repeat("█", filled) + strings.Repeat("░", width-filled)
	return bar
}

// MemoryBar returns a formatted memory bar with percentage
func MemoryBar(used, total int64, width int) string {
	if total == 0 {
		return "0%"
	}
	pct := float64(used) / float64(total) * 100
	bar := ProgressBar(float64(used), float64(total), width-10)
	return fmt.Sprintf("%s %.1f%%", bar, pct)
}

// CPUBar returns a formatted CPU bar
func CPUBar(pct float64, width int) string {
	if pct > 100 {
		pct = 100
	}
	bar := ProgressBar(pct, 100, width-5)
	return fmt.Sprintf("%s %.1f%%", bar, pct)
}

// Panel renders content in a panel with border
func Panel(title string, content string) string {
	style := StyleBorder.Copy().
		Width(80).
		Height(5)

	if title != "" {
		style = style.BorderTop(true)
	}

	return style.Render(content)
}

// Section renders a titled section
func Section(title string, content string) string {
	titleStyle := StyleHeader.Padding(0, 1)
	return lipgloss.JoinVertical(
		lipgloss.Left,
		titleStyle.Render(title),
		content,
	)
}

// Alert renders an alert message
func Alert(level string, message string) string {
	switch strings.ToLower(level) {
	case "success":
		return StyleSuccess.Render("✓") + " " + message
	case "warning":
		return StyleWarning.Render("⚠") + " " + message
	case "error":
		return StyleDanger.Render("✗") + " " + message
	default:
		return "ℹ " + message
	}
}

// Spinner represents a spinner
type Spinner struct {
	message string
	frames  []string
	index   int
	done    chan struct{}
	ticker  *time.Ticker
}

// NewSpinner creates a new spinner
func NewSpinner(message string) *Spinner {
	return &Spinner{
		message: message,
		frames:  []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"},
		done:    make(chan struct{}),
	}
}

// Start starts the spinner
func (s *Spinner) Start() {
	s.ticker = time.NewTicker(100 * time.Millisecond)
	go func() {
		for {
			select {
			case <-s.ticker.C:
				s.index = (s.index + 1) % len(s.frames)
			case <-s.done:
				return
			}
		}
	}()
}

// Stop stops the spinner
func (s *Spinner) Stop() {
	s.done <- struct{}{}
	s.ticker.Stop()
}

// Frame returns the current frame
func (s *Spinner) Frame() string {
	return fmt.Sprintf("%s %s", s.frames[s.index], s.message)
}

// Icon returns an icon for a runtime
func Icon(runtime string) string {
	switch strings.ToLower(runtime) {
	case "node", "nodejs", "javascript":
		return "⬢"
	case "python":
		return "🐍"
	case "go", "golang":
		return "🐹"
	case "rust":
		return "🦀"
	case "php":
		return "🐘"
	case "java":
		return "☕"
	case "ruby":
		return "💎"
	case "dotnet", ".net":
		return "◆"
	case "container", "docker":
		return "🐋"
	default:
		return "◇"
	}
}

// Framework returns an icon for a framework
func Framework(fw string) string {
	switch strings.ToLower(fw) {
	case "express":
		return "⚡"
	case "react":
		return "⚛"
	case "vue":
		return "💚"
	case "angular":
		return "🅰"
	case "fastapi", "flask":
		return "🔗"
	case "django":
		return "🎸"
	case "spring", "springboot":
		return "🌿"
	default:
		return "→"
	}
}

// Helper functions
func padRight(s string, width int) string {
	if len(s) >= width {
		return s[:width]
	}
	return s + strings.Repeat(" ", width-len(s))
}

func padLeft(s string, width int) string {
	if len(s) >= width {
		return s
	}
	return strings.Repeat(" ", width-len(s)) + s
}

// Formatted output functions that replace pterm
func Infof(format string, args ...interface{}) {
	fmt.Printf("ℹ %s\n", fmt.Sprintf(format, args...))
}

func Successf(format string, args ...interface{}) {
	fmt.Printf("%s %s\n", StyleSuccess.Render("✓"), fmt.Sprintf(format, args...))
}

func Warnf(format string, args ...interface{}) {
	fmt.Printf("%s %s\n", StyleWarning.Render("⚠"), fmt.Sprintf(format, args...))
}

func Errorf(format string, args ...interface{}) {
	fmt.Printf("%s %s\n", StyleDanger.Render("✗"), fmt.Sprintf(format, args...))
}

func BannerString() string {
	bannerStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("51")).
		Bold(true)

	accentStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("87"))

	lines := []string{
		"  ███████ ██   ██ ██    ██ ██████   ██████  ██████  ████████",
		"  ██      ██  ██   ██  ██  ██   ██ ██    ██ ██   ██    ██   ",
		"  ███████ █████     ████   ██████  ██    ██ ██████     ██   ",
		"       ██ ██  ██     ██    ██      ██    ██ ██  ██     ██   ",
		"  ███████ ██   ██    ██    ██       ██████  ██   ██    ██   ",
	}

	subtitle := accentStyle.Italic(true).Render("☁  The Lightweight Developer Cloud OS")

	return bannerStyle.Render(strings.Join(lines, "\n")) + "\n\n" + subtitle + "\n"
}

// Banner displays the SkyPort banner
func Banner() {
	fmt.Println(BannerString())
}

// Prompt displays a prompt and reads user input
func Prompt(label string, defaultValue string) (string, error) {
	if defaultValue != "" {
		fmt.Printf("%s [%s]: ", label, defaultValue)
	} else {
		fmt.Printf("%s: ", label)
	}
	var input string
	if _, err := fmt.Scanln(&input); err != nil {
		if err == io.EOF {
			return strings.TrimSpace(defaultValue), nil
		}
		return "", err
	}
	input = strings.TrimSpace(input)
	if input == "" {
		return strings.TrimSpace(defaultValue), nil
	}
	return input, nil
}

// Confirm displays a confirmation prompt
func Confirm(label string, defaultValue bool) (bool, error) {
	prompt := "[y/N]"
	if defaultValue {
		prompt = "[Y/n]"
	}
	value, err := Prompt(label+" "+prompt, "")
	if err != nil {
		return false, err
	}
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "y", "yes", "true", "1":
		return true, nil
	case "n", "no", "false", "0":
		return false, nil
	default:
		return defaultValue, nil
	}
}

// HumanDuration formats a duration in human-readable form
func HumanDuration(d time.Duration) string {
	if d < time.Second {
		return d.String()
	}
	return d.Round(time.Second).String()
}

// Table renders a simple table (for backward compatibility)
func Table(headers []string, rows [][]string) error {
	t := NewTable(headers)
	t.AddRows(rows)
	t.Print(os.Stdout)
	return nil
}
