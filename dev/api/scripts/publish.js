#!/usr/bin/env node
//
// Copyright 2026 Intabia Fusion
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Publish the built bundle to public npmjs.org registry.
// Requires `npm login` (npm whoami must return the correct user).
//

'use strict'

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const DEV_API_DIR = path.resolve(__dirname, '..')
const BUNDLE_DIR = path.join(DEV_API_DIR, 'bundle')
const REGISTRY = 'https://registry.npmjs.org'

function main() {
  if (!fs.existsSync(path.join(BUNDLE_DIR, 'package.json'))) {
    console.error('bundle/package.json not found. Run build-bundle.js first.')
    process.exit(1)
  }
  if (!fs.existsSync(path.join(BUNDLE_DIR, 'lib'))) {
    console.error('bundle/lib not found. Compile the bundle first (npx tsc).')
    process.exit(1)
  }

  try {
    const whoami = execSync('npm whoami', { encoding: 'utf8' }).trim()
    console.log('Publishing as:', whoami)
  } catch {
    console.error('Not logged in to npm. Run: npm login')
    process.exit(1)
  }

  console.log('Publishing to', REGISTRY)
  execSync(`npm publish --registry=${REGISTRY} --access public`, {
    cwd: BUNDLE_DIR,
    stdio: 'inherit'
  })
  console.log('Done.')
}

main()
