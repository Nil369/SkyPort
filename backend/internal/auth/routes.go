package auth

import (
	"github.com/gofiber/fiber/v2"

	"skyport/internal/app"
)

func Mount(a *app.App, r fiber.Router) {
	svc := NewService(a.DB, a.Config)
	authGroup := r.Group("/auth")
	authGroup.Get("/setup", setupHandler(a))
	authGroup.Post("/register", registerHandler(svc))
	authGroup.Post("/login", loginHandler(svc))
	authGroup.Post("/logout", RequireJWT(a.Config.JWTSecret), logoutHandler(svc))
	authGroup.Get("/me", RequireJWT(a.Config.JWTSecret), meHandler(svc))
	authGroup.Get("/credentials", RequireJWT(a.Config.JWTSecret), credentialsHandler(svc))
	authGroup.Post("/credentials", RequireJWT(a.Config.JWTSecret), updateCredentialsHandler(svc))
}
