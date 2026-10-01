#!/usr/bin/env node
/**
 * Edit and check translations in every locale of a package's `lang/` directory at once.
 *
 *   pnpm i18n check [target...] [--all]        missing/extra keys vs en.json (exit 1 on missing)
 *   pnpm i18n missing <target> [--json]        missing keys with en/ru values, ready for `set --file`
 *   pnpm i18n set <target> <key> --en "..." --ru "..." --de "..." ...   upsert one key
 *   pnpm i18n set <target> --file keys.json    upsert many from JSON:
 *                                              { "Key": { "en": "...", "ru": "...", ... } }
 *   pnpm i18n rm <target> <key...>             remove keys from every locale
 *
 * target: package name (`view-assets`, `@hcengineering/view-assets`, `view`) or a lang dir path.
 * key: `Key` (section `string`) or a dotted path like `emailTemplate.Subject`.
 * `set` refuses to add a new key unless every locale gets a value (--allow-missing overrides).
 * Without targets `check` looks at lang dirs changed vs `develop`; `--all` checks every lang dir.
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const root = path.join(__dirname, '..', '..')

function allLangDirs () {
  return execSync("git ls-files '*/lang/en.json'", { cwd: root })
    .toString()
    .split('\n')
    .filter((f) => f !== '')
    .map((f) => path.dirname(f))
}

function changedLangDirs () {
  const out = execSync('git diff --name-only develop -- "*/lang/*.json"; git ls-files --others --exclude-standard "*/lang/*.json"', {
    cwd: root,
    shell: '/bin/sh'
  }).toString()
  return [...new Set(out.split('\n').filter((f) => f !== '').map((f) => path.dirname(f)))]
}

function resolveDir (target) {
  const asPath = path.resolve(root, target)
  if (fs.existsSync(path.join(asPath, 'en.json'))) return path.relative(root, asPath)
  if (fs.existsSync(path.join(asPath, 'lang', 'en.json'))) return path.relative(root, path.join(asPath, 'lang'))
  const name = target.replace(/^@hcengineering\//, '')
  const candidates = [name, `${name}-assets`]
  const found = allLangDirs().filter((d) => candidates.includes(path.basename(path.dirname(d))))
  if (found.length === 1) return found[0]
  if (found.length > 1) fail(`ambiguous target '${target}': ${found.join(', ')}`)
  fail(`no lang dir for '${target}'`)
}

function fail (msg) {
  console.error(`i18n: ${msg}`)
  process.exit(2)
}

function loadDir (dir) {
  const files = fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.json'))
  const locales = new Map()
  for (const f of files) {
    const file = path.join(root, dir, f)
    const text = fs.readFileSync(file, 'utf8')
    locales.set(f.replace(/\.json$/, ''), { file, data: JSON.parse(text), trailingNewline: text.endsWith('\n') })
  }
  if (!locales.has('en')) fail(`${dir} has no en.json`)
  return locales
}

function save (locale) {
  fs.writeFileSync(locale.file, JSON.stringify(locale.data, null, 2) + (locale.trailingNewline ? '\n' : ''))
}

function flatten (obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && typeof v === 'object') flatten(v, `${prefix}${k}.`, out)
    else out.set(`${prefix}${k}`, v)
  }
  return out
}

function keyPath (key) {
  return key.includes('.') ? key.split('.') : ['string', key]
}

function getAt (data, parts) {
  return parts.reduce((o, p) => (o == null ? undefined : o[p]), data)
}

function setAt (data, parts, value) {
  let o = data
  for (const p of parts.slice(0, -1)) {
    if (o[p] === undefined) o[p] = {}
    o = o[p]
  }
  o[parts[parts.length - 1]] = value
}

function deleteAt (data, parts) {
  const parent = getAt(data, parts.slice(0, -1))
  if (parent == null || !(parts[parts.length - 1] in parent)) return false
  delete parent[parts[parts.length - 1]]
  // Drop a section left empty, so set + rm leaves the file as it was.
  if (parts.length > 1 && Object.keys(parent).length === 0) deleteAt(data, parts.slice(0, -1))
  return true
}

function diffDir (dir) {
  const locales = loadDir(dir)
  const en = flatten(locales.get('en').data)
  const report = []
  for (const [name, locale] of locales) {
    if (name === 'en') continue
    const keys = flatten(locale.data)
    const missing = [...en.keys()].filter((k) => !keys.has(k))
    const extra = [...keys.keys()].filter((k) => !en.has(k))
    if (missing.length > 0 || extra.length > 0) report.push({ locale: name, missing, extra })
  }
  return { locales, en, report }
}

function cmdCheck (targets, all) {
  const dirs = targets.length > 0 ? targets.map(resolveDir) : all ? allLangDirs() : changedLangDirs()
  let missingTotal = 0
  for (const dir of dirs) {
    const { report } = diffDir(dir)
    for (const r of report) {
      missingTotal += r.missing.length
      if (r.missing.length > 0) console.log(`${dir}/${r.locale}.json missing ${r.missing.length}: ${r.missing.join(', ')}`)
      if (r.extra.length > 0) console.log(`${dir}/${r.locale}.json extra ${r.extra.length}: ${r.extra.join(', ')}`)
    }
  }
  console.log(`i18n: ${dirs.length} lang dir(s) checked, ${missingTotal} missing key(s)`)
  if (missingTotal > 0) process.exit(1)
}

function cmdMissing (target, asJson) {
  const dir = resolveDir(target)
  const { locales, en, report } = diffDir(dir)
  const ru = flatten(locales.get('ru')?.data ?? {})
  const result = {}
  for (const r of report) {
    for (const k of r.missing) {
      result[k] ??= { en: en.get(k), ...(ru.has(k) ? { ru: ru.get(k) } : {}) }
      result[k][r.locale] = ''
    }
  }
  if (asJson) console.log(JSON.stringify(result, null, 2))
  else for (const [k, v] of Object.entries(result)) console.log(`${k}: missing in ${Object.keys(v).filter((l) => v[l] === '').join(', ')}`)
}

function cmdSet (target, entries, allowMissing) {
  const dir = resolveDir(target)
  const locales = loadDir(dir)
  const errors = []
  for (const [key, values] of Object.entries(entries)) {
    const parts = keyPath(key)
    const unknown = Object.keys(values).filter((l) => !locales.has(l))
    if (unknown.length > 0) errors.push(`${key}: unknown locale(s) ${unknown.join(', ')}`)
    const isNew = [...locales.values()].some((l) => getAt(l.data, parts) === undefined)
    const absent = [...locales.keys()].filter((l) => values[l] === undefined || values[l] === '')
    if (isNew && absent.length > 0 && !allowMissing) errors.push(`${key}: no value for ${absent.join(', ')}`)
  }
  if (errors.length > 0) fail(`nothing written\n  ${errors.join('\n  ')}`)
  // Only rewrite files whose content changes, so untouched locales keep their exact formatting.
  const changed = new Set()
  for (const [key, values] of Object.entries(entries)) {
    const parts = keyPath(key)
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined || value === '') continue
      const locale = locales.get(name)
      if (getAt(locale.data, parts) === value) continue
      setAt(locale.data, parts, value)
      changed.add(locale)
    }
  }
  for (const l of changed) save(l)
  console.log(`i18n: ${Object.keys(entries).length} key(s) written to ${dir}`)
}

function cmdRm (target, keys) {
  const dir = resolveDir(target)
  const locales = loadDir(dir)
  let removed = 0
  const changed = new Set()
  for (const key of keys) {
    for (const l of locales.values()) {
      if (!deleteAt(l.data, keyPath(key))) continue
      removed++
      changed.add(l)
    }
  }
  for (const l of changed) save(l)
  console.log(`i18n: removed ${removed} entr(y/ies) from ${dir}`)
}

function parseArgs (argv) {
  const positional = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) {
      positional.push(a)
      continue
    }
    const name = a.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) flags[name] = true
    else {
      flags[name] = next
      i++
    }
  }
  return { positional, flags }
}

function main () {
  const [cmd, ...rest] = process.argv.slice(2)
  const { positional, flags } = parseArgs(rest)
  switch (cmd) {
    case 'check':
      return cmdCheck(positional, flags.all === true)
    case 'missing':
      if (positional.length !== 1) fail('usage: missing <target> [--json]')
      return cmdMissing(positional[0], flags.json === true)
    case 'set': {
      const [target, key] = positional
      if (target === undefined) fail('usage: set <target> <key> --en ... | set <target> --file keys.json')
      const allowMissing = flags['allow-missing'] === true
      delete flags['allow-missing']
      if (typeof flags.file === 'string') {
        return cmdSet(target, JSON.parse(fs.readFileSync(path.resolve(flags.file), 'utf8')), allowMissing)
      }
      if (key === undefined) fail('set: key is required')
      return cmdSet(target, { [key]: flags }, allowMissing)
    }
    case 'rm':
      if (positional.length < 2) fail('usage: rm <target> <key...>')
      return cmdRm(positional[0], positional.slice(1))
    default:
      console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*\n/, '').replace(/^ \* ?/gm, ''))
      process.exit(cmd === undefined || cmd === 'help' ? 0 : 2)
  }
}

main()
