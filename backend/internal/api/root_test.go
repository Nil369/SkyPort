package api_test

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"skyport/internal/testutil"
)

func TestAPIRootRoute(t *testing.T) {
	a := testutil.BuildTestApp(t)
	req := httptest.NewRequest("GET", "/api", nil)
	resp, err := a.Fiber.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	var payload map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if payload["service"] != "SkyPort" {
		t.Fatalf("unexpected service: %v", payload["service"])
	}
}

func TestRootServesEmbeddedUI(t *testing.T) {
	a := testutil.BuildTestApp(t)
	req := httptest.NewRequest("GET", "/", nil)
	resp, err := a.Fiber.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	ct := resp.Header.Get("Content-Type")
	if ct == "" || !strings.Contains(strings.ToLower(ct), "text/html") {
		t.Fatalf("expected HTML content-type, got %q", ct)
	}
}
