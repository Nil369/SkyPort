package v1

import (
	"fmt"
	"github.com/gofiber/fiber/v2"
	"skyport/internal/app"
	"skyport/internal/response"
	"skyport/internal/vps"
)

func mountVPS(a *app.App, r fiber.Router) {
	fmt.Println("Registering VPS routes under /api/v1/vps")
	api := r.Group("/vps")

	api.Get("", listVPS(a))
	api.Post("", createVPS(a))
	api.Get("/:id", getVPS(a))
	api.Put("/:id", updateVPS(a))
	api.Delete("/:id", deleteVPS(a))
	api.Post("/:id/test", testConnection(a))
}

func listVPS(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		svc := vps.GetService(a)
		if svc == nil {
			return response.Internal(c, "VPS service not initialized")
		}

		offset := c.QueryInt("offset", 0)
		limit := c.QueryInt("limit", 20)

		vpsList, total, err := svc.ListVPS(offset, limit)
		if err != nil {
			return response.Internal(c, err.Error())
		}

		return response.OK(c, fiber.Map{
			"success": true,
			"data":    vpsList,
			"total":   total,
		})
	}
}

func createVPS(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		svc := vps.GetService(a)
		if svc == nil {
			return response.Internal(c, "VPS service not initialized")
		}

		req := &vps.CreateVPSRequest{}
		if err := c.BodyParser(req); err != nil {
			return response.BadRequest(c, "Invalid request body")
		}

		vpsResp, err := svc.CreateVPS(req)
		if err != nil {
			return response.BadRequest(c, err.Error())
		}

		return c.Status(fiber.StatusCreated).JSON(fiber.Map{
			"success": true,
			"data":    vpsResp,
		})
	}
}

func getVPS(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		svc := vps.GetService(a)
		if svc == nil {
			return response.Internal(c, "VPS service not initialized")
		}

		vpsID := c.Params("id")
		vpsResp, err := svc.GetVPS(vpsID)
		if err != nil {
			return response.Error(c, fiber.StatusNotFound, "not_found", "VPS not found")
		}

		return response.OK(c, vpsResp)
	}
}

func updateVPS(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		svc := vps.GetService(a)
		if svc == nil {
			return response.Internal(c, "VPS service not initialized")
		}

		vpsID := c.Params("id")
		req := &vps.UpdateVPSRequest{}
		if err := c.BodyParser(req); err != nil {
			return response.BadRequest(c, "Invalid request body")
		}

		vpsResp, err := svc.UpdateVPS(vpsID, req)
		if err != nil {
			return response.BadRequest(c, err.Error())
		}

		return response.OK(c, vpsResp)
	}
}

func deleteVPS(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		svc := vps.GetService(a)
		if svc == nil {
			return response.Internal(c, "VPS service not initialized")
		}

		vpsID := c.Params("id")
		if err := svc.DeleteVPS(vpsID); err != nil {
			return response.Internal(c, err.Error())
		}

		return response.OK(c, fiber.Map{
			"success": true,
			"message": "VPS deleted successfully",
		})
	}
}

func testConnection(a *app.App) fiber.Handler {
	return func(c *fiber.Ctx) error {
		svc := vps.GetService(a)
		if svc == nil {
			return response.Internal(c, "VPS service not initialized")
		}

		vpsID := c.Params("id")
		result, err := svc.TestSSHConnection(vpsID)
		if err != nil {
			return response.Internal(c, err.Error())
		}

		return response.OK(c, fiber.Map{
			"success": true,
			"data":    result,
		})
	}
}
