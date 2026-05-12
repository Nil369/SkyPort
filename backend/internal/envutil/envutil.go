// Package envutil normalizes environment maps and .env-style text for safe backend use.
package envutil

import (
	"fmt"
	"regexp"
	"strings"
	"unicode"
)

var keyPattern = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

// Result holds normalized key/value pairs and non-fatal parse issues.
type Result struct {
	Vars     map[string]string
	Warnings []string
}

// NormalizeMap trims keys, validates names, trims values, and drops empties.
// Later keys win over earlier duplicates (caller-order preserved by iterating map — undefined; use ParseLines for order).
func NormalizeMap(in map[string]string) Result {
	out := make(map[string]string, len(in))
	var warn []string
	for k, v := range in {
		key := strings.TrimSpace(k)
		if key == "" {
			warn = append(warn, "skipped empty env key")
			continue
		}
		if !keyPattern.MatchString(key) {
			warn = append(warn, fmt.Sprintf("skipped invalid env key %q", key))
			continue
		}
		val := normalizeValue(v)
		out[key] = val
	}
	return Result{Vars: out, Warnings: warn}
}

// ParseLines parses KEY=value lines (export prefix, comments, blank lines).
// Duplicate keys: last occurrence wins. Values may be single/double quoted.
func ParseLines(raw string) Result {
	out := make(map[string]string)
	var warn []string
	lines := strings.Split(strings.ReplaceAll(raw, "\r\n", "\n"), "\n")

	for _, rawLine := range lines {
		line := strings.TrimSpace(rawLine)
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "#") {
			continue
		}
		// strip inline comment only when not inside quotes (simple heuristic)
		if idx := strings.Index(line, " #"); idx >= 0 && !strings.Contains(line[:idx], `"`) && !strings.Contains(line[:idx], `'`) {
			line = strings.TrimSpace(line[:idx])
		}
		if line == "" {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		line = strings.TrimSpace(line)
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			warn = append(warn, fmt.Sprintf("skipped malformed line: %q", truncate(rawLine, 80)))
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := normalizeValue(parts[1])
		if key == "" {
			warn = append(warn, "skipped line with empty key")
			continue
		}
		if !keyPattern.MatchString(key) {
			warn = append(warn, fmt.Sprintf("skipped invalid key %q", key))
			continue
		}
		if _, exists := out[key]; exists {
			warn = append(warn, fmt.Sprintf("duplicate key %q — using last value", key))
		}
		out[key] = val
	}

	return Result{Vars: out, Warnings: warn}
}

func normalizeValue(v string) string {
	v = strings.TrimSpace(v)
	if len(v) >= 2 {
		if (v[0] == '"' && v[len(v)-1] == '"') || (v[0] == '\'' && v[len(v)-1] == '\'') {
			v = strings.Trim(v, `"'`)
		}
	}
	v = strings.TrimSpace(v)
	// strip zero-width and BOM
	v = strings.TrimLeftFunc(v, func(r rune) bool {
		return r == '\ufeff' || unicode.IsSpace(r)
	})
	return v
}

func truncate(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// ValidKey reports whether k is a safe POSIX-style environment name.
func ValidKey(k string) bool {
	k = strings.TrimSpace(k)
	return k != "" && keyPattern.MatchString(k)
}
