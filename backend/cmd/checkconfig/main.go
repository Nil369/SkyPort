package main

import (
	"fmt"

	"skyport/internal/config"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Printf("config load error: %v\n", err)
		return
	}
	fmt.Printf("GitHubAppID: %q\n", cfg.GitHubAppID)
	if cfg.GitHubPrivateKey != "" || cfg.GitHubAppPrivateKey != "" {
		k := cfg.GitHubPrivateKey
		if k == "" {
			k = cfg.GitHubAppPrivateKey
		}
		prefix := k
		if len(prefix) > 40 {
			prefix = prefix[:40]
		}
		fmt.Printf("HasPrivateKey: true, prefix=%q\n", prefix)
	} else {
		fmt.Println("HasPrivateKey: false")
	}
}
