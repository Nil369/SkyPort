// Package database opens SQLite via GORM and runs migrations.
//
// Architecture: database.Initialize is the only entry from bootstrap. It uses the
// pure-Go SQLite driver (glebarez) to keep builds as a single static binary without
// CGO—important for cross-compilation and constrained VPS images.
package database

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"skyport/internal/config"
	"skyport/internal/models"
)

// Initialize opens the DB file (creating parent dirs), configures GORM for low-RAM
// embedded use, and applies AutoMigrate for all registered models.
func Initialize(cfg *config.Config) (*gorm.DB, error) {
	if err := os.MkdirAll(filepath.Dir(cfg.DBPath), 0o755); err != nil {
		return nil, fmt.Errorf("create db directory: %w", err)
	}

	gormLog := logger.Warn
	switch cfg.LogLevel {
	case "debug":
		gormLog = logger.Info
	case "error":
		gormLog = logger.Error
	}

	db, err := gorm.Open(sqlite.Open(cfg.DBPath), &gorm.Config{
		Logger: logger.Default.LogMode(gormLog),
		// PrepareStmt caches prepared statements—slightly more RAM, fewer parse cycles.
		PrepareStmt: true,
	})
	if err != nil {
		return nil, fmt.Errorf("gorm open: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("sql db: %w", err)
	}
	// Tuned for small VPS: limit idle connections; SQLite is single-writer anyway.
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)

	if err := db.AutoMigrate(models.All()...); err != nil {
		return nil, fmt.Errorf("auto migrate: %w", err)
	}

	return db, nil
}

// Close releases the underlying *sql.DB. Call during graceful shutdown after HTTP stops.
func Close(db *gorm.DB) error {
	if db == nil {
		return nil
	}
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}
