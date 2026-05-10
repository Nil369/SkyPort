package api_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"skyport/internal/testutil"
)

func TestMetricsRoute(t *testing.T) {
	a := testutil.BuildTestApp(t)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/metrics", nil)
	resp, err := a.Fiber.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}
