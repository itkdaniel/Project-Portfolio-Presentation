#!/usr/bin/env bash
# new_subapp.sh — scaffold a new NexusConsult sub-app from this template.
#
# Usage:
#   bash apps/_template/scripts/new_subapp.sh <name> <port>
#   bash apps/_template/scripts/new_subapp.sh crypto-escrow 8300
#
# Result:
#   apps/nexus-<name>/   ← ready-to-use FastAPI sub-app skeleton

set -euo pipefail

NAME="${1:?Usage: new_subapp.sh <name> <port>}"
PORT="${2:?Usage: new_subapp.sh <name> <port>}"
TARGET="apps/nexus-${NAME}"
TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "${TEMPLATE_DIR}/../.." && pwd)"

if [[ -d "${REPO_ROOT}/${TARGET}" ]]; then
  echo "ERROR: ${TARGET} already exists." >&2
  exit 1
fi

echo "Scaffolding ${TARGET} on port ${PORT}..."

# Copy template
cp -r "${TEMPLATE_DIR}" "${REPO_ROOT}/${TARGET}"

# Remove this scripts dir from the copy (it lives in _template only)
rm -rf "${REPO_ROOT}/${TARGET}/scripts"

# Substitute placeholders
SAFE_NAME="${NAME//-/_}"
find "${REPO_ROOT}/${TARGET}" -type f \( -name "*.py" -o -name "*.yml" -o -name "*.ini" -o -name "*.txt" -o -name "*.md" \) | while read -r file; do
  sed -i \
    -e "s/nexus-subapp/nexus-${NAME}/g" \
    -e "s/nexus_subapp/nexus_${SAFE_NAME}/g" \
    -e "s/nexussubapp/nexus${SAFE_NAME}/g" \
    -e "s/9000/${PORT}/g" \
    "${file}"
done

echo ""
echo "Done! Next steps:"
echo "  1. cd ${TARGET}"
echo "  2. Update app/config.py  — set app_name, database_url"
echo "  3. Add ORM models to app/models.py"
echo "  4. Implement routers in app/routers/"
echo "  5. Register routers in app/main.py"
echo "  6. Write Alembic migration in alembic/versions/"
echo "  7. Add entry in server/gateway.ts → buildRegistry()"
echo "  8. Add service to docker-compose.yml (root)"
echo "  9. Create .github/workflows/nexus-${NAME}-ci.yml"
