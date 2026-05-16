package daemon

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

func resolveBinary(explicit string) (string, error) {
	if trimmed := strings.TrimSpace(explicit); trimmed != "" {
		path, err := absPath(trimmed)
		if err != nil {
			return "", err
		}
		if _, err := os.Stat(path); err != nil {
			return "", fmt.Errorf("backend binary not found at %s", path)
		}
		return path, nil
	}

	if env := strings.TrimSpace(os.Getenv("SKYPORT_SERVER_BINARY")); env != "" {
		if path, err := absPath(env); err == nil {
			if _, err := os.Stat(path); err == nil {
				return path, nil
			}
		}
	}

	for _, name := range []string{
		binaryNameWithExt(),
		binaryName(),
		"skyport-backend",
		"skyport-backend.exe",
		"skyport.exe",
		"skyport-server.exe",
	} {
		if path, err := exec.LookPath(name); err == nil {
			return path, nil
		}
	}

	var candidates []string
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(exeDir, binaryName()),
			filepath.Join(exeDir, binaryNameWithExt()),
			filepath.Join(filepath.Dir(exeDir), binaryName()),
			filepath.Join(filepath.Dir(exeDir), binaryNameWithExt()),
		)
	}
	if cwd, err := os.Getwd(); err == nil {
		candidates = append(candidates,
			filepath.Join(cwd, binaryName()),
			filepath.Join(cwd, binaryNameWithExt()),
			filepath.Join(cwd, "..", "backend", "bin", platformBinaryDir(), binaryName()),
			filepath.Join(cwd, "..", "backend", "bin", platformBinaryDir(), binaryNameWithExt()),
			filepath.Join(cwd, "..", "bin", "server", platformBinaryDir(), binaryName()),
			filepath.Join(cwd, "..", "bin", "server", platformBinaryDir(), binaryNameWithExt()),
		)
	}

	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		path, err := absPath(candidate)
		if err != nil {
			continue
		}
		if _, err := os.Stat(path); err == nil {
			return path, nil
		}
	}

	return "", fmt.Errorf("unable to locate SkyPort backend binary; build skyport-server or pass --binary")
}

func binaryName() string { return "skyport-server" }

func binaryNameWithExt() string {
	if runtime.GOOS == "windows" {
		return "skyport-server.exe"
	}
	return "skyport-server"
}

func platformBinaryDir() string {
	return runtime.GOOS + "-" + runtime.GOARCH
}
