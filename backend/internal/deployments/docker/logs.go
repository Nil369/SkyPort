package docker

import "log"

// Simple logging helpers for deployment engine. Real implementation should integrate
// with the module logHub so WS clients receive incremental logs.
func emitLog(projectID uint, line string) {
	log.Printf("[deploy:%d] %s", projectID, line)
}
