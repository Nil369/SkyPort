package runtime

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDetectNode(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	out, err := NewDetector().Detect(dir)
	if err != nil {
		t.Fatal(err)
	}
	if out.Runtime != Node {
		t.Fatalf("expected node runtime, got %s", out.Runtime)
	}
}

func TestDetectNestedMonorepoPrefersServer(t *testing.T) {
	dir := t.TempDir()
	clientDir := filepath.Join(dir, "client")
	serverDir := filepath.Join(dir, "server")
	if err := os.MkdirAll(clientDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(serverDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(clientDir, "package.json"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(serverDir, "package.json"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	out, err := NewDetector().Detect(dir)
	if err != nil {
		t.Fatal(err)
	}
	if out.Runtime != Node {
		t.Fatalf("expected node, got %s", out.Runtime)
	}
	if out.WorkingDirectory != "server" {
		t.Fatalf("expected server working dir, got %q", out.WorkingDirectory)
	}
	if len(out.MatchedFiles) < 2 {
		t.Fatalf("expected matched nested package.json files, got %v", out.MatchedFiles)
	}
}

func TestDetectDockerComposeOverDockerfile(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "docker-compose.yml"), []byte("services:\n  x: {}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	cli := filepath.Join(dir, "client")
	if err := os.MkdirAll(cli, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(cli, "Dockerfile"), []byte("FROM scratch\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	out, err := NewDetector().Detect(dir)
	if err != nil {
		t.Fatal(err)
	}
	if out.Runtime != Compose {
		t.Fatalf("expected compose, got %s", out.Runtime)
	}
}
