package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"skyport/internal/models"
	"skyport/internal/testutil"
)

func TestRuntimeDetectRoute(t *testing.T) {
	a := testutil.BuildTestApp(t)
	dir := filepath.Join(a.Config.WorkspaceRoot, "node-app")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte(`{"name":"x"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	auth := testutil.BearerJWTForTests(t, a)

	body, _ := json.Marshal(map[string]string{"project_path": dir})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/runtime/detect", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", auth)
	resp, err := a.Fiber.Test(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("detect failed err=%v code=%d", err, resp.StatusCode)
	}
}

func TestCapabilitiesRoute(t *testing.T) {
	a := testutil.BuildTestApp(t)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/system/capabilities", nil)
	resp, err := a.Fiber.Test(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("capabilities failed err=%v code=%d", err, resp.StatusCode)
	}
}

func TestDeploymentCRUD(t *testing.T) {
	a := testutil.BuildTestApp(t)
	auth := testutil.BearerJWTForTests(t, a)
	p := models.Project{Name: "demo", Path: t.TempDir()}
	if err := a.DB.Create(&p).Error; err != nil {
		t.Fatal(err)
	}

	createBody, _ := json.Marshal(map[string]any{"project_id": p.ID, "auto_start": false})
	createReq := httptest.NewRequest(http.MethodPost, "/api/v1/deployments", bytes.NewReader(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", auth)
	createResp, err := a.Fiber.Test(createReq)
	if err != nil || createResp.StatusCode != http.StatusCreated {
		t.Fatalf("create deployment failed err=%v code=%d", err, createResp.StatusCode)
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/deployments", nil)
	listReq.Header.Set("Authorization", auth)
	listResp, err := a.Fiber.Test(listReq)
	if err != nil || listResp.StatusCode != http.StatusOK {
		t.Fatalf("list deployment failed err=%v code=%d", err, listResp.StatusCode)
	}
}

func TestBulkEnvEndpoint(t *testing.T) {
	a := testutil.BuildTestApp(t)
	auth := testutil.BearerJWTForTests(t, a)
	p := models.Project{Name: "demo-env", Path: t.TempDir()}
	if err := a.DB.Create(&p).Error; err != nil {
		t.Fatal(err)
	}
	createBody, _ := json.Marshal(map[string]any{"project_id": p.ID, "auto_start": false})
	createReq := httptest.NewRequest(http.MethodPost, "/api/v1/deployments", bytes.NewReader(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", auth)
	createResp, err := a.Fiber.Test(createReq)
	if err != nil || createResp.StatusCode != http.StatusCreated {
		t.Fatalf("create deployment failed err=%v code=%d", err, createResp.StatusCode)
	}
	var dep models.Deployment
	if err := a.DB.Order("id desc").First(&dep).Error; err != nil {
		t.Fatal(err)
	}

	bulkBody := []byte(`{"items":[{"key":"A","value":"1"},{"key":"B","value":"2","masked":true}],"env_text":"C=3\n#X\nD='4'"}`)
	bulkReq := httptest.NewRequest(http.MethodPost, "/api/v1/deployments/"+strconv.FormatUint(uint64(dep.ID), 10)+"/env/bulk", bytes.NewReader(bulkBody))
	bulkReq.Header.Set("Content-Type", "application/json")
	bulkReq.Header.Set("Authorization", auth)
	bulkResp, err := a.Fiber.Test(bulkReq)
	if err != nil || bulkResp.StatusCode != http.StatusCreated {
		t.Fatalf("bulk env failed err=%v code=%d", err, bulkResp.StatusCode)
	}
}
