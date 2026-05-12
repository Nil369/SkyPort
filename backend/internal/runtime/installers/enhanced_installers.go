package installers

import (
	"os/exec"
	"runtime"
)

// detectPackageManager returns the appropriate package manager for the current system.
// On Linux, detects apt, yum, pacman, apk; on macOS returns brew; on Windows detects available manager.
func detectPackageManager() string {
	switch runtime.GOOS {
	case "darwin":
		return "brew"
	case "linux":
		// Check which package manager is available
		if _, err := exec.LookPath("apt-get"); err == nil {
			return "apt"
		}
		if _, err := exec.LookPath("yum"); err == nil {
			return "yum"
		}
		if _, err := exec.LookPath("pacman"); err == nil {
			return "pacman"
		}
		if _, err := exec.LookPath("apk"); err == nil {
			return "apk"
		}
		// Default to apt if nothing found
		return "apt"
	case "windows":
		// Check which Windows package manager is available
		if _, err := exec.LookPath("winget"); err == nil {
			return "winget"
		}
		if _, err := exec.LookPath("choco"); err == nil {
			return "choco"
		}
		if _, err := exec.LookPath("scoop"); err == nil {
			return "scoop"
		}
		return "winget"
	default:
		return ""
	}
}

func getInstallCommands(rt string) []string {
	switch runtime.GOOS {
	case "darwin":
		return macosInstallCommands(rt)
	case "linux":
		return linuxInstallCommands(rt)
	case "windows":
		return windowsInstallCommands(rt)
	default:
		return nil
	}
}

func linuxInstallCommands(rt string) []string {
	pm := detectPackageManager()
	
	switch pm {
	case "apt":
		return aptInstallCommands(rt)
	case "yum":
		return yumInstallCommands(rt)
	case "pacman":
		return pacmanInstallCommands(rt)
	case "apk":
		return apkInstallCommands(rt)
	default:
		return aptInstallCommands(rt) // fallback
	}
}

func aptInstallCommands(rt string) []string {
	cmds := map[string]string{
		"node":   "apt-get update && apt-get install -y --no-install-recommends nodejs npm",
		"bun":    "curl -fsSL https://bun.sh/install | bash",
		"deno":   "curl -fsSL https://deno.land/install.sh | sh",
		"python": "apt-get update && apt-get install -y --no-install-recommends python3 python3-pip",
		"go":     "apt-get update && apt-get install -y --no-install-recommends golang-go",
		"php":    "apt-get update && apt-get install -y --no-install-recommends php php-cli",
		"java":   "apt-get update && apt-get install -y --no-install-recommends default-jre default-jdk",
		"pm2":    "npm install -g pm2",
	}
	if cmd, ok := cmds[rt]; ok {
		return []string{cmd}
	}
	return nil
}

func yumInstallCommands(rt string) []string {
	cmds := map[string]string{
		"node":   "yum update -y && yum install -y nodejs npm",
		"bun":    "curl -fsSL https://bun.sh/install | bash",
		"deno":   "curl -fsSL https://deno.land/install.sh | sh",
		"python": "yum update -y && yum install -y python3 python3-pip",
		"go":     "yum update -y && yum install -y golang",
		"php":    "yum update -y && yum install -y php php-cli",
		"java":   "yum update -y && yum install -y java-11-openjdk java-11-openjdk-devel",
		"pm2":    "npm install -g pm2",
	}
	if cmd, ok := cmds[rt]; ok {
		return []string{cmd}
	}
	return nil
}

func pacmanInstallCommands(rt string) []string {
	cmds := map[string]string{
		"node":   "pacman -Sy --noconfirm nodejs npm",
		"bun":    "curl -fsSL https://bun.sh/install | bash",
		"deno":   "curl -fsSL https://deno.land/install.sh | sh",
		"python": "pacman -Sy --noconfirm python python-pip",
		"go":     "pacman -Sy --noconfirm go",
		"php":    "pacman -Sy --noconfirm php",
		"java":   "pacman -Sy --noconfirm jdk-openjdk",
		"pm2":    "npm install -g pm2",
	}
	if cmd, ok := cmds[rt]; ok {
		return []string{cmd}
	}
	return nil
}

func apkInstallCommands(rt string) []string {
	cmds := map[string]string{
		"node":   "apk add --no-cache nodejs npm",
		"bun":    "curl -fsSL https://bun.sh/install | bash",
		"deno":   "curl -fsSL https://deno.land/install.sh | sh",
		"python": "apk add --no-cache python3 py3-pip",
		"go":     "apk add --no-cache go",
		"php":    "apk add --no-cache php php-cli",
		"java":   "apk add --no-cache openjdk11",
		"pm2":    "npm install -g pm2",
	}
	if cmd, ok := cmds[rt]; ok {
		return []string{cmd}
	}
	return nil
}

func macosInstallCommands(rt string) []string {
	cmds := map[string]string{
		"node":   "brew install node",
		"bun":    "brew install bun",
		"deno":   "brew install deno",
		"python": "brew install python@3.11",
		"go":     "brew install go",
		"php":    "brew install php",
		"java":   "brew install openjdk@21",
		"pm2":    "npm install -g pm2",
	}
	if cmd, ok := cmds[rt]; ok {
		return []string{cmd}
	}
	return nil
}

func windowsInstallCommands(rt string) []string {
	pm := detectPackageManager()
	
	switch pm {
	case "winget":
		return wingetInstallCommands(rt)
	case "choco":
		return chocoInstallCommands(rt)
	case "scoop":
		return scoopInstallCommands(rt)
	default:
		return nil
	}
}

func wingetInstallCommands(rt string) []string {
	cmds := map[string]string{
		"node":   "winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements",
		"bun":    "winget install -e --id Oven.Bun --accept-source-agreements --accept-package-agreements",
		"deno":   "winget install -e --id DenoLand.Deno --accept-source-agreements --accept-package-agreements",
		"python": "winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements",
		"go":     "winget install -e --id GoLang.Go --accept-source-agreements --accept-package-agreements",
		"php":    "winget install -e --id PHP.PHP --accept-source-agreements --accept-package-agreements",
		"java":   "winget install -e --id EclipseAdoptium.Temurin.21.JDK --accept-source-agreements --accept-package-agreements",
		"pm2":    "npm install -g pm2",
	}
	if cmd, ok := cmds[rt]; ok {
		return []string{cmd}
	}
	return nil
}

func chocoInstallCommands(rt string) []string {
	cmds := map[string]string{
		"node":   "choco install -y nodejs",
		"bun":    "choco install -y bun",
		"deno":   "choco install -y deno",
		"python": "choco install -y python",
		"go":     "choco install -y golang",
		"php":    "choco install -y php",
		"java":   "choco install -y openjdk21",
		"pm2":    "npm install -g pm2",
	}
	if cmd, ok := cmds[rt]; ok {
		return []string{cmd}
	}
	return nil
}

func scoopInstallCommands(rt string) []string {
	cmds := map[string]string{
		"node":   "scoop install nodejs",
		"bun":    "scoop install bun",
		"deno":   "scoop install deno",
		"python": "scoop install python",
		"go":     "scoop install go",
		"php":    "scoop install php",
		"java":   "scoop install openjdk21",
		"pm2":    "npm install -g pm2",
	}
	if cmd, ok := cmds[rt]; ok {
		return []string{cmd}
	}
	return nil
}
