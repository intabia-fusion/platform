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
# Memory budget of the local stands: actual working set (cadvisor via the kubelet proxy, no
# metrics-server) and the requests/limits the scheduler sees. Set STAND_MEMORY_BUDGET to the
# Docker VM size (e.g. 12Gi) to get a fit/no-fit verdict and the minimum size to run the stands.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

BUDGET="${STAND_MEMORY_BUDGET:-12Gi}"
NODE="$(kc get nodes -o jsonpath='{.items[0].metadata.name}')"
ALLOCATABLE="$(kc get node "$NODE" -o jsonpath='{.status.allocatable.memory}')"

kc get --raw "/api/v1/nodes/$NODE/proxy/metrics/cadvisor" > /tmp/stand-budget-cadvisor.txt
kc get pods -A -o json > /tmp/stand-budget-pods.json

python3 - "$BUDGET" "$ALLOCATABLE" "$KUBE_CONTEXT" <<'PY'
import json
import re
import sys

budget_s, allocatable_s = sys.argv[1], sys.argv[2]

UNITS = {'Ki': 1024, 'Mi': 1024**2, 'Gi': 1024**3, 'Ti': 1024**4}


def quantity(value):
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        return int(value)
    value = str(value)
    m = re.fullmatch(r'([0-9.]+)([EPTGMK]i?)?', value)
    if not m:
        return 0
    num = float(m.group(1))
    unit = m.group(2) or ''
    if unit.endswith('i'):
        return int(num * UNITS[unit])
    # SI units (M, G, ...) are bytes with a 1000 base
    si = {'k': 1000, 'M': 1000**2, 'G': 1000**3, 'T': 1000**4, 'P': 1000**5, 'E': 1000**6}
    return int(num * si.get(unit, 1))


def human(n):
    for unit in ('Gi', 'Mi', 'Ki'):
        if n >= UNITS[unit]:
            return f'{n / UNITS[unit]:.2f} {unit}'
    return f'{n} B'


def pod_resources(pod):
    req = lim = 0
    init_req = init_lim = 0
    for c in (pod['spec'].get('containers') or []) + (pod['spec'].get('initContainers') or []):
        r = c.get('resources') or {}
        req += quantity((r.get('requests') or {}).get('memory'))
        lim += quantity((r.get('limits') or {}).get('memory'))
    for c in pod['spec'].get('initContainers') or []:
        r = c.get('resources') or {}
        init_req = max(init_req, quantity((r.get('requests') or {}).get('memory')))
        init_lim = max(init_lim, quantity((r.get('limits') or {}).get('memory')))
    return max(req, init_req), max(lim, init_lim)


pods = json.load(open('/tmp/stand-budget-pods.json'))
requests = {}
limits = {}
for pod in pods['items']:
    if pod.get('status', {}).get('phase') in ('Succeeded', 'Failed'):
        continue
    ns = pod['metadata'].get('namespace', '')
    if ns in ('kube-system',):
        continue
    req, lim = pod_resources(pod)
    requests[ns] = requests.get(ns, 0) + req
    limits[ns] = limits.get(ns, 0) + lim

# container_memory_working_set_bytes{namespace="...",pod="...",container="..."} value
actual = {}
pod_actual = {}
line_re = re.compile(r'^container_memory_working_set_bytes\{(.*)\} ([0-9.e+]+)(?: [0-9]+)?$')
for line in open('/tmp/stand-budget-cadvisor.txt', errors='ignore'):
    m = line_re.match(line.strip())
    if not m:
        continue
    labels = dict(re.findall(r'(\w+)="([^"]*)"', m.group(1)))
    ns = labels.get('namespace') or ''
    pod = labels.get('pod') or ''
    container = labels.get('container') or ''
    if ns == '' or pod == '' or container in ('', 'POD'):
        continue
    value = int(float(m.group(2)))
    actual[ns] = actual.get(ns, 0) + value
    pod_actual[(ns, pod)] = pod_actual.get((ns, pod), 0) + value

order = sorted(set(requests) | set(actual), key=lambda ns: -actual.get(ns, 0))
print(f'{"namespace":28} {"requests":>12} {"limits":>12} {"actual":>12}')
for ns in order:
    print(f'{ns:28} {human(requests.get(ns, 0)):>12} {human(limits.get(ns, 0)):>12} {human(actual.get(ns, 0)):>12}')

total_req = sum(requests.values())
total_lim = sum(limits.values())
total_actual = sum(actual.values())
print(f'{"TOTAL":28} {human(total_req):>12} {human(total_lim):>12} {human(total_actual):>12}')
print()

print('Top pods by working set:')
for (ns, pod), value in sorted(pod_actual.items(), key=lambda kv: -kv[1])[:15]:
    print(f'  {ns + "/" + pod:55} {human(value):>10}')

# Requests drive scheduling: a pod with a small working set and a fat request still blocks the node.
pod_requests = {}
for pod in pods['items']:
    if pod.get('status', {}).get('phase') in ('Succeeded', 'Failed'):
        continue
    ns = pod['metadata'].get('namespace', '')
    if ns in ('kube-system',):
        continue
    req, _ = pod_resources(pod)
    name = pod['metadata'].get('name', '')
    pod_requests[(ns, name)] = req
print()
print('Top pods by requests:')
for (ns, pod), value in sorted(pod_requests.items(), key=lambda kv: -kv[1])[:15]:
    print(f'  {ns + "/" + pod:55} {human(value):>10}')

allocatable = quantity(allocatable_s)
budget = quantity(budget_s)
print()
print(f'node allocatable: {human(allocatable)}; VM budget: {human(budget)}; actual: {human(total_actual)}')
if total_actual <= budget:
    print(f'OK: {human(budget - total_actual)} headroom under the budget')
else:
    print(f'OVER: {human(total_actual - budget)} above the budget; minimum for this layout is about {human(total_actual)}')
if total_req > allocatable:
    print(f'WARNING: requests exceed allocatable by {human(total_req - allocatable)} - pods will stay Pending')
PY
