package validator

import (
	"strings"
	"sync"

	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v2"

	"skyport/internal/response"
)

var (
	once sync.Once
	v    *validator.Validate
)

type FieldError struct {
	Field string `json:"field"`
	Tag   string `json:"tag"`
}

func engine() *validator.Validate {
	once.Do(func() {
		v = validator.New()
	})
	return v
}

func ParseAndValidate(c *fiber.Ctx, dst any) error {
	if err := c.BodyParser(dst); err != nil {
		return response.BadRequest(c, "invalid request body")
	}
	if err := engine().Struct(dst); err != nil {
		verrs, ok := err.(validator.ValidationErrors)
		if !ok {
			return response.BadRequest(c, "invalid request")
		}
		out := make([]FieldError, 0, len(verrs))
		for _, fe := range verrs {
			out = append(out, FieldError{
				Field: strings.ToLower(fe.Field()),
				Tag:   fe.Tag(),
			})
		}
		return response.ErrorWithDetails(c, fiber.StatusBadRequest, "validation_failed", "validation failed", out)
	}
	return nil
}
