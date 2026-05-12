package installers

import (
	"context"
	"errors"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// PrimaryBinary returns the main executable searched on PATH before deciding to install.
func PrimaryBinary(rt string) string {
	switch rt {
	case "node":
		return "node"
	case "bun":
		return "bun"
	case "deno":
		return "deno"
	case "python":
		return ""
	case "go":
		return "go"
	case "php":
		return "php"
	case "java":
		return "java"
	default:
		return rt
	}
}

// LookPathRuntime checks python as python3 then python; other runtimes use PrimaryBinary.
func LookPathRuntime(rt string) (path string, ok bool) {
	if rt == "python" {
		for _, n := range []string{"python3", "python", "py"} {
			if p, err := exec.LookPath(n); err == nil {
				return p, true
			}
		}
		return "", false
	}
	bin := PrimaryBinary(rt)
	if bin == "" {
		return "", false
	}
	p, err := exec.LookPath(bin)
	if err != nil {
		return "", false
	}
	return p, true
}

// CommandsFor returns host install commands (preview / execute).
func CommandsFor(rt string) []string {
	return commandsFor(rt)
}

type Request struct {
	Runtime string `json:"runtime"`
	DryRun  bool   `json:"dry_run"`
	Execute bool   `json:"execute"`
}

type Result struct {
	Runtime   string   `json:"runtime"`
	Installed bool     `json:"installed"`
	Commands  []string `json:"commands"`
	Output    string   `json:"output,omitempty"`
}

func Install(ctx context.Context, req Request) (Result, error) {
	commands := commandsFor(req.Runtime)
	out := Result{Runtime: req.Runtime, Commands: commands}
	if len(commands) == 0 && !req.DryRun && req.Execute {
		return out, errors.New("no install recipe for this OS/runtime")
	}
	if req.DryRun || !req.Execute || len(commands) == 0 {
		return out, nil
	}
	var output strings.Builder
	for _, command := range commands {
		cctx, cancel := context.WithTimeout(ctx, 3*time.Minute)
		cmd := exec.CommandContext(cctx, "sh", "-c", command)
		if runtime.GOOS == "windows" {
			cmd = exec.CommandContext(cctx, "powershell", "-NoProfile", "-Command", command)
		}
		b, err := cmd.CombinedOutput()
		cancel()
		output.WriteString(string(b))
		output.WriteString("\n")
		if err != nil {
			out.Output = strings.TrimSpace(output.String())
			return out, err
		}
	}
	out.Installed = true
	out.Output = strings.TrimSpace(output.String())
	return out, nil
}

func commandsFor(rt string) []string {
	return getInstallCommands(rt)
}
