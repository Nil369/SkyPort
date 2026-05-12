package audit

import (
	"strings"

	"gorm.io/gorm"

	"skyport/internal/models"
)

// Log appends an operator-facing audit row (best-effort; ignores DB failures upstream).
func Log(db *gorm.DB, actorID *uint, subjectUserID uint, action, target, detail, ip string) {
	if db == nil {
		return
	}
	action = strings.TrimSpace(action)
	if action == "" {
		action = "unknown"
	}
	_ = db.Create(&models.UserActivityLog{
		ActorID: actorID,
		UserID:  subjectUserID,
		Action:  action,
		Target:  strings.TrimSpace(target),
		Detail:  strings.TrimSpace(detail),
		IP:      strings.TrimSpace(ip),
	}).Error
}
