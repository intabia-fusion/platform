#!/bin/bash
# Collect hashes from bundle.js files
# Usage: ./scripts/collect-bundle-hashes.sh [output-file]

OUTPUT_FILE="${1:-bundle-hashes.txt}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Collecting bundle.js hashes..."
echo "Output: $OUTPUT_FILE"
echo ""

cd "$REPO_ROOT"

# Create temp file
TEMP_FILE=$(mktemp)

echo "=== Bundle.js Hashes ===" > "$TEMP_FILE"
echo "Generated: $(date)" >> "$TEMP_FILE"
echo "" >> "$TEMP_FILE"

# Find all bundle.js files and calculate hashes
echo "Scanning for bundle.js files..."

if command -v md5sum > /dev/null 2>>1; then
    find . -name "bundle.js" ! -path "*/node_modules/*" -exec md5sum {} \; 2>/dev/null | sort >> "$TEMP_FILE"
else
    find . -name "bundle.js" ! -path "*/node_modules/*" -exec md5 -r {} \; 2>/dev/null | sort >> "$TEMP_FILE"
fi

# Count files
BUNDLE_COUNT=$(grep -c "bundle.js" "$TEMP_FILE" 2>/dev/null || echo "0")
echo "" >> "$TEMP_FILE"
echo "Total bundle.js files: $BUNDLE_COUNT" >> "$TEMP_FILE"

# Move to output
mv "$TEMP_FILE" "$OUTPUT_FILE"

echo "Done! Collected $BUNDLE_COUNT bundle.js hashes"
echo "Output: $OUTPUT_FILE"
