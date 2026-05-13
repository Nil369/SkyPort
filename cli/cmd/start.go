package cmd

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/pterm/pterm"
	"github.com/spf13/cobra"

	"skyport-cli/internal/ui"
)

func newStartCommand() *cobra.Command {
	cmd := &cobra.Command{Use: "start", Short: "Start SkyPort services"}
	cmd.AddCommand(newStartWebUICommand())
	return cmd
}

func newStartWebUICommand() *cobra.Command {
	var host string
	var port int
	var binaryPath string
	var browser bool
	cmd := &cobra.Command{
		Use:   "webui",
		Short: "Start or open the embedded SkyPort web UI",
		RunE: func(cmd *cobra.Command, args []string) error {
			if port <= 0 {
				port = 8080
			}
			bindHost, probeURL, displayURL := webUIEndpoints(strings.TrimSpace(host), port)
			if healthy(probeURL) {
				ui.Successf("SkyPort web UI is already running at %s", displayURL)
				if browser {
					return openBrowser(displayURL)
				}
				return nil
			}

			exe, err := resolveBackendBinary(binaryPath)
			if err != nil {
				return err
			}

			spinner, _ := pterm.DefaultSpinner.Start("Starting SkyPort web UI")
			ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			defer cancel()
			cmdExec := exec.CommandContext(ctx, exe)
			cmdExec.Env = append(os.Environ(),
				"SKYPORT_HOST="+bindHost,
				fmt.Sprintf("SKYPORT_PORT=%d", port),
			)
			cmdExec.Dir = filepath.Dir(exe)
			stdout, _ := cmdExec.StdoutPipe()
			stderr, _ := cmdExec.StderrPipe()
			if err := cmdExec.Start(); err != nil {
				spinner.Fail(err.Error())
				return err
			}
			go func() { _, _ = io.Copy(os.Stdout, stdout) }()
			go func() { _, _ = io.Copy(os.Stderr, stderr) }()
			if err := waitForHealth(probeURL, 45*time.Second); err != nil {
				spinner.Fail(err.Error())
				return err
			}
			spinner.Success("SkyPort web UI ready")
			ui.Successf("Web UI available at %s", displayURL)
			if browser {
				return openBrowser(displayURL)
			}
			return nil
		},
	}
	cmd.Flags().StringVar(&host, "host", "", "HTTP bind address (empty: Windows/macOS use loopback + http://localhost; Linux uses 0.0.0.0 + LAN IP in messages)")
	cmd.Flags().IntVar(&port, "port", 8080, "local port")
	cmd.Flags().StringVar(&binaryPath, "binary", "", "path to the SkyPort backend binary")
	cmd.Flags().BoolVar(&browser, "browser", true, "open the browser once ready")
	return cmd
}

func resolveBackendBinary(explicit string) (string, error) {
	if strings.TrimSpace(explicit) != "" {
		if abs, err := filepath.Abs(explicit); err == nil {
			if _, err := os.Stat(abs); err == nil {
				return abs, nil
			}
		}
		return "", fmt.Errorf("backend binary not found at %s", explicit)
	}
	for _, name := range []string{"skyport-server", "skyport-backend", "skyport-server.exe", "skyport-backend.exe"} {
		if path, err := exec.LookPath(name); err == nil {
			return path, nil
		}
	}
	candidates := []string{}
	if runtime.GOOS == "windows" {
		candidates = append(candidates,
			`..\backend\bin\windows-amd64\skyport.exe`,
			`..\backend\bin\windows-amd64\skyport-server.exe`,
			`..\bin\server\windows-amd64\skyport-server.exe`,
			`..\bin\windows-amd64\skyport.exe`,
			`..\bin\windows-amd64\skyport-server.exe`,
		)
	} else {
		candidates = append(candidates,
			"../backend/bin/linux-amd64/skyport",
			"../backend/bin/linux-amd64/skyport-server",
			"../bin/server/linux-amd64/skyport-server",
			"../bin/linux-amd64/skyport",
			"../bin/linux-amd64/skyport-server",
		)
	}
	for _, candidate := range candidates {
		abs, err := filepath.Abs(candidate)
		if err != nil {
			continue
		}
		if _, err := os.Stat(abs); err == nil {
			return abs, nil
		}
	}
	return "", errors.New("no embedded-webui backend binary found; build the backend or pass --binary")
}

// webUIEndpoints returns SKYPORT_HOST bind address, URL for /api/v1/health checks, and URL to show or open in the browser.
func webUIEndpoints(host string, port int) (bindHost, probeURL, displayURL string) {
	ps := fmt.Sprintf("%d", port)
	if host == "" {
		if runtime.GOOS == "windows" || runtime.GOOS == "darwin" {
			bindHost = "127.0.0.1"
			probeURL = "http://127.0.0.1:" + ps
			displayURL = "http://localhost:" + ps
			return
		}
		bindHost = "0.0.0.0"
		probeURL = "http://127.0.0.1:" + ps
		if pub, ok := firstPublicIPv4(); ok {
			displayURL = "http://" + pub + ":" + ps
		} else {
			displayURL = probeURL
		}
		return
	}
	bindHost = host
	switch {
	case host == "0.0.0.0":
		probeURL = "http://127.0.0.1:" + ps
		if pub, ok := firstPublicIPv4(); ok {
			displayURL = "http://" + pub + ":" + ps
		} else {
			displayURL = probeURL
		}
	case host == "127.0.0.1" || strings.EqualFold(host, "localhost"):
		probeURL = "http://127.0.0.1:" + ps
		if runtime.GOOS == "windows" {
			displayURL = "http://localhost:" + ps
		} else if strings.EqualFold(host, "localhost") {
			displayURL = "http://localhost:" + ps
		} else {
			displayURL = "http://127.0.0.1:" + ps
		}
	default:
		probeURL = "http://" + host + ":" + ps
		displayURL = probeURL
	}
	return
}

func firstPublicIPv4() (string, bool) {
	ifaces, err := net.Interfaces()
	if err != nil {
		return "", false
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, a := range addrs {
			ipnet, ok := a.(*net.IPNet)
			if !ok {
				continue
			}
			ip := ipnet.IP.To4()
			if ip == nil || ip.IsLoopback() {
				continue
			}
			return ip.String(), true
		}
	}
	return "", false
}

func healthy(baseURL string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/api/v1/health", nil)
	if err != nil {
		return false
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

func waitForHealth(baseURL string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if healthy(baseURL) {
			return nil
		}
		time.Sleep(750 * time.Millisecond)
	}
	return fmt.Errorf("web ui did not become ready at %s", baseURL)
}

func openBrowser(target string) error {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("cmd", "/c", "start", "", target).Start()
	case "darwin":
		return exec.Command("open", target).Start()
	default:
		return exec.Command("xdg-open", target).Start()
	}
}