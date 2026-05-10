package testutil

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"skyport/internal/app"
	"skyport/internal/bootstrap"
	"skyport/internal/config"
	"skyport/internal/database"
)

func BuildTestApp(t *testing.T) *app.App {
	t.Helper()
	cfg := &config.Config{
		Host:             "127.0.0.1",
		Port:             0,
		DBPath:           filepath.Join(t.TempDir(), "test.db"),
		WorkspaceRoot:    t.TempDir(),
		Environment:      "test",
		LogLevel:         "error",
		ShutdownTimeout:  3 * time.Second,
		JWTSecret:        "test-secret-test-secret-test-secret",
		JWTExpires:       time.Hour,
		AllowedOrigins:   []string{"http://localhost:3000"},
		TrustedProxies:   []string{"127.0.0.1"},
		EnableTerminal:   false,
		EnableMetrics:    true,
		EnableDocker:     false,
		EnableFilesystem: true,
		EnableProjects:   true,
	}
	app, err := bootstrap.Build(cfg)
	if err != nil {
		t.Fatalf("build app: %v", err)
	}
	t.Cleanup(func() {
		_ = database.Close(app.DB)
	})
	return app
}

// BearerJWTForTests registers a disposable user and returns "Bearer <jwt>" for protected routes.
func BearerJWTForTests(t *testing.T, app *app.App) string {
	t.Helper()
	email := fmt.Sprintf("user%d@test.skyport", time.Now().UnixNano())
	regBody := []byte(fmt.Sprintf(`{"name":"Swagger Test","email":%q,"password":"password123"}`, email))
	regReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", bytes.NewReader(regBody))
	regReq.Header.Set("Content-Type", "application/json")
	regResp, err := app.Fiber.Test(regReq)
	code := 0
	if regResp != nil {
		code = regResp.StatusCode
	}
	if err != nil || code != http.StatusCreated {
		t.Fatalf("register for tests: status=%d err=%v", code, err)
	}
	loginBody := []byte(fmt.Sprintf(`{"email":%q,"password":"password123"}`, email))
	loginReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(loginBody))
	loginReq.Header.Set("Content-Type", "application/json")
	loginResp, err := app.Fiber.Test(loginReq)
	if err != nil || loginResp.StatusCode != http.StatusOK {
		t.Fatalf("login for tests: status=%d err=%v", loginResp.StatusCode, err)
	}
	var loginPayload struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(loginResp.Body).Decode(&loginPayload); err != nil {
		t.Fatal(err)
	}
	if loginPayload.AccessToken == "" {
		t.Fatal("empty jwt")
	}
	return "Bearer " + loginPayload.AccessToken
}
