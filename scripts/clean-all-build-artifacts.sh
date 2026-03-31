#!/bin/bash
# Clean all build artifacts except node_modules and common/temp
# Usage: ./scripts/clean-all-build-artifacts.sh

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== Cleaning all build artifacts ==="
echo "Repository: $REPO_ROOT"
echo ""

# Clean lib directories
echo "[1/6] Removing lib directories..."
find . -type d -name "lib" ! -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null || true

# Clean dist directories  
echo "[2/6] Removing dist directories..."
find . -type d -name "dist" ! -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null || true

# Clean bundle directories
echo "[3/6] Removing bundle directories..."
find . -type d -name "bundle" ! -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null || true

# Clean deploy directories
echo "[4/6] Removing deploy directories..."
find . -type d -name "deploy" ! -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null || true



# Clean types directories (only output directories with .d.ts files, not source packages)
echo "[5/6] Removing types directories..."
find . -type d -name "types" ! -path "*/node_modules/*" | while read -r dir; do
  # Check if directory contains .d.ts files (TypeScript declarations) - it's an output directory
  # If it contains .ts files - it's a source package, don't delete
  if find "$dir" -name "*.d.ts" -maxdepth 1 2>/dev/null | grep -q .; then
    rm -rf "$dir"
  fi
done

# Clean cache files only (preserve .rush/temp for rush)
echo "[6/6] Removing cache files..."
find . -name "*.tsbuildinfo" ! -path "*/node_modules/*" -delete 2>/dev/null || true
find . -name ".fast-build-cache.json" ! -path "*/node_modules/*" -delete 2>/dev/null || true

echo ""
echo "=== Clean complete ==="
echo "All build artifacts removed (node_modules and common/temp preserved)"
