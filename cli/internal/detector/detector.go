package detector

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Runtime represents the runtime environment
type Runtime string

const (
	RuntimeNode   Runtime = "node"
	RuntimePython Runtime = "python"
	RuntimeGo     Runtime = "go"
	RuntimeRust   Runtime = "rust"
	RuntimePHP    Runtime = "php"
	RuntimeRuby   Runtime = "ruby"
	RuntimeJava   Runtime = "java"
	RuntimeDotNet Runtime = "dotnet"
)

// Framework represents the framework/platform
type Framework string

const (
	// Node.js frameworks
	FrameworkNext    Framework = "next.js"
	FrameworkExpress Framework = "express"
	FrameworkNestJS  Framework = "nestjs"
	FrameworkVite    Framework = "vite"
	FrameworkAstro   Framework = "astro"
	FrameworkNuxt    Framework = "nuxt"
	FrameworkSvelte  Framework = "svelte"
	FrameworkSolid   Framework = "solid.js"

	// Python frameworks
	FrameworkFastAPI Framework = "fastapi"
	FrameworkFlask   Framework = "flask"
	FrameworkDjango  Framework = "django"
	FrameworkFastly  Framework = "fastly"

	// Go frameworks
	FrameworkGin   Framework = "gin"
	FrameworkEcho  Framework = "echo"
	FrameworkFiber Framework = "fiber"

	// General
	FrameworkDocker Framework = "docker"
	FrameworkRaw    Framework = "raw"
)

// ProjectInfo contains detected project information
type ProjectInfo struct {
	Path            string            `json:"path"`
	Name            string            `json:"name"`
	Runtime         Runtime           `json:"runtime"`
	Frameworks      []Framework       `json:"frameworks"`
	HasDocker       bool              `json:"has_docker"`
	HasCompose      bool              `json:"has_compose"`
	StartCmd        string            `json:"start_cmd"`
	BuildCmd        string            `json:"build_cmd"`
	Port            int               `json:"port"`
	PkgManager      string            `json:"pkg_manager"`
	Description     string            `json:"description"`
	EnvironmentVars map[string]string `json:"environment_vars,omitempty"`
}

// Detector detects project information
type Detector struct {
	path string
}

// New creates a new detector for the given path
func New(path string) *Detector {
	if path == "" {
		path, _ = os.Getwd()
	}
	return &Detector{path: path}
}

// Detect performs project detection
func (d *Detector) Detect() (*ProjectInfo, error) {
	info := &ProjectInfo{
		Path:            d.path,
		Name:            filepath.Base(d.path),
		Frameworks:      []Framework{},
		EnvironmentVars: make(map[string]string),
	}

	// Check for Docker
	info.HasDocker = d.fileExists("Dockerfile")
	info.HasCompose = d.fileExists("docker-compose.yml") || d.fileExists("docker-compose.yaml")

	// Detect runtime
	if err := d.detectRuntime(info); err != nil {
		return nil, err
	}

	// Detect frameworks
	d.detectFrameworks(info)

	// Set defaults
	d.setDefaults(info)

	return info, nil
}

func (d *Detector) detectRuntime(info *ProjectInfo) error {
	// Node.js
	if d.fileExists("package.json") {
		info.Runtime = RuntimeNode
		d.detectNodeDetails(info)
		return nil
	}

	// Python
	if d.fileExists("requirements.txt") || d.fileExists("pyproject.toml") || d.fileExists("setup.py") || d.fileExists("Pipfile") {
		info.Runtime = RuntimePython
		d.detectPythonDetails(info)
		return nil
	}

	// Go
	if d.fileExists("go.mod") {
		info.Runtime = RuntimeGo
		d.detectGoDetails(info)
		return nil
	}

	// Rust
	if d.fileExists("Cargo.toml") {
		info.Runtime = RuntimeRust
		info.StartCmd = "cargo run"
		info.BuildCmd = "cargo build --release"
		return nil
	}

	// PHP
	if d.fileExists("composer.json") || d.fileExists("index.php") {
		info.Runtime = RuntimePHP
		info.StartCmd = "php -S localhost:8000"
		info.BuildCmd = "composer install"
		return nil
	}

	// Java
	if d.fileExists("pom.xml") || d.fileExists("build.gradle") || d.fileExists("build.gradle.kts") {
		info.Runtime = RuntimeJava
		return nil
	}

	// .NET
	if d.fileExists(".csproj") || d.fileExists(".fsproj") {
		info.Runtime = RuntimeDotNet
		return nil
	}

	// Docker fallback
	if info.HasDocker {
		info.Runtime = "container"
		info.StartCmd = "docker-compose up"
		return nil
	}

	return fmt.Errorf("could not detect runtime for %s", d.path)
}

func (d *Detector) detectNodeDetails(info *ProjectInfo) {
	// Detect package manager
	if d.fileExists("pnpm-lock.yaml") {
		info.PkgManager = "pnpm"
	} else if d.fileExists("yarn.lock") {
		info.PkgManager = "yarn"
	} else if d.fileExists("bun.lockb") {
		info.PkgManager = "bun"
	} else {
		info.PkgManager = "npm"
	}

	// Read package.json for details
	pkg := &struct {
		Name        string            `json:"name"`
		Scripts     map[string]string `json:"scripts"`
		Port        interface{}       `json:"port"`
		Description string            `json:"description"`
	}{}

	data, err := os.ReadFile(filepath.Join(d.path, "package.json"))
	if err == nil {
		json.Unmarshal(data, pkg)
		if pkg.Name != "" {
			info.Name = pkg.Name
		}
		if pkg.Description != "" {
			info.Description = pkg.Description
		}

		// Get start command
		if startCmd, ok := pkg.Scripts["dev"]; ok {
			info.StartCmd = startCmd
		} else if startCmd, ok := pkg.Scripts["start"]; ok {
			info.StartCmd = startCmd
		}

		// Get build command
		if buildCmd, ok := pkg.Scripts["build"]; ok {
			info.BuildCmd = buildCmd
		}

		// Get port
		if port, ok := pkg.Port.(float64); ok {
			info.Port = int(port)
		} else if port, ok := pkg.Port.(string); ok {
			fmt.Sscanf(port, "%d", &info.Port)
		}
	}

	if info.Port == 0 {
		info.Port = 3000 // Node.js default
	}

	if info.StartCmd == "" {
		info.StartCmd = "npm start"
	}
}

func (d *Detector) detectPythonDetails(info *ProjectInfo) {
	// Detect Python package manager
	if d.fileExists("requirements.txt") {
		info.PkgManager = "pip"
	} else if d.fileExists("Pipfile") {
		info.PkgManager = "pipenv"
	} else if d.fileExists("pyproject.toml") {
		info.PkgManager = "poetry"
	} else if d.fileExists("setup.py") {
		info.PkgManager = "setuptools"
	}

	info.StartCmd = "python main.py"
	info.BuildCmd = "pip install -r requirements.txt"
	info.Port = 8000
}

func (d *Detector) detectGoDetails(info *ProjectInfo) {
	info.PkgManager = "go"
	info.StartCmd = "go run main.go"
	info.BuildCmd = "go build -o app"
	info.Port = 8080
}

func (d *Detector) detectFrameworks(info *ProjectInfo) {
	if info.Runtime == RuntimeNode {
		d.detectNodeFrameworks(info)
	} else if info.Runtime == RuntimePython {
		d.detectPythonFrameworks(info)
	} else if info.Runtime == RuntimeGo {
		d.detectGoFrameworks(info)
	}
}

func (d *Detector) detectNodeFrameworks(info *ProjectInfo) {
	content, _ := d.readFile("package.json")

	frameworks := []struct {
		name Framework
		pkg  string
	}{
		{FrameworkNext, "next"},
		{FrameworkNuxt, "nuxt"},
		{FrameworkAstro, "astro"},
		{FrameworkSvelte, "svelte"},
		{FrameworkSolid, "solid-js"},
		{FrameworkVite, "vite"},
		{FrameworkExpress, "express"},
		{FrameworkNestJS, "nestjs"},
	}

	for _, fw := range frameworks {
		if strings.Contains(content, fmt.Sprintf(`"%s"`, fw.pkg)) {
			info.Frameworks = append(info.Frameworks, fw.name)
		}
	}
}

func (d *Detector) detectPythonFrameworks(info *ProjectInfo) {
	content, _ := d.readFile("requirements.txt")
	if content == "" {
		content, _ = d.readFile("pyproject.toml")
	}

	frameworks := []struct {
		name Framework
		pkg  string
	}{
		{FrameworkFastAPI, "fastapi"},
		{FrameworkFlask, "flask"},
		{FrameworkDjango, "django"},
	}

	for _, fw := range frameworks {
		if strings.Contains(content, fw.pkg) {
			info.Frameworks = append(info.Frameworks, fw.name)
		}
	}
}

func (d *Detector) detectGoFrameworks(info *ProjectInfo) {
	content, _ := d.readFile("go.mod")

	frameworks := []struct {
		name Framework
		pkg  string
	}{
		{FrameworkGin, "gin"},
		{FrameworkEcho, "echo"},
		{FrameworkFiber, "fiber"},
	}

	for _, fw := range frameworks {
		if strings.Contains(content, fw.pkg) {
			info.Frameworks = append(info.Frameworks, fw.name)
		}
	}
}

func (d *Detector) setDefaults(info *ProjectInfo) {
	if info.Port == 0 {
		switch info.Runtime {
		case RuntimeNode:
			info.Port = 3000
		case RuntimePython:
			info.Port = 8000
		case RuntimeGo:
			info.Port = 8080
		case RuntimePHP:
			info.Port = 8000
		default:
			info.Port = 8080
		}
	}

	if info.StartCmd == "" && info.Runtime != "container" {
		info.StartCmd = "npm start"
	}
}

func (d *Detector) fileExists(name string) bool {
	_, err := os.Stat(filepath.Join(d.path, name))
	return err == nil
}

func (d *Detector) readFile(name string) (string, error) {
	data, err := os.ReadFile(filepath.Join(d.path, name))
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// String returns a readable string representation
func (p *ProjectInfo) String() string {
	var frameworks string
	if len(p.Frameworks) > 0 {
		fws := make([]string, len(p.Frameworks))
		for i, fw := range p.Frameworks {
			fws[i] = string(fw)
		}
		frameworks = strings.Join(fws, ", ")
	} else {
		frameworks = "none detected"
	}

	return fmt.Sprintf(
		"Project: %s\nRuntime: %s\nFrameworks: %s\nStart: %s\nPort: %d",
		p.Name, p.Runtime, frameworks, p.StartCmd, p.Port,
	)
}
