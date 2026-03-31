#!/bin/bash
# Compare two bundle hash files
# Usage: ./scripts/compare-bundles.sh file1 file2

FILE1="${1:-bundle-hashes-standard.txt}"
FILE2="${2:-bundle-hashes-fast.txt}"

if [ ! -f "$FILE1" ]; then
    echo "Error: File not found: $FILE1"
    exit 1
fi

if [ ! -f "$FILE2" ]; then
    echo "Error: File not found: $FILE2"
    exit 1
fi

echo "=== Bundle.js Comparison ==="
echo ""
echo "File 1: $FILE1 ($(grep -c "bundle.js" "$FILE1" 2>/dev/null || echo "0") files)"
echo "File 2: $FILE2 ($(grep -c "bundle.js" "$FILE2" 2>/dev/null || echo "0") files)"
echo ""

# Extract just the filename and hash
grep "bundle.js" "$FILE1" | awk '{print $1, $2}' | sort -k2 > /tmp/bundle1.txt
grep "bundle.js" "$FILE2" | awk '{print $1, $2}' | sort -k2 > /tmp/bundle2.txt

echo "=== Files only in File 1 ==="
comm -23 <(cut -d' ' -f2 /tmp/bundle1.txt | sort) <(cut -d' ' -f2 /tmp/bundle2.txt | sort) | while read -r file; do
    grep "$file" /tmp/bundle1.txt
done

echo ""
echo "=== Files only in File 2 ==="
comm -13 <(cut -d' ' -f2 /tmp/bundle1.txt | sort) <(cut -d' ' -f2 /tmp/bundle2.txt | sort) | while read -r file; do
    grep "$file" /tmp/bundle2.txt
done

echo ""
echo "=== Files with different hashes ==="
comm -12 <(cut -d' ' -f2 /tmp/bundle1.txt | sort) <(cut -d' ' -f2 /tmp/bundle2.txt | sort) | while read -r file; do
    hash1=$(grep "$file" /tmp/bundle1.txt | cut -d' ' -f1)
    hash2=$(grep "$file" /tmp/bundle2.txt | cut -d' ' -f1)
    if [ "$hash1" != "$hash2" ]; then
        echo "DIFF: $file"
        echo "  File1: $hash1"
        echo "  File2: $hash2"
    fi
done

echo ""
echo "=== Summary ==="
echo "Only in File 1: $(comm -23 <(cut -d' ' -f2 /tmp/bundle1.txt | sort) <(cut -d' ' -f2 /tmp/bundle2.txt | sort) | wc -l)"
echo "Only in File 2: $(comm -13 <(cut -d' ' -f2 /tmp/bundle1.txt | sort) <(cut -d' ' -f2 /tmp/bundle2.txt | sort) | wc -l)"

# Count different hashes
DIFF_COUNT=0
comm -12 <(cut -d' ' -f2 /tmp/bundle1.txt | sort) <(cut -d' ' -f2 /tmp/bundle2.txt | sort) | while read -r file; do
    hash1=$(grep "$file" /tmp/bundle1.txt | cut -d' ' -f1)
    hash2=$(grep "$file" /tmp/bundle2.txt | cut -d' ' -f1)
    if [ "$hash1" != "$hash2" ]; then
        ((DIFF_COUNT++))
    fi
done
echo "Different hashes: $DIFF_COUNT"

rm -f /tmp/bundle1.txt /tmp/bundle2.txt
