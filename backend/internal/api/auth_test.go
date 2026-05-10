package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"skyport/internal/testutil"
)

func TestAuthFlow(t *testing.T) {
	a := testutil.BuildTestApp(t)

	registerBody := []byte(`{"name":"Test User","email":"test@example.com","password":"password123"}`)
	registerReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", bytes.NewReader(registerBody))
	registerReq.Header.Set("Content-Type", "application/json")
	registerResp, err := a.Fiber.Test(registerReq)
	if err != nil || registerResp.StatusCode != http.StatusCreated {
		t.Fatalf("register failed err=%v code=%d", err, registerResp.StatusCode)
	}

	loginBody := []byte(`{"email":"test@example.com","password":"password123"}`)
	loginReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(loginBody))
	loginReq.Header.Set("Content-Type", "application/json")
	loginResp, err := a.Fiber.Test(loginReq)
	if err != nil || loginResp.StatusCode != http.StatusOK {
		t.Fatalf("login failed err=%v code=%d", err, loginResp.StatusCode)
	}

	var loginPayload struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(loginResp.Body).Decode(&loginPayload); err != nil {
		t.Fatalf("decode login: %v", err)
	}
	if loginPayload.AccessToken == "" {
		t.Fatalf("expected access token")
	}

	meReq := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	meReq.Header.Set("Authorization", "Bearer "+loginPayload.AccessToken)
	meResp, err := a.Fiber.Test(meReq)
	if err != nil || meResp.StatusCode != http.StatusOK {
		t.Fatalf("me failed err=%v code=%d", err, meResp.StatusCode)
	}
}
