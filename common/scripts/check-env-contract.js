#!/usr/bin/env node
// Compares the env vars each service reads (deployment/kubernetes/env-contract.json,
// built by env-contract.js) with what the stand charts supply. New drift fails the check.

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..', '..')
const K8S = path.join(ROOT, 'deployment', 'kubernetes')
const CONTRACT = path.join(K8S, 'env-contract.json')
const BASELINE = path.join(K8S, 'env-contract-baseline.json')
const CHARTS = path.join(K8S, 'charts', 'platform')
const STANDS = path.join(K8S, 'stands')
const RENDER_CHECK = path.join(STANDS, 'ci', 'render-check.yaml')
// Read by Node/kubelet, not by the service code.
const RUNTIME_ENV = new Set([
  'NODE_EXTRA_CA_CERTS',
  'NODE_OPTIONS',
  'NODE_ENV',
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'TZ',
  'HOSTNAME',
  'POD_NAME',
  'POD_NAMESPACE'
])
// Not scanned by env-contract.js: Go (stream) and packages without TS sources.
const NOT_MODELLED = new Set(['stream'])
// Not stands: the base overlay and the kind/livekit fragments.
const SKIP_STANDS = new Set(['base', 'ci'])

const args = process.argv.slice(2)
const opt = (name) => args.includes(name)
const value = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const onlyStand = value('--stand')

function die (msg) {
  console.error(`check-env-contract: ${msg}`)
  process.exit(2)
}

function loadContract () {
  if (!fs.existsSync(CONTRACT)) {
    die(`${path.relative(ROOT, CONTRACT)} is missing; run: node common/scripts/env-contract.js`)
  }
  const data = JSON.parse(fs.readFileSync(CONTRACT, 'utf8'))
  const byImage = new Map()
  for (const pkg of Object.values(data.packages ?? {})) {
    if (pkg.image == null) continue
    const entry = byImage.get(pkg.image) ?? { env: new Set(), unresolved: new Set(), packages: [] }
    for (const name of pkg.env ?? []) entry.env.add(name)
    for (const name of pkg.unresolved ?? []) entry.unresolved.add(name)
    entry.packages.push(pkg.dir ?? pkg.name)
    byImage.set(pkg.image, entry)
  }
  return byImage
}

function listStands () {
  return fs
    .readdirSync(STANDS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => !SKIP_STANDS.has(name))
    .filter((name) => fs.existsSync(path.join(STANDS, name, 'values.yaml')))
    .filter((name) => onlyStand == null || name === onlyStand)
}

function render (stand) {
  const out = execFileSync(
    'helm',
    [
      'template',
      `stand-${stand}`,
      CHARTS,
      '-f',
      path.join(STANDS, stand, 'values.yaml'),
      '-f',
      RENDER_CHECK
    ],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  )
  return out
}

function normalizeImage (image) {
  return image.replace(/^.*\//, '').replace(/@sha256:.*$/, '').split(':')[0]
}

// Line-based reader for the shapes our chart emits; anything else is ignored.
function parse (yaml) {
  const configMaps = new Map() // name -> Set<key>
  const secrets = new Map()
  const docs = yaml.split(/^---$/m).map((text) => ({ text, kind: /^kind:\s*(\S+)/m.exec(text)?.[1] }))

  for (const { text, kind } of docs) {
    if (kind !== 'ConfigMap' && kind !== 'Secret') continue
    const name = /^metadata:\n(?: {2}.*\n)*? {2}name:\s*(\S+)/m.exec(text)?.[1]
    if (name == null) continue
    const keys = new Set()
    for (const m of text.matchAll(/^ {2}([A-Za-z0-9_.-]+):/gm)) {
      if (m[1] !== 'namespace' && m[1] !== 'name') keys.add(m[1])
    }
    ;(kind === 'ConfigMap' ? configMaps : secrets).set(name, keys)
  }

  const images = new Map() // image -> { env:Set }
  for (const { text, kind } of docs) {
    if (kind !== 'Deployment' && kind !== 'StatefulSet' && kind !== 'Job') continue
    const image = /^\s+image:\s*(\S+)\s*$/m.exec(text)?.[1]
    if (image == null) continue
    const entry = images.get(normalizeImage(image)) ?? { env: new Set() }
    for (const m of text.matchAll(/^\s*-\s*name:\s*([A-Z][A-Z0-9_]{2,})\s*$/gm)) entry.env.add(m[1])
    for (const m of text.matchAll(/^\s*-\s*configMapRef:\s*\n\s*name:\s*(\S+)/gm)) {
      for (const key of configMaps.get(m[1]) ?? []) entry.env.add(key)
    }
    for (const m of text.matchAll(/^\s*-\s*secretRef:\s*\n\s*name:\s*(\S+)/gm)) {
      for (const key of secrets.get(m[1]) ?? []) entry.env.add(key)
    }
    images.set(normalizeImage(image), entry)
  }
  return images
}

function readBaseline () {
  if (!fs.existsSync(BASELINE)) return { unused: [], missing: [] }
  const data = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
  return { unused: data.unused ?? [], missing: data.missing ?? [] }
}

function main () {
  const contract = loadContract()
  const stands = listStands()
  if (stands.length === 0) die('no stands to check')

  const unused = new Set() // chart supplies, service never reads
  const missing = new Set() // service reads, chart never supplies
  const unknown = new Map() // deployments whose image has no contract

  for (const stand of stands) {
    const images = parse(render(stand))
    for (const [image, entry] of images) {
      const declared = contract.get(image)
      if (declared == null || NOT_MODELLED.has(image)) {
        unknown.set(image, stand)
        continue
      }
      const supplied = entry.env
      for (const name of supplied) {
        if (!declared.env.has(name) && !RUNTIME_ENV.has(name)) unused.add(`${image}:${name}`)
      }
      for (const name of declared.env) {
        if (!supplied.has(name)) missing.add(`${image}:${name}`)
      }
    }
  }

  const current = { unused: [...unused].sort(), missing: [...missing].sort() }
  const base = readBaseline()

  if (opt('--update-baseline')) {
    // Only "supplied but not read" is compared by default; the other direction lists
    // every optional var a service may read and is reported, not enforced.
    fs.writeFileSync(BASELINE, JSON.stringify({ unused: current.unused }, null, 2) + '\n')
    console.log(`baseline written: ${path.relative(ROOT, BASELINE)}`)
    return
  }

  const baseUnused = new Set(base.unused)
  const baseMissing = new Set(base.missing)
  const strict = opt('--strict')
  const freshUnused = current.unused.filter((x) => !baseUnused.has(x))
  const freshMissing = strict ? current.missing.filter((x) => !baseMissing.has(x)) : []
  const goneUnused = base.unused.filter((x) => !unused.has(x))
  const goneMissing = strict ? base.missing.filter((x) => !missing.has(x)) : []

  console.log(`stands: ${stands.join(', ')}`)
  console.log(`services with a contract: ${contract.size}, without: ${unknown.size}`)
  console.log(`chart supplies but nobody reads: ${current.unused.length} (baseline ${base.unused.length})`)
  console.log(`read but never supplied:         ${current.missing.length} (baseline ${base.missing.length})`)

  for (const [title, list] of [
    ['new: supplied but not read', freshUnused],
    ['new: read but not supplied', freshMissing],
    ['fixed, drop from baseline', [...goneUnused, ...goneMissing]]
  ]) {
    if (list.length === 0) continue
    console.log(`\n${title}:`)
    for (const item of list.slice(0, 40)) console.log(`  ${item}`)
    if (list.length > 40) console.log(`  ... ${list.length - 40} more`)
  }

  if (opt('--json')) {
    console.log(JSON.stringify({ stands, current, freshUnused, freshMissing, unknown: [...unknown.keys()] }, null, 2))
  }

  if (freshUnused.length > 0 || goneUnused.length > 0) process.exit(1)
  if (opt('--strict') && (freshMissing.length > 0 || goneMissing.length > 0)) process.exit(1)
  console.log('\nno drift')
}

main()
