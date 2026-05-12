package access

import (
	"fmt"

	"gorm.io/gorm"

	"skyport/internal/models"
)

type permissionSeed struct {
	Key         string
	Description string
}

type roleSeed struct {
	Name        string
	DisplayName string
	Permissions []string
}

// Bootstrap seeds RBAC catalog data and assigns legacy users without roles.
func Bootstrap(db *gorm.DB) error {
	if db == nil {
		return fmt.Errorf("nil db")
	}

	perms := []permissionSeed{
		{PermDeploymentsCreate, "Create deployments"},
		{PermDeploymentsDelete, "Delete deployments"},
		{PermDeploymentsRestart, "Restart or rollout deployments"},
		{PermDockerManage, "Manage Docker engine and containers"},
		{PermTerminalAccess, "Use interactive terminal websocket"},
		{PermMetricsView, "View host metrics REST and websocket stream"},
		{PermFilesystemRead, "Browse and read workspace files"},
		{PermFilesystemWrite, "Write or upload workspace files"},
		{PermUsersManage, "Invite and manage users"},
		{PermSettingsManage, "Change platform settings"},
		{PermMarketplaceInstall, "Install marketplace applications"},
		{PermServersManage, "Manage cluster servers and agents"},
	}

	for _, p := range perms {
		var existing models.Permission
		err := db.Where("key = ?", p.Key).First(&existing).Error
		if err == gorm.ErrRecordNotFound {
			if err := db.Create(&models.Permission{Key: p.Key, Description: p.Description}).Error; err != nil {
				return err
			}
			continue
		}
		if err != nil {
			return err
		}
	}

	allPermKeys := make([]string, 0, len(perms))
	for _, p := range perms {
		allPermKeys = append(allPermKeys, p.Key)
	}

	readLike := []string{
		PermFilesystemRead,
		PermMetricsView,
	}

	devPerms := []string{
		PermDeploymentsCreate,
		PermDeploymentsDelete,
		PermDeploymentsRestart,
		PermDockerManage,
		PermTerminalAccess,
		PermFilesystemRead,
		PermFilesystemWrite,
		PermMetricsView,
		PermMarketplaceInstall,
	}

	roles := []roleSeed{
		{RoleOwner, "Owner", allPermKeys},
		{RoleAdmin, "Administrator", allPermKeys},
		{RoleDeveloper, "Developer", devPerms},
		{RoleViewer, "Viewer", readLike},
	}

	roleIDs := map[string]uint{}
	for _, rs := range roles {
		var role models.Role
		err := db.Where("name = ?", rs.Name).First(&role).Error
		if err == gorm.ErrRecordNotFound {
			role = models.Role{Name: rs.Name, DisplayName: rs.DisplayName}
			if err := db.Create(&role).Error; err != nil {
				return err
			}
		} else if err != nil {
			return err
		}
		roleIDs[rs.Name] = role.ID

		var permModels []models.Permission
		if err := db.Where("key IN ?", rs.Permissions).Find(&permModels).Error; err != nil {
			return err
		}
		for _, pm := range permModels {
			var n int64
			db.Model(&models.RolePermission{}).
				Where("role_id = ? AND permission_id = ?", role.ID, pm.ID).
				Count(&n)
			if n == 0 {
				if err := db.Create(&models.RolePermission{RoleID: role.ID, PermissionID: pm.ID}).Error; err != nil {
					return err
				}
			}
		}
	}

	// Legacy users without roles: first account becomes owner, everyone else developer.
	var orphanCount int64
	if err := db.Raw(`
SELECT COUNT(*) FROM users u
WHERE u.deleted_at IS NULL
AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id)`).Scan(&orphanCount).Error; err != nil {
		return err
	}
	if orphanCount == 0 {
		return nil
	}

	var users []models.User
	if err := db.Order("id ASC").Find(&users).Error; err != nil {
		return err
	}
	for i, u := range users {
		var n int64
		db.Model(&models.UserRole{}).Where("user_id = ?", u.ID).Count(&n)
		if n > 0 {
			continue
		}
		role := RoleDeveloper
		if i == 0 {
			role = RoleOwner
		}
		rid, ok := roleIDs[role]
		if !ok {
			return ErrUnknownRole
		}
		if err := db.Create(&models.UserRole{UserID: u.ID, RoleID: rid}).Error; err != nil {
			return err
		}
	}

	return nil
}
