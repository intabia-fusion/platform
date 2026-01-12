#!/bin/bash

outDir=$(pwd)/${2:-"diff"}
rm -rf "$outDir"

mkdir -p "$outDir"

# Split diffs into two-level directories: first two path segments become folders,
# the rest are flattened into a filename with underscores.
git diff --name-only "$1" | grep -v .json | grep -v .md | grep -v bitrix | grep -v board | grep -v Dockerfile | grep -v qms- | while IFS= read -r p || [ -n "$p" ]
do
    # skip empty entries
    [ -z "$p" ] && continue

    echo "Processing $p"

    # Split path into array parts
    IFS='/' read -ra parts <<< "$p"

    # Determine first two directory levels (use '_' placeholder when missing)
    dir1="${parts[0]:-_}"
    dir2="${parts[1]:-_}"

    # Build filename from remaining parts (join with '_'). If no remaining parts,
    # use the last element as the filename.
    if [ "${#parts[@]}" -gt 2 ]; then
        oldIFS="$IFS"
        IFS='_'
        filename="${parts[*]:2}"
        IFS="$oldIFS"
    else
        last_index=$(( ${#parts[@]} - 1 ))
        filename="${parts[$last_index]}"
    fi

    # sanitize filename (replace slashes with underscores just in case)
    filename="${filename//\//_}"

    dest_dir="$outDir/$dir1/$dir2"
    mkdir -p "$dest_dir"

    dest_file="$dest_dir/$filename.diff"
    git diff "$1" -- "$p" > "$dest_file"

    echo "Saved diff to $dest_file"
done
