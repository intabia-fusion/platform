#!/usr/bin/env bash
#
# Copyright © 2026 Intabia Fusion.
#
# Licensed under the Eclipse Public License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License. You may
# obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#
# See the License for the specific language governing permissions and
# limitations under the License.
#
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/repo/deployment/kubernetes/scripts" "$tmp/repo/deployment/kubernetes/cluster" "$tmp/bin" "$tmp/ca"
cp "$root"/deployment/kubernetes/scripts/*.sh "$tmp/repo/deployment/kubernetes/scripts/"
cp "$root/deployment/kubernetes/cluster/versions.env" "$tmp/repo/deployment/kubernetes/cluster/"
cp -R "$root/deployment/kubernetes/stands" "$tmp/repo/deployment/kubernetes/"
cat > "$tmp/bin/kubectl" <<'MOCK'
#!/bin/sh
exit 1
MOCK
cat > "$tmp/bin/k3d" <<'MOCK'
#!/bin/sh
echo NAME
MOCK
cat > "$tmp/repo/deployment/kubernetes/scripts/prepare-test-stand.sh" <<'MOCK'
#!/bin/sh
mkcert -cert-file "$TEST_DIR/server.crt" -key-file "$TEST_DIR/server.key" localhost >/dev/null 2>&1
MOCK
cat > "$tmp/probe.js" <<'JS'
const { spawnSync } = require('child_process')
const fs = require('fs')
const https = require('https')
const path = require('path')
const cert = path.join(process.env.TEST_DIR, 'server.crt')
const key = path.join(process.env.TEST_DIR, 'server.key')
if (!fs.existsSync(cert)) {
  const result = spawnSync('mkcert', ['-cert-file', cert, '-key-file', key, 'localhost'])
  if (result.status !== 0) throw new Error(result.stderr.toString())
}
const server = https.createServer({ cert: fs.readFileSync(cert), key: fs.readFileSync(key) }, (_req, res) => res.end('{}'))
server.listen(0, '127.0.0.1', async () => {
  try {
    const response = await fetch('https://localhost:' + server.address().port + '/config.json')
    if (!response.ok) throw new Error('HTTP ' + response.status)
    console.log('HTTPS config request succeeded')
  } catch (err) {
    console.error(err.cause?.code ?? err.message)
    process.exitCode = 1
  } finally {
    server.close()
  }
})
JS
chmod +x "$tmp/bin/kubectl" "$tmp/bin/k3d" "$tmp/repo/deployment/kubernetes/scripts/prepare-test-stand.sh"
export PATH="$tmp/bin:$PATH" TEST_DIR="$tmp" CAROOT="$tmp/ca"
export STAND_CONFIG_DIR="$tmp/config" STAND_HTTPS_PORT=443 STAND_RUNTIME=k3d
unset NODE_EXTRA_CA_CERTS API_STAND
STAND_DB_FORWARD=0 STAND_KAFKA_FORWARD=0 STAND_PREPARE_API=1 \
  bash "$tmp/repo/deployment/kubernetes/scripts/with-stand-env.sh" api node "$tmp/probe.js"
