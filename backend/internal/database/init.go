package database

import (
	"fmt"
	"os"

	"skyport/internal/vps"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// InitDB initializes the database connection and runs migrations
func InitDB() (*gorm.DB, error) {
	dbPath := os.Getenv("SKYPORT_DB_PATH")
	if dbPath == "" {
		dbPath = "./data/skyport.db"
	}

	// Create data directory if it doesn't exist
	if err := os.MkdirAll("./data", 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}

	// Open database
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	// Run migrations
	if err := runMigrations(db); err != nil {
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	return db, nil
}

// runMigrations runs all database migrations
func runMigrations(db *gorm.DB) error {
	// Auto-migrate VPS and SSH session models
	if err := db.AutoMigrate(
		&vps.VPSServer{},
		&vps.SSHSession{},
	); err != nil {
		return fmt.Errorf("failed to auto-migrate: %w", err)
	}

	// Create indexes
	if err := createIndexes(db); err != nil {
		return fmt.Errorf("failed to create indexes: %w", err)
	}

	return nil
}

// createIndexes creates database indexes for optimal performance
func createIndexes(db *gorm.DB) error {
	// VPS indexes
	if !db.Migrator().HasIndex(&vps.VPSServer{}, "ip_address") {
		db.Migrator().CreateIndex(&vps.VPSServer{}, "ip_address")
	}

	if !db.Migrator().HasIndex(&vps.VPSServer{}, "server_name") {
		db.Migrator().CreateIndex(&vps.VPSServer{}, "server_name")
	}

	if !db.Migrator().HasIndex(&vps.VPSServer{}, "key_fingerprint") {
		db.Migrator().CreateIndex(&vps.VPSServer{}, "key_fingerprint")
	}

	// SSH Session indexes
	if !db.Migrator().HasIndex(&vps.SSHSession{}, "vps_server_id") {
		db.Migrator().CreateIndex(&vps.SSHSession{}, "vps_server_id")
	}

	if !db.Migrator().HasIndex(&vps.SSHSession{}, "session_token") {
		db.Migrator().CreateIndex(&vps.SSHSession{}, "session_token")
	}

	if !db.Migrator().HasIndex(&vps.SSHSession{}, "user_id") {
		db.Migrator().CreateIndex(&vps.SSHSession{}, "user_id")
	}

	return nil
}

// SeedDatabase seeds initial data (optional)
func SeedDatabase(db *gorm.DB) error {
	// This is optional - add seed data if needed
	return nil
}
