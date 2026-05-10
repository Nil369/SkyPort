package api_test

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"skyport/internal/testutil"
)

func TestRootRoute(t *testing.T) {
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
	var payload map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if payload["service"] != "SkyPort" {
		t.Fatalf("unexpected service: %v", payload["service"])
	}
}
