package runtime

import (
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

const maxScanDepth = 12 // max path segments below project root (memory-friendly cap)

var skipDir = map[string]bool{
	"node_modules": true,
	".git":         true,
	"vendor":       true,
	"dist":         true,
	"build":        true,
	".next":        true,
	"coverage":     true,
	"__pycache__":  true,
	"venv":         true,
	".venv":        true,
	"target":       true, // rust/npm sometimes
	".cargo":       true,
	".gradle":      true,
	".idea":        true,
	".vscode":      true,
}

var composeNames = map[string]bool{
	"docker-compose.yml": true, "docker-compose.yaml": true,
	"compose.yml": true, "compose.yaml": true,
}

type markerHit struct {
	Rel  string // posix-style relative path
	Dir  string // posix-style parent dir ("." for root file)
	Name string
}

type Detector struct{}

func NewDetector() *Detector { return &Detector{} }

func (d *Detector) Detect(projectPath string) (DetectionResult, error) {
	root := filepath.Clean(projectPath)
	var hits []markerHit
	err := filepath.WalkDir(root, func(path string, de os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, relErr := filepath.Rel(root, path)
		if relErr != nil {
			return relErr
		}
		if rel == "." {
			return nil
		}
		relSlash := filepath.ToSlash(rel)
		if de.IsDir() {
			base := de.Name()
			if skipDir[base] {
				return filepath.SkipDir
			}
			depth := strings.Count(relSlash, "/")
			if depth >= maxScanDepth {
				return filepath.SkipDir
			}
			return nil
		}
		depth := strings.Count(relSlash, "/")
		if depth >= maxScanDepth {
			return nil
		}
		name := de.Name()
		if isMarker(name) {
			dir := filepath.Dir(relSlash)
			if dir == "." {
				dir = ""
			}
			hits = append(hits, markerHit{Rel: relSlash, Dir: dir, Name: name})
		}
		return nil
	})
	if err != nil {
		return DetectionResult{}, err
	}

	sort.Slice(hits, func(i, j int) bool {
		return hits[i].Rel < hits[j].Rel
	})

	matched := make([]string, len(hits))
	byName := map[string][]markerHit{}
	for i, h := range hits {
		matched[i] = h.Rel
		byName[h.Name] = append(byName[h.Name], h)
	}

	out := DetectionResult{
		Runtime:          Unknown,
		Confidence:       "low",
		MatchedFiles:     matched,
		WorkingDirectory: "",
		Components:       buildComponents(hits),
	}

	// 1) Docker Compose (repo-level orchestration)
	var composeHit *markerHit
	for i := range hits {
		if composeNames[hits[i].Name] {
			h := hits[i]
			composeHit = &h
			break
		}
	}
	if composeHit != nil {
		out.Runtime = Compose
		out.Confidence = "high"
		out.WorkingDirectory = composeHit.Dir
		out.InstallCommand = "docker compose build"
		out.StartCommand = "docker compose up -d"
		out.Notes = "docker compose v2 assumed; use `docker-compose` on older hosts. Set deployment working_directory if compose file is nested."
		return out, nil
	}

	// 2) Dockerfile (shallowest wins)
	if ds := byName["Dockerfile"]; len(ds) > 0 {
		best := shallowest(ds)
		out.Runtime = Docker
		out.Confidence = "high"
		out.WorkingDirectory = best.Dir
		img := "skyport-app"
		out.InstallCommand = "docker build -t " + img + " ."
		out.StartCommand = "docker run --rm -p 3000:3000 " + img
		out.Notes = "Commands assume build context is the directory containing the Dockerfile; deployment uses working_directory as build context."
		return out, nil
	}

	// 3) Bun
	if bs := byName["bun.lockb"]; len(bs) > 0 {
		best := shallowest(bs)
		out.Runtime = Bun
		out.Confidence = "high"
		out.WorkingDirectory = parentDirOfFile(best.Dir)
		out.InstallCommand = "bun install"
		out.StartCommand = "bun run start"
		out.Notes = monorepoNote(byName["package.json"])
		return out, nil
	}

	// 4) Node — pick best package.json (server/api over client/web, then shallow)
	if js := byName["package.json"]; len(js) > 0 {
		best := pickNodePackageDir(js)
		out.Runtime = Node
		out.WorkingDirectory = best
		if len(js) > 1 {
			out.Confidence = "medium"
		} else {
			out.Confidence = "high"
		}
		out.InstallCommand = "npm install"
		out.BuildCommand = "npm run build"
		out.StartCommand = "npm run start"
		out.Notes = monorepoNote(js)
		return out, nil
	}

	if rs := byName["requirements.txt"]; len(rs) > 0 {
		best := shallowest(rs)
		out.Runtime = Python
		out.Confidence = "high"
		out.WorkingDirectory = best.Dir
		out.InstallCommand = "pip install -r requirements.txt"
		out.StartCommand = "python -m uvicorn main:app --host 0.0.0.0 --port 8000"
		return out, nil
	}
	if ps := byName["pyproject.toml"]; len(ps) > 0 {
		best := shallowest(ps)
		out.Runtime = Python
		out.Confidence = "high"
		out.WorkingDirectory = best.Dir
		out.InstallCommand = "pip install ."
		out.StartCommand = "python -m uvicorn main:app --host 0.0.0.0 --port 8000"
		return out, nil
	}
	if gs := byName["go.mod"]; len(gs) > 0 {
		best := shallowest(gs)
		out.Runtime = Go
		out.Confidence = "high"
		out.WorkingDirectory = best.Dir
		out.BuildCommand = "go build -o app ."
		out.StartCommand = "./app"
		return out, nil
	}
	if cs := byName["composer.json"]; len(cs) > 0 {
		best := shallowest(cs)
		out.Runtime = PHP
		out.WorkingDirectory = best.Dir
		out.Confidence = "high"
		out.InstallCommand = "composer install --no-dev"
		out.StartCommand = "php -S 0.0.0.0:8080 -t public"
		return out, nil
	}
	if ps := byName["pom.xml"]; len(ps) > 0 {
		best := shallowest(ps)
		out.Runtime = Java
		out.WorkingDirectory = best.Dir
		out.Confidence = "high"
		out.BuildCommand = "mvn -q package -DskipTests"
		out.StartCommand = "java -jar target/app.jar"
		return out, nil
	}
	if rs := byName["Cargo.toml"]; len(rs) > 0 {
		best := shallowest(rs)
		out.Runtime = Rust
		out.WorkingDirectory = best.Dir
		out.Confidence = "high"
		out.BuildCommand = "cargo build --release"
		out.StartCommand = "./target/release/app"
		return out, nil
	}

	if len(matched) > 0 {
		out.Notes = "markers found but no primary stack selected; check matched_files"
	} else {
		out.Notes = "no supported markers found under project root (scanned recursively, depth cap " + strconv.Itoa(maxScanDepth) + ")"
	}
	return out, nil
}

func isMarker(name string) bool {
	if composeNames[name] {
		return true
	}
	switch name {
	case "Dockerfile", "package.json", "bun.lockb", "requirements.txt", "pyproject.toml",
		"go.mod", "composer.json", "Cargo.toml", "pom.xml":
		return true
	default:
		return false
	}
}

func shallowest(xs []markerHit) markerHit {
	sort.Slice(xs, func(i, j int) bool {
		di := depthOf(xs[i].Dir)
		dj := depthOf(xs[j].Dir)
		if di != dj {
			return di < dj
		}
		return xs[i].Rel < xs[j].Rel
	})
	return xs[0]
}

func depthOf(dirPosix string) int {
	if dirPosix == "" || dirPosix == "." {
		return 0
	}
	return strings.Count(dirPosix, "/") + 1
}

func pickNodePackageDir(hits []markerHit) string {
	type scored struct {
		dir   string
		score int
		depth int
	}
	list := make([]scored, 0, len(hits))
	for _, h := range hits {
		dir := h.Dir
		list = append(list, scored{
			dir:   dir,
			score: scoreNodePath(dir),
			depth: depthOf(dir),
		})
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].score != list[j].score {
			return list[i].score > list[j].score
		}
		if list[i].depth != list[j].depth {
			return list[i].depth < list[j].depth
		}
		return list[i].dir < list[j].dir
	})
	return list[0].dir
}

func scoreNodePath(dir string) int {
	d := strings.ToLower(dir)
	switch {
	case strings.Contains(d, "server"), strings.Contains(d, "backend"), strings.Contains(d, "api"):
		return 100
	case strings.Contains(d, "client"), strings.Contains(d, "frontend"), strings.Contains(d, "web"):
		return 50
	default:
		return 10
	}
}

func parentDirOfFile(dirField string) string {
	// For bun.lockb, WorkingDirectory is dir containing lockfile (same as package sibling)
	return dirField
}

func monorepoNote(packages []markerHit) string {
	if len(packages) <= 1 {
		return ""
	}
	return "monorepo: multiple package.json found; working_directory picks a primary app. Override via deployment working_directory or explicit install/build/start commands."
}

func buildComponents(hits []markerHit) []Component {
	seen := map[string]bool{}
	var out []Component
	for _, h := range hits {
		switch h.Name {
		case "package.json":
			dir := h.Dir
			if seen[dir+"/node"] {
				continue
			}
			seen[dir+"/node"] = true
			out = append(out, Component{WorkingDirectory: dir, Kind: Node, Evidence: h.Rel})
		case "Dockerfile":
			if seen[h.Dir+"/dockerfile"] {
				continue
			}
			seen[h.Dir+"/dockerfile"] = true
			out = append(out, Component{WorkingDirectory: h.Dir, Kind: Docker, Evidence: h.Rel})
		default:
			if composeNames[h.Name] {
				key := "compose:" + h.Dir
				if seen[key] {
					continue
				}
				seen[key] = true
				out = append(out, Component{WorkingDirectory: h.Dir, Kind: Compose, Evidence: h.Rel})
			}
		}
	}
	return out
}
