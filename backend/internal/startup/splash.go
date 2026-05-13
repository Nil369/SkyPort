// Package startup renders the interactive CLI banner shown when SkyPort binds its listener.
//
// When stdout is not a terminal (systemd, Docker, CI), output falls back to compact plain logs
// so operators keep grep-friendly logs without ANSI escape noise.
package startup

import (
	"fmt"
	"io"
	"log"
	"os"
	"strings"
	"time"

	"github.com/charmbracelet/lipgloss"

	"golang.org/x/term"

	"skyport/internal/version"
)

// Options describes runtime flags used for the readiness banner.
type Options struct {
	Environment string

	AddrHTTP string // host:port actually listened on (e.g. 0.0.0.0:8080)
	BaseURL  string // friendly browser URL (e.g. http://localhost:8080)

	EmbeddedFrontend bool
	SQLiteOK         bool
	WebSocketHubOK   bool
	ModulesOK        bool
	DockerOK         bool

	EnableTerminal bool
	EnableMetrics  bool
}

var (
	// Sky / cyan palette (ANSI) for terminals without truecolor.
	skyDeep   = lipgloss.Color("117")
	skyBright = lipgloss.Color("159")
	skySoft   = lipgloss.Color("153")

	styleBanner = lipgloss.NewStyle().
			Foreground(skyDeep).
			Bold(true)

	styleMuted = lipgloss.NewStyle().
			Foreground(lipgloss.Color("245"))

	styleOk = lipgloss.NewStyle().
		Foreground(lipgloss.Color("42"))

	styleWarn = lipgloss.NewStyle().
			Foreground(lipgloss.Color("214"))

	styleURL = lipgloss.NewStyle().
			Foreground(lipgloss.Color("117"))

	styleWS = lipgloss.NewStyle().
		Foreground(lipgloss.Color("141"))

	styleAccent = lipgloss.NewStyle().
			Foreground(lipgloss.Color("183"))
)

// PrintSplash renders startup UX to w (normally os.Stdout).
func PrintSplash(w io.Writer, ready time.Duration, o Options) {
	if isTTY(w) {
		printRich(w, ready, o)
		return
	}
	printPlain(w, ready, o)
}

func isTTY(w io.Writer) bool {
	f, ok := w.(*os.File)
	if !ok {
		return false
	}
	return term.IsTerminal(int(f.Fd()))
}

func printRich(w io.Writer, ready time.Duration, o Options) {
	fmt.Fprintln(w, skyBrandBanner())
	head := fmt.Sprintf("SKYPORT v%s ready in %s", version.Version, ready.Round(time.Millisecond))
	fmt.Fprintln(w, styleBanner.Render(head))
	envTag := strings.ToUpper(strings.TrimSpace(o.Environment))
	if envTag == "" {
		envTag = "PRODUCTION"
	}
	fmt.Fprintln(w, styleMuted.Render(" env ")+styleAccent.Render(envTag)+styleMuted.Render(" · commit "+shortCommit()))
	fmt.Fprintln(w)

	base := strings.TrimRight(strings.TrimSpace(o.BaseURL), "/")
	fmt.Fprintln(w, bulletLine(styleMuted, styleURL, "Local", base))
	fmt.Fprintln(w, bulletLine(styleMuted, styleURL, "API", base+"/api"))
	fmt.Fprintln(w, bulletLine(styleMuted, styleURL, "Docs", base+"/docs/index.html"))
	if o.EnableMetrics {
		fmt.Fprintln(w, bulletLine(styleMuted, styleWS, "Metrics", wsURL(base)+"/ws/metrics"))
	}
	if o.EnableTerminal {
		fmt.Fprintln(w, bulletLine(styleMuted, styleWS, "Terminal", wsURL(base)+"/ws/terminal"))
	}
	fmt.Fprintln(w)

	check(w, o.EmbeddedFrontend, "Embedded frontend loaded")
	check(w, o.SQLiteOK, "SQLite connected")
	check(w, o.WebSocketHubOK, "WebSocket hub initialized")
	check(w, o.ModulesOK, "Modules initialized")
	check(w, o.DockerOK, "Docker integration ready")
	fmt.Fprintln(w)
}

func bulletLine(muted, val lipgloss.Style, label, url string) string {
	label = muted.Render(fmt.Sprintf("%-10s", label+":"))
	valStr := val.Render(url)
	return muted.Render("➜ ") + label + valStr
}

func check(w io.Writer, ok bool, msg string) {
	if ok {
		fmt.Fprintln(w, styleOk.Render("✓ ")+styleMuted.Render(msg))
		return
	}
	fmt.Fprintln(w, styleWarn.Render("○ ")+styleMuted.Render(msg))
}

func printPlain(w io.Writer, ready time.Duration, o Options) {
	base := strings.TrimRight(strings.TrimSpace(o.BaseURL), "/")
	log.Printf("skyport %s ready in %s env=%s listen=%s", version.Version, ready.Round(time.Millisecond), o.Environment, o.AddrHTTP)
	log.Printf("url=%s api=%s/docs/index.html", base, base)
	if o.EnableMetrics {
		log.Printf("ws_metrics=%s/ws/metrics", wsURL(base))
	}
	if o.EnableTerminal {
		log.Printf("ws_terminal=%s/ws/terminal", wsURL(base))
	}
}

// shortCommit trims ldflags commit for display.
func shortCommit() string {
	c := strings.TrimSpace(version.Commit)
	if len(c) > 12 {
		return c[:12]
	}
	return c
}

func wsURL(httpBase string) string {
	u := strings.TrimSpace(httpBase)
	if strings.HasPrefix(u, "https://") {
		return "wss://" + strings.TrimPrefix(u, "https://")
	}
	u = strings.TrimPrefix(u, "http://")
	return "ws://" + u
}

// skyBrandBanner draws a rounded frame in sky tones with the product name and tagline.
func skyBrandBanner() string {
	title := lipgloss.NewStyle().Foreground(skyBright).Bold(true).Render("SkyPort")
	sub := lipgloss.NewStyle().Foreground(skySoft).Render("The Lightweight Developer Cloud OS")
	body := lipgloss.JoinVertical(lipgloss.Center, title, sub)
	return lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(skyDeep).
		Padding(0, 2).
		Render(body)
}
