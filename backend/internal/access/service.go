package access

import (
	"errors"
	"strings"

	"gorm.io/gorm"

	"skyport/internal/models"
)

// Service resolves RBAC assignments stored in SQLite / future PostgreSQL.
type Service struct {
	db *gorm.DB
}

// NewService constructs an RBAC helper bound to the application DB handle.
func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

// PermissionsForUser returns distinct permission keys granted via roles.
func (s *Service) PermissionsForUser(userID uint) ([]string, error) {
	var keys []string
	err := s.db.Model(&models.Permission{}).
		Joins("JOIN role_permissions ON role_permissions.permission_id = permissions.id").
		Joins("JOIN user_roles ON user_roles.role_id = role_permissions.role_id").
		Where("user_roles.user_id = ?", userID).
		Distinct().
		Order("permissions.key").
		Pluck("permissions.key", &keys).Error
	return keys, err
}

// RoleNamesForUser returns assigned role names.
func (s *Service) RoleNamesForUser(userID uint) ([]string, error) {
	var names []string
	err := s.db.Model(&models.Role{}).
		Joins("JOIN user_roles ON user_roles.role_id = roles.id").
		Where("user_roles.user_id = ?", userID).
		Distinct().
		Order("roles.name").
		Pluck("roles.name", &names).Error
	return names, err
}

// UserHasPermission reports whether the user holds a permission key.
func (s *Service) UserHasPermission(userID uint, key string) (bool, error) {
	if userID == 0 || strings.TrimSpace(key) == "" {
		return false, nil
	}
	var n int64
	err := s.db.Model(&models.Permission{}).
		Joins("JOIN role_permissions ON role_permissions.permission_id = permissions.id").
		Joins("JOIN user_roles ON user_roles.role_id = role_permissions.role_id").
		Where("user_roles.user_id = ? AND permissions.key = ?", userID, key).
		Count(&n).Error
	return n > 0, err
}

// UserHasAllPermissions requires every listed permission (AND).
func (s *Service) UserHasAllPermissions(userID uint, keys ...string) (bool, error) {
	for _, k := range keys {
		ok, err := s.UserHasPermission(userID, k)
		if err != nil || !ok {
			return false, err
		}
	}
	return true, nil
}

// AssignRoleByName replaces all roles for a user with a single named role (bootstrap / admin tooling).
func (s *Service) AssignRoleByName(tx *gorm.DB, userID uint, roleName string) error {
	db := tx
	if db == nil {
		db = s.db
	}
	var role models.Role
	if err := db.Where("name = ?", roleName).First(&role).Error; err != nil {
		return err
	}
	return db.Transaction(func(inner *gorm.DB) error {
		if err := inner.Where("user_id = ?", userID).Delete(&models.UserRole{}).Error; err != nil {
			return err
		}
		return inner.Create(&models.UserRole{UserID: userID, RoleID: role.ID}).Error
	})
}

// AssignPrimaryRole sets one role by name without wrapping in an outer transaction (caller supplies tx).
func (s *Service) AssignPrimaryRole(userID uint, roleName string) error {
	return s.AssignRoleByName(nil, userID, roleName)
}

// ErrUnknownRole indicates the named role was not seeded.
var ErrUnknownRole = errors.New("unknown role")
