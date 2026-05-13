package updates

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"sync"
	"time"
)

// ReleaseInfo contains GitHub release information
type ReleaseInfo struct {
	TagName      string    `json:"tag_name"`
	Name         string    `json:"name"`
	Body         string    `json:"body"`
	Published    time.Time `json:"published_at"`
	IsPrerelease bool      `json:"prerelease"`
	IsDraft      bool      `json:"draft"`
	HTMLURL      string    `json:"html_url"`
}

// UpdateCheckResult contains the result of a release check
type UpdateCheckResult struct {
	IsUpdateAvailable bool
	CurrentVersion    string
	LatestVersion     string
	LatestRelease     *ReleaseInfo
	CheckTime         time.Time
	Error             string
}

// ReleaseChecker checks for new releases
type ReleaseChecker struct {
	owner          string
	repo           string
	currentVersion string
	lastCheck      time.Time
	lastResult     *UpdateCheckResult
	cacheMutex     sync.RWMutex
	cacheTimeout   time.Duration
	httpClient     *http.Client
}

// NewReleaseChecker creates a new release checker
func NewReleaseChecker(owner, repo, currentVersion string) *ReleaseChecker {
	return &ReleaseChecker{
		owner:          owner,
		repo:           repo,
		currentVersion: currentVersion,
		cacheTimeout:   1 * time.Hour,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// CheckForUpdates checks if a newer version is available
func (rc *ReleaseChecker) CheckForUpdates() (*UpdateCheckResult, error) {
	// Return cached result if still valid
	rc.cacheMutex.RLock()
	if rc.lastResult != nil && time.Since(rc.lastCheck) < rc.cacheTimeout {
		defer rc.cacheMutex.RUnlock()
		return rc.lastResult, nil
	}
	rc.cacheMutex.RUnlock()

	// Fetch latest releases
	releases, err := rc.fetchLatestReleases()
	if err != nil {
		return &UpdateCheckResult{
			IsUpdateAvailable: false,
			CurrentVersion:    rc.currentVersion,
			CheckTime:         time.Now(),
			Error:             fmt.Sprintf("Failed to check for updates: %v", err),
		}, nil
	}

	if len(releases) == 0 {
		return &UpdateCheckResult{
			IsUpdateAvailable: false,
			CurrentVersion:    rc.currentVersion,
			LatestVersion:     rc.currentVersion,
			CheckTime:         time.Now(),
		}, nil
	}

	// Get the latest stable release
	latestRelease := rc.getLatestStableRelease(releases)
	if latestRelease == nil && len(releases) > 0 {
		latestRelease = &releases[0]
	}

	result := &UpdateCheckResult{
		CurrentVersion: rc.currentVersion,
		CheckTime:      time.Now(),
	}

	if latestRelease != nil {
		result.LatestVersion = latestRelease.TagName
		result.LatestRelease = latestRelease

		// Compare versions
		if compareVersions(rc.currentVersion, latestRelease.TagName) < 0 {
			result.IsUpdateAvailable = true
		}
	}

	// Cache the result
	rc.cacheMutex.Lock()
	rc.lastResult = result
	rc.lastCheck = time.Now()
	rc.cacheMutex.Unlock()

	return result, nil
}

// fetchLatestReleases fetches the latest releases from GitHub
func (rc *ReleaseChecker) fetchLatestReleases() ([]ReleaseInfo, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases?per_page=10", rc.owner, rc.repo)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	// Add GitHub API headers
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "SkyPort")

	resp, err := rc.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("GitHub API error: %d - %s", resp.StatusCode, string(body))
	}

	var releases []ReleaseInfo
	if err := json.NewDecoder(resp.Body).Decode(&releases); err != nil {
		return nil, fmt.Errorf("failed to decode releases: %w", err)
	}

	return releases, nil
}

// getLatestStableRelease returns the latest stable (non-prerelease, non-draft) release
func (rc *ReleaseChecker) getLatestStableRelease(releases []ReleaseInfo) *ReleaseInfo {
	for _, release := range releases {
		if !release.IsPrerelease && !release.IsDraft {
			return &release
		}
	}
	return nil
}

// compareVersions compares two semantic versions
// Returns: -1 if v1 < v2, 0 if v1 == v2, 1 if v1 > v2
func compareVersions(v1, v2 string) int {
	// Remove 'v' prefix if present
	v1 = regexp.MustCompile(`^v`).ReplaceAllString(v1, "")
	v2 = regexp.MustCompile(`^v`).ReplaceAllString(v2, "")

	parts1 := parseVersion(v1)
	parts2 := parseVersion(v2)

	// Compare each part
	maxLen := len(parts1)
	if len(parts2) > maxLen {
		maxLen = len(parts2)
	}

	for i := 0; i < maxLen; i++ {
		p1 := 0
		p2 := 0

		if i < len(parts1) {
			p1 = parts1[i]
		}
		if i < len(parts2) {
			p2 = parts2[i]
		}

		if p1 < p2 {
			return -1
		} else if p1 > p2 {
			return 1
		}
	}

	return 0
}

// parseVersion extracts numeric parts from a version string
func parseVersion(version string) []int {
	// Extract numeric parts (e.g., "1.2.3-alpha" -> [1, 2, 3])
	re := regexp.MustCompile(`(\d+)`)
	matches := re.FindAllString(version, -1)

	parts := make([]int, len(matches))
	for i, match := range matches {
		var val int
		fmt.Sscanf(match, "%d", &val)
		parts[i] = val
	}

	return parts
}

// GetCachedResult returns the last cached check result
func (rc *ReleaseChecker) GetCachedResult() *UpdateCheckResult {
	rc.cacheMutex.RLock()
	defer rc.cacheMutex.RUnlock()
	return rc.lastResult
}

// ClearCache clears the cached result
func (rc *ReleaseChecker) ClearCache() {
	rc.cacheMutex.Lock()
	defer rc.cacheMutex.Unlock()
	rc.lastResult = nil
}

// SetCurrentVersion updates the current version
func (rc *ReleaseChecker) SetCurrentVersion(version string) {
	rc.currentVersion = version
	rc.ClearCache()
}
