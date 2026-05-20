package github

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"
)

func (s *Service) listRepositories(ctx context.Context, token string) ([]RepositorySummary, error) {
	var out []RepositorySummary
	const enrichConcurrency = 8
	for page := 1; page <= 20; page++ {
		endpoint := fmt.Sprintf("%s/installation/repositories?per_page=100&page=%d", s.apiBaseURL, page)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Accept", "application/vnd.github+json")
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

		resp, err := s.httpClient.Do(req)
		if err != nil {
			return nil, err
		}
		body, _ := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		if resp.StatusCode >= 300 {
			return nil, fmt.Errorf("github repository fetch failed: %s", strings.TrimSpace(string(body)))
		}

		var payload struct {
			Repositories []struct {
				ID              int64      `json:"id"`
				Name            string     `json:"name"`
				FullName        string     `json:"full_name"`
				Private         bool       `json:"private"`
				Fork            bool       `json:"fork"`
				Archived        bool       `json:"archived"`
				Disabled        bool       `json:"disabled"`
				DefaultBranch   string     `json:"default_branch"`
				UpdatedAt       *time.Time `json:"updated_at"`
				CloneURL        string     `json:"clone_url"`
				SSHURL          string     `json:"ssh_url"`
				HomepageURL     string     `json:"homepage_url"`
				Description     string     `json:"description"`
				Language        string     `json:"language"`
				StargazersCount int        `json:"stargazers_count"`
				ForksCount      int        `json:"forks_count"`
				OpenIssuesCount int        `json:"open_issues_count"`
				Topics          []string   `json:"topics"`
				License         *struct {
					SPDXID string `json:"spdx_id"`
					Name   string `json:"name"`
				} `json:"license"`
				Owner struct {
					Login     string `json:"login"`
					AvatarURL string `json:"avatar_url"`
				} `json:"owner"`
			} `json:"repositories"`
		}
		if err := json.Unmarshal(body, &payload); err != nil {
			return nil, err
		}
		if len(payload.Repositories) == 0 {
			break
		}
		repos := make([]RepositorySummary, len(payload.Repositories))
		for idx, repo := range payload.Repositories {
			summary := RepositorySummary{
				ID:              repo.ID,
				Name:            repo.Name,
				FullName:        repo.FullName,
				Private:         repo.Private,
				Fork:            repo.Fork,
				Archived:        repo.Archived,
				Disabled:        repo.Disabled,
				DefaultBranch:   repo.DefaultBranch,
				UpdatedAt:       repo.UpdatedAt,
				Owner:           repo.Owner.Login,
				OwnerAvatar:     repo.Owner.AvatarURL,
				CloneURL:        repo.CloneURL,
				SSHURL:          repo.SSHURL,
				HomepageURL:     repo.HomepageURL,
				Description:     repo.Description,
				Language:        repo.Language,
				StargazersCount: repo.StargazersCount,
				ForksCount:      repo.ForksCount,
				OpenIssuesCount: repo.OpenIssuesCount,
				Topics:          repo.Topics,
				License: func() string {
					if repo.License == nil {
						return ""
					}
					if strings.TrimSpace(repo.License.SPDXID) != "" {
						return repo.License.SPDXID
					}
					return repo.License.Name
				}(),
			}
			repos[idx] = summary
		}
		var wg sync.WaitGroup
		sem := make(chan struct{}, enrichConcurrency)
		for idx := range repos {
			wg.Add(1)
			sem <- struct{}{}
			go func(i int) {
				defer wg.Done()
				defer func() { <-sem }()
				if enriched, err := s.enrichRepositorySummary(ctx, token, repos[i]); err == nil {
					repos[i] = enriched
				}
			}(idx)
		}
		wg.Wait()
		out = append(out, repos...)
		if len(payload.Repositories) < 100 {
			break
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].UpdatedAt == nil || out[j].UpdatedAt == nil {
			return out[i].FullName < out[j].FullName
		}
		return out[i].UpdatedAt.After(*out[j].UpdatedAt)
	})
	return out, nil
}

func (s *Service) enrichRepositorySummary(ctx context.Context, token string, summary RepositorySummary) (RepositorySummary, error) {
	parts := strings.SplitN(summary.FullName, "/", 2)
	if len(parts) != 2 || strings.TrimSpace(parts[0]) == "" || strings.TrimSpace(parts[1]) == "" {
		return summary, nil
	}
	endpoint := fmt.Sprintf("%s/repos/%s/%s", s.apiBaseURL, url.PathEscape(parts[0]), url.PathEscape(parts[1]))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return summary, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return summary, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return summary, fmt.Errorf("github repository detail fetch failed: %s", strings.TrimSpace(string(body)))
	}

	var detail struct {
		Owner struct {
			AvatarURL string `json:"avatar_url"`
		} `json:"owner"`
		StargazersCount int        `json:"stargazers_count"`
		ForksCount      int        `json:"forks_count"`
		OpenIssuesCount int        `json:"open_issues_count"`
		Language        string     `json:"language"`
		HomepageURL     string     `json:"homepage_url"`
		Description     string     `json:"description"`
		UpdatedAt       *time.Time `json:"updated_at"`
		License         *struct {
			SPDXID string `json:"spdx_id"`
			Name   string `json:"name"`
		} `json:"license"`
	}
	if err := json.Unmarshal(body, &detail); err != nil {
		return summary, err
	}
	if strings.TrimSpace(detail.Owner.AvatarURL) != "" {
		summary.OwnerAvatar = detail.Owner.AvatarURL
	}
	if strings.TrimSpace(detail.Language) != "" {
		summary.Language = detail.Language
	}
	if detail.StargazersCount != 0 {
		summary.StargazersCount = detail.StargazersCount
	}
	if detail.ForksCount != 0 {
		summary.ForksCount = detail.ForksCount
	}
	if detail.OpenIssuesCount != 0 {
		summary.OpenIssuesCount = detail.OpenIssuesCount
	}
	if strings.TrimSpace(detail.HomepageURL) != "" {
		summary.HomepageURL = detail.HomepageURL
	}
	if strings.TrimSpace(detail.Description) != "" {
		summary.Description = detail.Description
	}
	if detail.UpdatedAt != nil {
		summary.UpdatedAt = detail.UpdatedAt
	}
	if detail.License != nil {
		if strings.TrimSpace(detail.License.SPDXID) != "" {
			summary.License = detail.License.SPDXID
		} else if strings.TrimSpace(detail.License.Name) != "" {
			summary.License = detail.License.Name
		}
	}
	return summary, nil
}
