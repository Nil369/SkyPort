// Command server is the SkyPort API entrypoint: one binary, one Listen address.
//
// Flow: config.Load → bootstrap.Run → (signal) graceful shutdown.
package main

import (
	"log"

	"skyport/internal/bootstrap"
	"skyport/internal/config"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	if err := bootstrap.Run(cfg); err != nil {
		log.Fatalf("run: %v", err)
	}
}
