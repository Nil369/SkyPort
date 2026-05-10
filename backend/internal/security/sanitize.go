package security

import (
	"errors"
	"path/filepath"
	"strings"
)

// EnsureWithinRoot ensures the candidate path is inside the configured root.
func EnsureWithinRoot(root, candidate string) (string, error) {
	cleanRoot, err := filepath.Abs(filepath.Clean(root))
	if err != nil {
		return "", err
	}
	cleanCandidate, err := filepath.Abs(filepath.Clean(candidate))
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(cleanRoot, cleanCandidate)
	if err != nil {
		return "", err
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", errors.New("path escapes workspace root")
	}
	return cleanCandidate, nil
}

// SafeName keeps names shell-safe and filesystem-safe.
func SafeName(v string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return "app"
	}
	var b strings.Builder
	for _, r := range v {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' || r == '.' {
			b.WriteRune(r)
		}
	}
	if b.Len() == 0 {
		return "app"
	}
	return b.String()
}
