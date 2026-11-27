#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/dropdb" <<'STUB'
#!/usr/bin/env bash
case " $* " in *" $FAIL_DB "*) exit 8 ;; esac
STUB
chmod +x "$tmp/dropdb"
export PATH="$tmp:$PATH"
STAND_DATA=stand REGION_DBS=region
command="$(sed -n '/^  "dropdb -U /p' "$script_dir/prepare-test-stand.sh")"
for FAIL_DB in stand region; do
  export FAIL_DB
  if bash -c "$(eval "printf '%s' $command")"; then
    echo "dropdb failure for $FAIL_DB was ignored" >&2
    exit 1
  fi
done
FAIL_DB=none bash -c "$(eval "printf '%s' $command")"
echo 'database reset checks passed'
