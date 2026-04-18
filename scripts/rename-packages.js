#!/usr/bin/env node
// Rename old-scope/* -> new-scope/* and update repository URLs.
// Usage: node scripts/rename-packages.js [--dry]

const fs = require('fs')
const path = require('path')

const DRY = process.argv.includes('--dry')
const ROOT_ARG = process.argv.slice(2).find((a) => !a.startsWith('--'))
const ROOT = ROOT_ARG ? path.resolve(ROOT_ARG) : path.resolve(__dirname, '..')

// Build scope strings at runtime so linters/formatters cannot rewrite them.
const OLD_SCOPE = '@' + 'hc' + 'engineering' + '/'
const NEW_SCOPE = '@' + 'intabia' + 'fusion' + '/'
const OLD_GH_ORG = 'hc' + 'engineering'
const NEW_GH_ORG = 'intabia-fusion'
const NEW_REPO_URL = 'https://github.com/intabia-fusion/foundation'
const NEW_REPO_GIT = 'git+https://github.com/intabia-fusion/foundation.git'

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.rush', 'common/temp',
  '.svelte-kit', '.next', 'coverage', '.turbo'
])

const TEXT_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.cts', '.mts', '.svelte', '.vue',
  '.json', '.jsonc', '.json5', '.yaml', '.yml', '.md', '.mdx',
  '.html', '.htm', '.css', '.scss', '.sass', '.less',
  '.sh', '.bash', '.zsh', '.toml', '.ini', '.env', '.conf',
  '.d.ts', '.graphql', '.gql', '.txt', '.xml',
  '.service', '.ts_'
])

const SPECIAL_FILES = new Set([
  'Dockerfile', 'Makefile', '.eslintrc', '.prettierrc', '.gitignore',
  '.dockerignore', '.npmrc'
])

let stats = { files: 0, changed: 0, pkgRepoChanged: 0, pkgNameChanged: 0 }

function shouldSkip (abs) {
  const rel = path.relative(ROOT, abs)
  const parts = rel.split(path.sep)
  for (let i = 0; i < parts.length; i++) {
    if (SKIP_DIRS.has(parts[i])) return true
    if (i < parts.length - 1 && SKIP_DIRS.has(parts.slice(i, i + 2).join('/'))) return true
  }
  return false
}

function isTextFile (file) {
  const base = path.basename(file)
  if (SPECIAL_FILES.has(base)) return true
  const ext = path.extname(file)
  if (TEXT_EXT.has(ext)) return true
  if (base.startsWith('.') && !ext) return true
  return false
}

function walk (dir, out) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const abs = path.join(dir, e.name)
    if (shouldSkip(abs)) continue
    if (e.isDirectory()) walk(abs, out)
    else if (e.isFile()) out.push(abs)
  }
}

function updateRepositoryField (pkg) {
  let changed = false
  if (pkg.repository !== undefined) {
    if (typeof pkg.repository === 'string') {
      if (pkg.repository !== NEW_REPO_URL) { pkg.repository = NEW_REPO_URL; changed = true }
    } else if (typeof pkg.repository === 'object' && pkg.repository !== null) {
      if (pkg.repository.url !== NEW_REPO_GIT) { pkg.repository.url = NEW_REPO_GIT; changed = true }
      if (pkg.repository.type !== 'git') { pkg.repository.type = 'git'; changed = true }
    }
  }
  return changed
}

function renameInDepsObj (deps) {
  if (!deps || typeof deps !== 'object') return false
  let changed = false
  const newKeys = {}
  for (const k of Object.keys(deps)) {
    if (k.startsWith(OLD_SCOPE)) {
      newKeys[NEW_SCOPE + k.slice(OLD_SCOPE.length)] = deps[k]
      changed = true
    } else {
      newKeys[k] = deps[k]
    }
  }
  if (changed) {
    for (const k of Object.keys(deps)) delete deps[k]
    Object.assign(deps, newKeys)
  }
  return changed
}

function processPackageJson (file) {
  const raw = fs.readFileSync(file, 'utf8')
  let pkg
  try { pkg = JSON.parse(raw) } catch { return false }
  let nameChanged = false
  let repoChanged = false

  if (typeof pkg.name === 'string' && pkg.name.startsWith(OLD_SCOPE)) {
    nameChanged = true
  }
  if (updateRepositoryField(pkg)) repoChanged = true

  if (nameChanged) stats.pkgNameChanged++
  if (repoChanged) stats.pkgRepoChanged++

  // Write JSON back only if repository changed (structural mutation).
  // Scope rename is handled by full-text substitution below to cover
  // scripts, descriptions, and any other string value referencing the old scope.
  let current = raw
  if (repoChanged) {
    const trailingNewline = raw.endsWith('\n') ? '\n' : ''
    current = JSON.stringify(pkg, null, 2) + trailingNewline
  }
  const replaced = current.split(OLD_SCOPE).join(NEW_SCOPE)
  if (replaced !== raw) {
    if (!DRY) fs.writeFileSync(file, replaced)
    stats.changed++
    return true
  }
  return false
}

function processTextFile (file) {
  const raw = fs.readFileSync(file, 'utf8')
  if (
    !raw.includes(OLD_SCOPE) &&
    !raw.includes('github.com/' + OLD_GH_ORG) &&
    !raw.includes(OLD_GH_ORG + '/stream') &&
    !raw.includes('@' + OLD_GH_ORG) &&
    !raw.includes(OLD_GH_ORG + '/platform')
  ) return false
  let out = raw.split(OLD_SCOPE).join(NEW_SCOPE)
  // Go module paths (github.com/intabia-fusion/stream) are intentionally preserved.
  out = out.split('github.com/' + OLD_GH_ORG + '/platform').join('github.com/' + NEW_GH_ORG + '/foundation')
  out = out.split('github.com/' + OLD_GH_ORG + '/anticrm').join('github.com/' + NEW_GH_ORG + '/foundation')
  out = out.split('github.com/' + OLD_GH_ORG + '/communication').join('github.com/' + NEW_GH_ORG + '/foundation')
  out = out.split('github.com/' + OLD_GH_ORG).join('github.com/' + NEW_GH_ORG)
  // References to the org in comments, scripts, docs: "@intabiafusion" literal.
  out = out.split('@' + OLD_GH_ORG).join('@' + NEW_GH_ORG.replace('-', ''))
  if (out !== raw) {
    if (!DRY) fs.writeFileSync(file, out)
    stats.changed++
    return true
  }
  return false
}

function main () {
  const all = []
  walk(ROOT, all)
  for (const file of all) {
    stats.files++
    const base = path.basename(file)
    if (base === 'package.json') {
      processPackageJson(file)
    } else if (isTextFile(file)) {
      processTextFile(file)
    }
  }
  console.log(JSON.stringify({ dry: DRY, ...stats }, null, 2))
}

main()
