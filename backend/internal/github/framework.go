package github

import (
	"os"
	"path/filepath"
	"strings"
)

func DetectFramework(root string) (FrameworkDetection, error) {
	checks := []struct {
		file      string
		framework string
	}{
		{"Dockerfile", "docker"},
		{"go.mod", "go"},
		{"requirements.txt", "python"},
		{"bun.lockb", "bun"},
		{"pnpm-lock.yaml", "pnpm"},
		{"package.json", "node"},
		{"yarn.lock", "node"},
	}

	matched := make([]string, 0, len(checks))
	for _, check := range checks {
		if _, err := os.Stat(filepath.Join(root, check.file)); err == nil {
			matched = append(matched, check.file)
			return FrameworkDetection{Framework: check.framework, Files: matched}, nil
		}
	}
	return FrameworkDetection{Framework: "unknown", Files: matched}, nil
}

func defaultIfEmpty(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
