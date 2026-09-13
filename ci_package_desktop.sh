#!/bin/bash

set -eo pipefail

export project_dir=$(pwd)
echo "=== Exported Variables ==="
echo "project_dir: $project_dir"

pnpm install --frozen-lockfile
pnpm model-version
pnpm package --to desktop -v

cd "${project_dir}/desktop-package"
pnpm run bump
cat ./package.json

pnpm run dist --linux --x64
pnpm run dist --windows --x64

# macOS targets are built only when signing material is present.
if [ -z "$DEV_ID_P12_BASE64" ]; then
  echo "DEV_ID_P12_BASE64 is not set - skipping the macOS distribution."
  exit 0
fi

keychain_path="${TMPDIR:-/tmp}/app-signing-$$.keychain-db"
certificate_path="${TMPDIR:-/tmp}/build_certificate-$$.p12"

# Runner is long-lived: restore the user keychain list on exit.
original_keychains=$(security list-keychains -d user | sed 's/^ *//; s/"//g')

cleanup_signing() {
  if [ -n "$original_keychains" ]; then
    echo "$original_keychains" | xargs security list-keychain -d user -s
  fi
  security delete-keychain "$keychain_path" 2>/dev/null || true
  rm -f "$certificate_path"
}
trap cleanup_signing EXIT

echo -n "$DEV_ID_P12_BASE64" | base64 --decode -o "$certificate_path"

security create-keychain -p "$KEYCHAIN_PASSWORD" "$keychain_path"
security set-keychain-settings -lut 21600 "$keychain_path"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$keychain_path"
security import "$certificate_path" -P "$DEV_ID_P12_PASSWORD" -A -t cert -f pkcs12 -k "$keychain_path"
security set-key-partition-list -S apple-tool:,apple: -k "$KEYCHAIN_PASSWORD" "$keychain_path"
echo "$original_keychains" | xargs security list-keychain -d user -s "$keychain_path"

pnpm run dist-signed --macos --x64 --arm64
