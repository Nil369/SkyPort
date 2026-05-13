package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

type Client struct {
	BaseURL    string
	Token      string
	HTTP       *http.Client
	UserAgent  string
}

func New(baseURL, token string) *Client {
	return &Client{
		BaseURL:   strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		Token:     strings.TrimSpace(token),
		HTTP:      &http.Client{Timeout: 60 * time.Second},
		UserAgent:  "SkyPort CLI/1.0",
	}
}

func (c *Client) abs(path string) string {
	return c.BaseURL + path
}

func (c *Client) req(ctx context.Context, method, path string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(payload)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.abs(path), reader)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", c.UserAgent)
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode >= 400 {
		var e ErrorBody
		if json.Unmarshal(data, &e) == nil && (e.Message != "" || e.Code != "") {
			if e.Code != "" {
				return fmt.Errorf("%s: %s", e.Code, e.Message)
			}
			return errors.New(e.Message)
		}
		msg := strings.TrimSpace(string(data))
		if msg == "" {
			msg = resp.Status
		}
		return errors.New(msg)
	}
	if out == nil || len(data) == 0 {
		return nil
	}
	return json.Unmarshal(data, out)
}

func (c *Client) health(ctx context.Context) (map[string]any, error) {
	var out map[string]any
	if err := c.req(ctx, http.MethodGet, "/api/v1/health", nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (c *Client) Health(ctx context.Context) (map[string]any, error) { return c.health(ctx) }

func (c *Client) Login(ctx context.Context, email, password string) (*AuthResponse, error) {
	var out AuthResponse
	if err := c.req(ctx, http.MethodPost, "/api/v1/auth/login", map[string]string{"email": email, "password": password}, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) WhoAmI(ctx context.Context) (*MeResponse, error) {
	var out MeResponse
	if err := c.req(ctx, http.MethodGet, "/api/v1/auth/me", nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) Logout(ctx context.Context) error {
	return c.req(ctx, http.MethodPost, "/api/v1/auth/logout", nil, nil)
}

func (c *Client) ListProjects(ctx context.Context) ([]Project, error) {
	var out []Project
	if err := c.req(ctx, http.MethodGet, "/api/v1/projects", nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (c *Client) CreateProject(ctx context.Context, req map[string]any) (*Project, error) {
	var out Project
	if err := c.req(ctx, http.MethodPost, "/api/v1/projects", req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) ListDeployments(ctx context.Context) ([]Deployment, error) {
	var out []Deployment
	if err := c.req(ctx, http.MethodGet, "/api/v1/deployments", nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (c *Client) GetDeployment(ctx context.Context, id string) (*Deployment, error) {
	var out Deployment
	if err := c.req(ctx, http.MethodGet, "/api/v1/deployments/"+url.PathEscape(strings.TrimSpace(id)), nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) DeleteDeployment(ctx context.Context, id string) error {
	return c.req(ctx, http.MethodDelete, "/api/v1/deployments/"+url.PathEscape(strings.TrimSpace(id)), nil, nil)
}

func (c *Client) RolloutDeployment(ctx context.Context, id, mode string) (map[string]any, error) {
	var out map[string]any
	body := map[string]string{}
	if strings.TrimSpace(mode) != "" {
		body["mode"] = mode
	}
	if err := c.req(ctx, http.MethodPost, "/api/v1/deployments/"+url.PathEscape(strings.TrimSpace(id))+"/rollout", body, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (c *Client) CreateDeployment(ctx context.Context, req map[string]any) (*Deployment, error) {
	var out Deployment
	if err := c.req(ctx, http.MethodPost, "/api/v1/deployments", req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) ListVPS(ctx context.Context) ([]VPS, error) {
	var payload struct {
		Success bool `json:"success"`
		Data    []VPS `json:"data"`
	}
	if err := c.req(ctx, http.MethodGet, "/api/v1/vps?offset=0&limit=200", nil, &payload); err != nil {
		return nil, err
	}
	return payload.Data, nil
}

func (c *Client) CreateVPS(ctx context.Context, req map[string]any) (*VPS, error) {
	var payload struct {
		Success bool `json:"success"`
		Data    VPS  `json:"data"`
	}
	if err := c.req(ctx, http.MethodPost, "/api/v1/vps", req, &payload); err != nil {
		return nil, err
	}
	return &payload.Data, nil
}

func (c *Client) DeleteVPS(ctx context.Context, id string) error {
	return c.req(ctx, http.MethodDelete, "/api/v1/vps/"+url.PathEscape(strings.TrimSpace(id)), nil, nil)
}

func (c *Client) ListMarketplaceApps(ctx context.Context) ([]MarketplaceApp, error) {
	var payload struct {
		Apps []MarketplaceApp `json:"apps"`
	}
	if err := c.req(ctx, http.MethodGet, "/api/v1/marketplace/apps", nil, &payload); err != nil {
		return nil, err
	}
	return payload.Apps, nil
}

func (c *Client) RecordMarketplaceInstall(ctx context.Context, slug, mode, status, notes string) (map[string]any, error) {
	body := map[string]string{"app_slug": slug, "install_mode": mode, "status": status, "notes": notes}
	var out map[string]any
	if err := c.req(ctx, http.MethodPost, "/api/v1/marketplace/installs", body, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (c *Client) ListFiles(ctx context.Context, path string) (map[string]any, error) {
	var out map[string]any
	if err := c.req(ctx, http.MethodGet, "/api/v1/files?path="+url.QueryEscape(path), nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (c *Client) UploadFile(ctx context.Context, remotePath, localPath string) (map[string]any, error) {
	file, err := os.Open(localPath)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	if err := writer.WriteField("path", remotePath); err != nil {
		return nil, err
	}
	part, err := writer.CreateFormFile("file", filepath.Base(localPath))
	if err != nil {
		return nil, err
	}
	if _, err := io.Copy(part, file); err != nil {
		return nil, err
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.abs("/api/v1/files/upload"), &buf)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Accept", "application/json")
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, errors.New(strings.TrimSpace(string(data)))
	}
	var out map[string]any
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (c *Client) DownloadFile(ctx context.Context, remotePath, localPath string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.abs("/api/v1/files/download?path="+url.QueryEscape(remotePath)), nil)
	if err != nil {
		return err
	}
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		data, _ := io.ReadAll(resp.Body)
		return errors.New(strings.TrimSpace(string(data)))
	}
	out, err := os.Create(localPath)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, resp.Body)
	return err
}

func (c *Client) Metrics(ctx context.Context) (*HostSnapshot, error) {
	var out HostSnapshot
	if err := c.req(ctx, http.MethodGet, "/api/v1/metrics", nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) SystemInfo(ctx context.Context) (*SystemInfo, error) {
	var out SystemInfo
	if err := c.req(ctx, http.MethodGet, "/api/v1/system/info", nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) OpenWebSocket(ctx context.Context, path string) (*websocket.Conn, *http.Response, error) {
	wsURL := strings.NewReplacer("https://", "wss://", "http://", "ws://").Replace(c.abs(path))
	if strings.Contains(wsURL, "?") {
		wsURL += "&token=" + url.QueryEscape(c.Token)
	} else if c.Token != "" {
		wsURL += "?token=" + url.QueryEscape(c.Token)
	}
	head := http.Header{}
	head.Set("User-Agent", c.UserAgent)
	if c.Token != "" {
		head.Set("Authorization", "Bearer "+c.Token)
	}
	dialer := websocket.Dialer{Proxy: http.ProxyFromEnvironment, HandshakeTimeout: 30 * time.Second, Subprotocols: []string{"jwt"}}
	return dialer.DialContext(ctx, wsURL, head)
}
