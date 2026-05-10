// Command server is the SkyPort API entrypoint: one binary, one Listen address.
//
// Flow: config.Load → bootstrap.Run → (signal) graceful shutdown.
//
// @title SkyPort API
// @version 0.0.1
// @description Lightweight self-hosted developer cloud platform API
// @contact.name SkyPort Maintainers
// @contact.email support@skyport.example
// @license.name MIT
// @host localhost
// @BasePath /
// @schemes http
// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
// @description Provide the JWT token as: Bearer <token>
package main

import (
	"log"

	"skyport/internal/bootstrap"
	"skyport/internal/config"
	_ "skyport/internal/docs"
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
