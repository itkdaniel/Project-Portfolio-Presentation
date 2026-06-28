#!/usr/bin/env bash
# =============================================================================
# tag-release.sh — Interactive release tagger for NexusConsult sub-apps
#
# Usage:
#   ./scripts/tag-release.sh
#
# What it does:
#   1. Prompts for the sub-app (or "platform" for the main app)
#   2. Reads the current version from pyproject.toml / package.json
#   3. Prompts for bump type (major | minor | patch)
#   4. Computes the next semver
#   5. Updates the version file
#   6. Commits the change, creates a signed tag, and pushes — triggering
#      the release.yml GitHub Actions workflow automatically
# =============================================================================

set -euo pipefail

# ── Colour helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; exit 1; }

# ── Available targets ──────────────────────────────────────────────────────────
declare -A TARGETS=(
    ["platform"]="."
    ["nexus-booking"]="apps/nexus-booking"
    ["nexus-tax"]="apps/nexus-tax"
    ["nexus-search"]="apps/nexus-search"
    ["nexus-ai"]="apps/nexus-ai"
    ["nexus-quantum"]="apps/nexus-quantum"
    ["nexus-crypto"]="apps/crypto-analytics"
    ["nexus-graph"]="nexus-graph"
    ["nexus-scraper"]="nexus-scraper"
)

# ── Select target ──────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}NexusConsult — Release Tagger${RESET}"
echo "─────────────────────────────"
echo ""
echo "Available targets:"
echo "  platform       — main NexusConsult web app (v1.x.x)"
for key in "${!TARGETS[@]}"; do
    [[ "$key" != "platform" ]] && echo "  $key"
done | sort
echo ""

read -rp "Target [platform]: " TARGET
TARGET="${TARGET:-platform}"

[[ -v TARGETS["$TARGET"] ]] || error "Unknown target: $TARGET"
APP_PATH="${TARGETS[$TARGET]}"

# ── Read current version ───────────────────────────────────────────────────────
if [[ "$TARGET" == "platform" ]]; then
    VERSION_FILE="package.json"
    CURRENT=$(node -p "require('./${VERSION_FILE}').version" 2>/dev/null) \
        || error "Could not read version from ${VERSION_FILE}"
else
    VERSION_FILE="${APP_PATH}/pyproject.toml"
    [[ -f "$VERSION_FILE" ]] || error "No pyproject.toml found at ${VERSION_FILE}"
    CURRENT=$(grep -m1 '^version' "$VERSION_FILE" | sed 's/version = "\(.*\)"/\1/')
fi

info "Current version: ${BOLD}${CURRENT}${RESET}"

# ── Parse semver ───────────────────────────────────────────────────────────────
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

echo ""
echo "Bump type:"
echo "  major  — breaking change  (${MAJOR}.${MINOR}.${PATCH} → $((MAJOR+1)).0.0)"
echo "  minor  — new feature      (${MAJOR}.${MINOR}.${PATCH} → ${MAJOR}.$((MINOR+1)).0)"
echo "  patch  — bug fix          (${MAJOR}.${MINOR}.${PATCH} → ${MAJOR}.${MINOR}.$((PATCH+1)))"
echo ""
read -rp "Bump type [patch]: " BUMP
BUMP="${BUMP:-patch}"

case "$BUMP" in
    major) NEXT="$((MAJOR+1)).0.0" ;;
    minor) NEXT="${MAJOR}.$((MINOR+1)).0" ;;
    patch) NEXT="${MAJOR}.${MINOR}.$((PATCH+1))" ;;
    *)     error "Invalid bump type: $BUMP (use major | minor | patch)" ;;
esac

info "Bumping ${CURRENT} → ${BOLD}${NEXT}${RESET}"

# ── Tag format ─────────────────────────────────────────────────────────────────
if [[ "$TARGET" == "platform" ]]; then
    TAG="v${NEXT}"
else
    TAG="${TARGET}/v${NEXT}"
fi

info "Tag will be: ${BOLD}${TAG}${RESET}"

# ── Confirm ────────────────────────────────────────────────────────────────────
echo ""
read -rp "Proceed? [y/N]: " CONFIRM
[[ "${CONFIRM,,}" == "y" ]] || { warn "Aborted."; exit 0; }

# ── Update version file ────────────────────────────────────────────────────────
if [[ "$TARGET" == "platform" ]]; then
    # Bump package.json
    node -e "
        const fs = require('fs');
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        pkg.version = '${NEXT}';
        fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    "
    success "Updated package.json → ${NEXT}"

    # Also bump root pyproject.toml to keep versions aligned
    if [[ -f "pyproject.toml" ]]; then
        sed -i "s/^version = \"${CURRENT}\"/version = \"${NEXT}\"/" "pyproject.toml"
        success "Updated pyproject.toml → ${NEXT}"
    fi
else
    # Replace version line in pyproject.toml
    sed -i "s/^version = \"${CURRENT}\"/version = \"${NEXT}\"/" "$VERSION_FILE"
    success "Updated ${VERSION_FILE} → ${NEXT}"
fi

# ── Update CHANGELOG ───────────────────────────────────────────────────────────
CHANGELOG_FILE="${APP_PATH}/CHANGELOG.md"
TODAY=$(date +%Y-%m-%d)

if [[ -f "$CHANGELOG_FILE" ]]; then
    # Insert versioned header under ## [Unreleased]
    sed -i "s/## \[Unreleased\]/## [Unreleased]\n\n---\n\n## [${NEXT}] — ${TODAY}/" "$CHANGELOG_FILE"
    success "Updated ${CHANGELOG_FILE} with [${NEXT}] section"
fi

# ── Git commit + tag + push ────────────────────────────────────────────────────
git add "${VERSION_FILE}"
[[ -f "$CHANGELOG_FILE" ]] && git add "$CHANGELOG_FILE"

git commit -m "chore(release): ${TARGET} v${NEXT}"
git tag -a "${TAG}" -m "Release ${TARGET} v${NEXT}"

info "Pushing commit and tag ${TAG} …"
git push origin HEAD
git push origin "${TAG}"

echo ""
success "Released ${BOLD}${TAG}${RESET}"
echo -e "  → GitHub Actions release workflow: ${CYAN}https://github.com/itkdaniel/nexusconsult/actions${RESET}"
echo -e "  → GHCR image will be tagged: ${CYAN}ghcr.io/itkdaniel/${TARGET}:v${NEXT}${RESET}"
echo ""
