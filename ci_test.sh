#!/bin/bash

set -eo pipefail

export project_dir=$(pwd)
echo "=== Exported Variables ==="
echo "project_dir: $project_dir"

pnpm install --frozen-lockfile


# Unit group only (*.test.ts / *.spec.ts): no service needed, and it fails fast with a per-package
# report. The coverage run below repeats it together with the integration group.
pnpm test --verbose

# Unit + integration (*.itest.ts) under istanbul, into coverage/. Also the gate for the
# integration group, and the last line is what the job's `coverage:` regex reads. The integration
# suites start their own containers, so no stand is prepared and no service url is exported - an
# exported one would be used instead of a container.
pnpm coverage --integration
