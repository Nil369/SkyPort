// Command server is the SkyPort API entrypoint: one binary, one Listen address.
//
// Flow: config.Load → bootstrap.Run → (signal) graceful shutdown.
//
// @title SkyPort API
// @version 0.0.1
// @description Lightweight self-hosted developer cloud platform API
// @contact.name Akash Halder
// @contact.url https://github.com/Nil369
// @license.name AGPL-3.0
// @license.url https://www.gnu.org/licenses/agpl-3.0.en.html
// @host localhost
// @BasePath /
// @schemes http
// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
// @description JWT access token — must include Bearer prefix exactly: Bearer eyJ...
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
