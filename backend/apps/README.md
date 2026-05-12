# Marketplace app manifests

This directory is reserved for filesystem-backed marketplace manifests.

Expected structure per app:
- `manifest.json`
- `docker-compose.yml`
- `env.example`
- `icon.json`
- `healthcheck.json`
- `install.sh`

The current build serves the marketplace catalog from the Go module so the UI can ship first. The file layout above is the target format for migrating the catalog to disk without changing the frontend contract.
