package frontend

import "embed"

// Dist holds the production Vite build copied here by `make frontend-build`
// (frontend/dist → backend/internal/frontend/dist).
//
//go:embed all:dist/*
var Dist embed.FS
