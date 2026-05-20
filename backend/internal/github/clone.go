package github

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"net/url"
)

func cloneRepository(ctx context.Context, targetPath, repository, branch, token string) error {
	if strings.TrimSpace(repository) == "" {
		return errors.New("repository is required")
	}
	parts := strings.Split(strings.TrimSpace(repository), "/")
	if len(parts) != 2 || strings.TrimSpace(parts[0]) == "" || strings.TrimSpace(parts[1]) == "" {
		return errors.New("repository must be in owner/repo format")
	}
	if _, err := exec.LookPath("git"); err != nil {
		return errors.New("git executable not found on host")
	}

	cloneURL := (&url.URL{
		Scheme: "https",
		Host:   "github.com",
		Path:   "/" + strings.TrimSpace(repository) + ".git",
		User:   url.UserPassword("x-access-token", strings.TrimSpace(token)),
	}).String()
	cloneArgs := []string{"clone"}
	if strings.TrimSpace(branch) != "" {
		cloneArgs = append(cloneArgs, "--branch", strings.TrimSpace(branch))
	}
	cmd := exec.CommandContext(ctx, "git", append(cloneArgs, cloneURL, targetPath)...)
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to clone repository: %w: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}
