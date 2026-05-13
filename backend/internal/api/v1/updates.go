package v1

import (
	"fmt"
	"github.com/gofiber/fiber/v2"

	"skyport/internal/app"
	"skyport/internal/response"
	"skyport/internal/updates"
)

func mountUpdates(a *app.App, r fiber.Router) {
	fmt.Println("Registering Updates routes under /api/v1/updates")
	r.Get("/updates/check", checkUpdates(a))
}

// checkUpdates checks for new releases on GitHub.
// @Summary Check for updates
// @Tags Updates
// @Description Checks if a newer version of SkyPort is available on GitHub
// @Produce json
// @Success 200 {object} updates.UpdateCheckResult
// @Router /api/v1/updates/check [get]
func checkUpdates(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		checker := updates.GetChecker(a)
		if checker == nil {
			return response.Internal(c, "Update checker not initialized")
		}

		result, err := checker.CheckForUpdates()
		if err != nil {
			return response.Internal(c, err.Error())
		}

		return response.OK(c, result)
	}
}
