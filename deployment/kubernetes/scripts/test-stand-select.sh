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
# Offline checks for the UI action's prepare routing and the stand whitelists: the Kubernetes
# branch calls the in-cluster prepare, the compose branch keeps the caller's script, and qms
# passes prepare-test-stand.sh and with-stand-env.sh. No cluster, Docker or stand is touched.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
action="$root/.github/actions/ui-test/action.yml"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

command -v ruby >/dev/null 2>&1 || { echo 'FAIL: ruby is required to read action.yml' >&2; exit 1; }
ruby -ryaml - "$action" <<'RUBY'
steps = YAML.load_file(ARGV[0]).dig('runs', 'steps')
def fail!(msg)
  abort("FAIL: #{msg}")
end

k8s = steps.find { |s| s['name'].to_s.start_with?('Prepare Kubernetes stand') }
fail!('no Kubernetes prepare step') if k8s.nil?
fail!('Kubernetes prepare is not guarded by inputs.stand != \'\'') unless k8s['if'].to_s.include?("inputs.stand != ''")
run = k8s['run'].to_s
unless run.include?('deployment/kubernetes/scripts/prepare-test-stand.sh "${{ inputs.stand }}" "${{ inputs.k8s-runtime }}"')
  fail!('Kubernetes prepare does not call prepare-test-stand.sh <stand> <runtime>')
end
fail!('Kubernetes prepare still calls the compose prepare script') if run.include?('inputs.prepare-script')
fail!('Kubernetes prepare still logs in to Docker Hub') if run.include?('docker login')
fail!('Kubernetes prepare still passes the Docker Hub token') if k8s['env'].to_s.include?('DOCKER_ACCESS_TOKEN')

compose = steps.find { |s| s['if'].to_s.include?("inputs.stand == ''") && s['run'].to_s.include?('inputs.prepare-script') }
fail!('no compose prepare step') if compose.nil?
fail!('compose prepare is not guarded by inputs.stand == \'\'') unless compose['if'].to_s.include?("inputs.stand == ''")

# A test stand ignores the saved config namespace, so the resolved one has to reach the later steps.
configure = steps.find { |s| s['name'].to_s.start_with?('Configure Kubernetes stand') }
fail!('no Kubernetes configure step') if configure.nil?
unless configure['run'].to_s.include?('STAND_NAMESPACE=$ns') && configure['run'].to_s.include?('GITHUB_ENV')
  fail!('configure does not publish the resolved namespace for the later steps')
end

fixtures = steps.find { |s| s['name'] == 'Generate sanity media fixtures' }
fail!('no media fixtures step') if fixtures.nil?
fail!('media fixtures are not limited to the sanity stand') unless fixtures['if'].to_s.include?("inputs.stand == 'sanity'")
writer = fixtures['run'].to_s
unless writer.include?('./make-media-fixtures.sh') && writer.include?('fake-video.mp4') &&
       writer.include?('fake-doc.docx') && writer.include?('exit 1')
  fail!('media fixtures step does not generate and then require both files')
end

front = steps.find { |s| s['name'] == 'Start test frontend' }
fail!('no test frontend start step') if front.nil?
fail!('test frontend is not limited to the ws stand') unless front['if'].to_s.include?("inputs.stand == 'ws'")
fail!('test frontend is not started from stand:test:front ws') unless front['run'].to_s.include?('pnpm -w stand:test:front ws')
wait = steps.find { |s| s['name'] == 'Wait for test frontend' }
fail!('no test frontend wait step') if wait.nil?
fail!('test frontend wait does not probe :8081') unless wait['run'].to_s.include?('localhost:8081')
stop = steps.find { |s| s['name'] == 'Stop test frontend' }
fail!('no test frontend stop step') if stop.nil?
fail!('test frontend stop does not run on failure') unless stop['if'].to_s.include?('always()')
names = steps.map { |s| s['name'].to_s }
order = [names.index('Start test frontend'), names.index('Wait for test frontend'),
         names.index('Run UI tests'), names.index('Stop test frontend'),
         names.index { |n| n.start_with?('Cleanup Kubernetes stand') }]
fail!("test frontend steps are out of order: #{order.inspect}") unless order == order.compact.sort
puts 'action.yml routing ok'
RUBY

# A fake repo lets the real scripts run past their whitelist and stop on the missing stand values.
fake="$tmp/repo/deployment/kubernetes"
mkdir -p "$fake" "$tmp/config"
cp -R "$root/deployment/kubernetes/scripts" "$fake/"
cp -R "$root/deployment/kubernetes/cluster" "$fake/"
prepare="$fake/scripts/prepare-test-stand.sh"
with_env="$fake/scripts/with-stand-env.sh"

run_script() { # <name> <script> <args...>
  local name="$1" script="$2"
  shift 2
  local rc=0
  env STAND_RUNTIME=existing KUBE_CONTEXT=isolated STAND_HTTPS_PORT=443 \
    NODE_EXTRA_CA_CERTS=/dev/null STAND_CONFIG_DIR="$tmp/config" \
    bash "$script" "$@" > "$tmp/$name.log" 2>&1 || rc=$?
  printf '%s\n' "$rc"
}

# sanity/ws/qms/api pass the whitelist and stop at the absent stands/<name>/values.yaml (exit 1).
for stand in sanity ws qms api; do
  rc="$(run_script "prepare-$stand" "$prepare" "$stand")"
  if [ "$rc" != 1 ] || ! grep -q 'values file not found' "$tmp/prepare-$stand.log"; then
    echo "FAIL: prepare-test-stand.sh $stand did not reach the stand values (exit $rc)" >&2
    cat "$tmp/prepare-$stand.log" >&2
    exit 1
  fi
done

rc="$(run_script prepare-bogus "$prepare" bogus)"
[ "$rc" = 2 ] || { echo "FAIL: unknown stand exited $rc, expected 2" >&2; exit 1; }
grep -q 'sanity|ws|qms|api' "$tmp/prepare-bogus.log" || { echo 'FAIL: prepare usage does not list qms' >&2; exit 1; }

rc="$(run_script env-qms "$with_env" qms true)"
[ "$rc" = 1 ] || { echo "FAIL: with-stand-env.sh qms exited $rc, expected to pass the whitelist" >&2; cat "$tmp/env-qms.log" >&2; exit 1; }
rc="$(run_script env-bogus "$with_env" bogus true)"
[ "$rc" = 2 ] || { echo "FAIL: with-stand-env.sh unknown stand exited $rc, expected 2" >&2; exit 1; }
grep -q 'sanity|ws|qms|api' "$tmp/env-bogus.log" || { echo 'FAIL: with-stand-env usage does not list qms' >&2; exit 1; }

# The QMS dump is restored from the qms stand dir (dev/test-base/src/stands.ts) into the tool pod;
# the QMS suite's stale Playwright state lives in qms-tests/sanity.
test -d "$root/qms-tests/sanity-ws-qms"
grep -q 'qms-tests/sanity-ws-qms" "$STAND_NS/stand-tool:/workspace/qms-tests/sanity-ws-qms"' "$prepare" || {
  echo 'FAIL: qms workspace dump is not copied into the tool pod' >&2; exit 1
}
grep -q 'rm -rf "$REPO_ROOT/qms-tests/sanity/.auth"' "$prepare" || {
  echo 'FAIL: qms Playwright storage state is not cleared' >&2; exit 1
}
grep -q 'tests/sanity-ws" "$STAND_NS/stand-tool:/workspace/tests/sanity-ws"' "$prepare" || {
  echo 'FAIL: sanity workspace dump copy is gone' >&2; exit 1
}

echo 'stand selection and whitelist checks passed'
