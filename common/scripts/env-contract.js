#!/usr/bin/env node
/**
 * Static environment contract for every package that builds a docker image.
 *
 * For each deployable package it reports the env names the code reads: the package's own
 * sources plus the sources of its transitive runtime workspace dependencies - a pod bundles
 * its whole closure, so code in foundations/* and server/* reads env the pod dir never mentions.
 *
 * The read set is derived from the TypeScript AST, never from imports or a build:
 *   - `process.env.NAME`                             -> direct
 *   - `process.env['NAME']`, `process.env[NAME]`     -> index (when NAME is a literal const)
 *   - `process.env[envMap.Name]`                     -> envMap (literal value of the map entry)
 *   - `const { NAME } = process.env`                 -> direct
 *   - `readEnv('NAME')` where `readEnv` reads `process.env[name]` -> direct (literal call sites)
 * Anything whose key is not a literal is collected in `unresolved`, tagged with the package
 * it came from, because only a human can decide what it reads at runtime.
 *
 *   node common/scripts/env-contract.js                 write deployment/kubernetes/env-contract.json
 *   node common/scripts/env-contract.js --check         exit 1 if the committed json is stale
 *   node common/scripts/env-contract.js --print <x>     show one package by name, image or dir
 *
 * Output: `packages[name]` = dir, image (absent when it cannot be derived from the package
 * scripts), env (own + closure), own, shared (only the closure), unresolved, via. The
 * consumer of this file is common/scripts/check-env-contract.js.
 */

const fs = require('fs')
const path = require('path')

const { listWorkspaceProjects, findWorkspaceRoot } = require(
  path.join(__dirname, '..', '..', 'foundations', 'utils', 'packages', 'platform-rig', 'bin', 'libs', 'workspace')
)

const OUT_FILE = path.join('deployment', 'kubernetes', 'env-contract.json')

// Browser-only packages: bundling them into a server image is not a thing, so their env reads
// (build-time `import.meta.env` shims, test helpers) are not part of any service contract.
const CLIENT_PACKAGES = new Set(['@hcengineering/ui', '@hcengineering/presentation', '@hcengineering/theme'])

// Directories that never hold the sources we care about.
const SKIP_DIRS = new Set([
  'node_modules',
  'lib',
  'dist',
  'types',
  'coverage',
  'bundle',
  '.git',
  '.rush',
  '__tests__',
  '__mocks__'
])

// Tests, type declarations and benchmarks are not runtime reads.
const SKIP_FILE = /(\.test|\.spec|\.itest|\.bench|\.d)\.tsx?$/

const SOURCE_FILE = /\.tsx?$/

/** TypeScript is a devDependency of common/scripts, not of every package. */
function loadTypeScript () {
  const direct = tryRequire('typescript')
  if (direct !== undefined) return direct

  let candidates = []
  try {
    candidates = fs.readdirSync(path.join(__dirname, 'node_modules', '.pnpm')).filter((it) => it.startsWith('typescript@'))
  } catch (err) {
    candidates = []
  }
  candidates.sort().reverse()
  for (const dir of candidates) {
    const found = tryRequire(path.join(__dirname, 'node_modules', '.pnpm', dir, 'node_modules', 'typescript'))
    if (found !== undefined) return found
  }
  throw new Error('typescript is not installed - run pnpm install')
}

function tryRequire (spec) {
  try {
    return require(spec)
  } catch (err) {
    return undefined
  }
}

const ts = loadTypeScript()

/** @returns {string[]} absolute paths of the package sources */
function listSources (dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      listSources(full, out)
    } else if (SOURCE_FILE.test(entry.name) && !SKIP_FILE.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

function isStringLiteral (node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
}

/** `process.env` (optionally `process?.env`) */
function isProcessEnv (node) {
  if (!ts.isPropertyAccessExpression(node)) return false
  if (node.name.text !== 'env') return false
  return ts.isIdentifier(node.expression) && node.expression.text === 'process'
}

function isWriteTarget (node) {
  const parent = node.parent
  if (parent == null) return false
  if (ts.isBinaryExpression(parent) && parent.left === node) {
    const op = parent.operatorToken.kind
    return (
      op === ts.SyntaxKind.EqualsToken ||
      op === ts.SyntaxKind.BarBarEqualsToken ||
      op === ts.SyntaxKind.AmpersandAmpersandEqualsToken ||
      op === ts.SyntaxKind.QuestionQuestionEqualsToken
    )
  }
  if (ts.isDeleteExpression(parent) && parent.expression === node) return true
  return false
}

/**
 * Read a key that is not a literal. When the key is a parameter of the enclosing function
 * (`function intEnv (name) { return process.env[name] }`), remember the function and the
 * parameter index so the package can resolve its literal call sites.
 */
function helperParamOf (node) {
  if (!ts.isIdentifier(node)) return undefined
  let current = node
  while (current.parent != null) {
    current = current.parent
    if (!ts.isFunctionLike(current)) continue
    const index = current.parameters.findIndex((it) => ts.isIdentifier(it.name) && it.name.text === node.text)
    if (index < 0) return undefined
    const name = functionNameOf(current)
    return name === undefined ? undefined : { name, index }
  }
  return undefined
}

function functionNameOf (fn) {
  if (ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn)) return fn.name?.text
  const parent = fn.parent
  if (parent != null && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text
  if (parent != null && ts.isPropertyAssignment(parent)) {
    return ts.isIdentifier(parent.name) ? parent.name.text : undefined
  }
  return undefined
}

/**
 * Reads of a single file.
 * @returns {{
 *   reads: Array<{name: string, via: 'direct'|'index'|'envMap'}>,
 *   unresolved: Array<{expr: string, line: number, helper?: {name: string, index: number}}>,
 *   calls: Array<{name: string, args: Array<string|undefined>}>
 * }}
 */
function analyzeFile (file) {
  const text = fs.readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

  // `const envMap = { Port: 'PORT' }` and friends: name -> key -> literal value.
  const maps = new Map()
  // `const PORT_ENV = 'PORT'`: name -> literal, used when the key is a bare identifier.
  const consts = new Map()

  const registerMap = (name, init) => {
    let object = init
    while (
      object != null &&
      (ts.isAsExpression(object) || ts.isParenthesizedExpression(object) || ts.isSatisfiesExpression(object))
    ) {
      object = object.expression
    }
    if (object == null || !ts.isObjectLiteralExpression(object)) return
    const entries = new Map()
    for (const prop of object.properties) {
      if (!ts.isPropertyAssignment(prop) || !isStringLiteral(prop.initializer)) continue
      const key = ts.isIdentifier(prop.name)
        ? prop.name.text
        : ts.isStringLiteral(prop.name)
          ? prop.name.text
          : undefined
      if (key === undefined) continue
      entries.set(key, prop.initializer.text)
    }
    if (entries.size > 0) maps.set(name, entries)
  }

  const declarations = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer != null) {
      const init = node.initializer
      if (/env/i.test(node.name.text)) registerMap(node.name.text, init)
      if (isStringLiteral(init)) consts.set(node.name.text, init.text)
    }
    ts.forEachChild(node, declarations)
  }
  declarations(sf)

  const reads = []
  const unresolved = []
  const calls = []

  /** Resolve `envMap.Key` (or a bare const) to the literal env name, if the file says so. */
  const resolveKey = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return { name: node.text, via: 'index' }
    }
    if (ts.isIdentifier(node)) {
      const literal = consts.get(node.text)
      if (literal !== undefined) return { name: literal, via: 'index' }
      return undefined
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const entries = maps.get(node.expression.text)
      const literal = entries?.get(node.name.text)
      if (literal !== undefined) return { name: literal, via: 'envMap' }
    }
    return undefined
  }

  const readProperty = (node) => {
    if (isWriteTarget(node)) return
    reads.push({ name: node.name.text, via: 'direct' })
  }
  const visit = (node) => {
    if (ts.isPropertyAccessExpression(node) && isProcessEnv(node.expression)) {
      readProperty(node)
      return
    }

    if (ts.isElementAccessExpression(node) && isProcessEnv(node.expression)) {
      if (isWriteTarget(node)) return
      const resolved = resolveKey(node.argumentExpression)
      if (resolved !== undefined) {
        reads.push(resolved)
      } else {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
        unresolved.push({
          expr: `process.env[${node.argumentExpression.getText(sf)}]`,
          line,
          helper: helperParamOf(node.argumentExpression)
        })
      }
      return
    }

    // readEnv('NAME') - literal arguments of a helper that reads process.env[<param>]
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      calls.push({
        name: node.expression.text,
        args: node.arguments.map((it) => (isStringLiteral(it) ? it.text : undefined))
      })
    }

    // const { NAME, ALT: alias } = process.env
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer != null &&
      isProcessEnv(node.initializer) &&
      ts.isObjectBindingPattern(node.name)
    ) {
      for (const element of node.name.elements) {
        const prop = element.propertyName ?? element.name
        if (ts.isIdentifier(prop)) reads.push({ name: prop.text, via: 'direct' })
      }
      return
    }

    ts.forEachChild(node, visit)
  }
  visit(sf)

  return { reads, unresolved, calls }
}

/** Docker image name a package builds, from its own scripts. */
function imageOf (pkg) {
  const values = Object.values(pkg.scripts ?? {})
  const collect = (pattern) => values.flatMap((value) => [...value.matchAll(pattern)].map((match) => stripName(match[1])))

  // Any script may be the one that publishes the image (`docker:build`, `dist-docker-build`).
  let names = collect(/docker_build\.sh\s+([^\s;&|]+)/g)
  if (names.length === 0) {
    // Older/one-off scripts only tag: `docker_tag.sh <name>` and `docker build -t .../<name>`.
    names = [...collect(/docker_tag\.sh\s+([^\s;&|]+)/g), ...collect(/intabiafusion\}\/([A-Za-z0-9._-]+)/g)]
  }

  const unique = [...new Set(names.filter((it) => it.length > 0))]
  // A package that names several images is a conflict; report it instead of guessing.
  return unique.length === 1 ? unique[0] : undefined
}

function stripName (raw) {
  const name = raw.replace(/^['"]|['"]$/g, '').split('/').pop()
  // `${DOCKER_NAMESPACE}/foo` style indirection cannot be resolved statically.
  return name.includes('$') ? '' : name
}

const isDeployable = (pkg) => {
  const scripts = pkg.scripts ?? {}
  if (scripts['_phase:docker-build'] !== undefined || scripts['docker:build'] !== undefined) return true
  // desktop-package publishes the distro download image from `dist-docker-build`.
  return Object.values(scripts).some((it) => it.includes('docker_build.sh'))
}

function isRuntimeDependency (name, project) {
  if (CLIENT_PACKAGES.has(name)) return false
  if (project.path.startsWith('plugins/')) return false
  // dev/* is build tooling: `dev/prod` is the webpack source of the front client bundle, its
  // env reads are baked in at build time and never reach the running container.
  if (project.path.startsWith('dev/')) return false
  if (!project.path.startsWith('server-plugins/') && /-(resources|assets)$/.test(name)) return false
  return true
}

function analyze () {
  const root = findWorkspaceRoot(__dirname)
  if (root == null) throw new Error('pnpm-workspace.yaml not found')

  const projects = listWorkspaceProjects(root)
  const byName = new Map(projects.map((it) => [it.name, it]))

  /** @type {Map<string, ReturnType<typeof analyzePackage>>} */
  const cache = new Map()

  function analyzePackage (project) {
    const cached = cache.get(project.name)
    if (cached !== undefined) return cached
    const result = { name: project.name, dir: project.path, env: new Set(), via: { envMap: new Set(), direct: new Set(), index: new Set() }, unresolved: [] }
    cache.set(project.name, result)

    const pending = []
    const callsByName = new Map()

    for (const file of listSources(path.join(root, project.path))) {
      const { reads, unresolved, calls } = analyzeFile(file)
      for (const read of reads) {
        result.env.add(read.name)
        result.via[read.via].add(read.name)
      }
      for (const item of unresolved) pending.push({ ...item, file: path.relative(root, file) })
      for (const call of calls) {
        if (!callsByName.has(call.name)) callsByName.set(call.name, [])
        callsByName.get(call.name).push(call)
      }
    }

    // A helper like `readEnv(name)` hides the real names in its call sites: take the literal
    // arguments at the parameter position the helper indexes process.env with. A call site that
    // passes something else keeps the read in `unresolved` - we cannot know what it reads.
    for (const item of pending) {
      const helper = item.helper
      const calls = helper === undefined ? [] : (callsByName.get(helper.name) ?? []).filter((call) => call.args.length > helper.index)
      const literals = calls.map((call) => call.args[helper.index]).filter((it) => it !== undefined)
      const dynamic = calls.length > literals.length
      for (const literal of literals) {
        result.env.add(literal)
        result.via.direct.add(literal)
      }
      if (literals.length === 0 || dynamic) {
        result.unresolved.push({ expr: item.expr, file: item.file, line: item.line, pkg: project.name })
      } else {
        continue
      }
    }

    return result
  }

  /** Transitive runtime closure of a package, itself included. */
  function closureOf (project) {
    const seen = new Set()
    const order = []
    const walk = (current) => {
      if (seen.has(current.name)) return
      seen.add(current.name)
      order.push(current)
      const pkg = JSON.parse(fs.readFileSync(path.join(root, current.path, 'package.json'), 'utf8'))
      const deps = { ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies }
      for (const name of Object.keys(deps)) {
        const dep = byName.get(name)
        if (dep == null || !isRuntimeDependency(name, dep)) continue
        walk(dep)
      }
    }
    walk(project)
    return order
  }

  const deployable = projects.filter((it) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, it.path, 'package.json'), 'utf8'))
    return isDeployable(pkg)
  })

  const output = { packages: {} }
  const noImage = []

  for (const project of deployable) {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, project.path, 'package.json'), 'utf8'))
    const image = imageOf(pkg)
    const own = analyzePackage(project)

    const env = new Set(own.env)
    const via = { envMap: new Set(own.via.envMap), direct: new Set(own.via.direct), index: new Set(own.via.index) }
    const unresolved = new Map()

    const closure = closureOf(project)
    // The package's own reads are bounded by its own dir; the closure adds only names it never
    // reads itself, so `shared` answers "what did we miss by scanning the pod alone".
    for (const dep of closure) {
      const analyzed = analyzePackage(dep)
      for (const name of analyzed.env) env.add(name)
      for (const bucket of ['envMap', 'direct', 'index']) {
        for (const name of analyzed.via[bucket]) via[bucket].add(name)
      }
      for (const item of analyzed.unresolved) {
        unresolved.set(`${item.expr} @ ${item.pkg}`, item)
      }
    }

    const entry = {
      dir: project.path,
      ...(image !== undefined ? { image } : {}),
      env: [...env].sort(),
      own: [...own.env].sort(),
      shared: [...env].filter((it) => !own.env.has(it)).sort(),
      unresolved: [...unresolved.keys()].sort(),
      // Every name in `via` is a member of `env`: a computed key is not a name, it stays in
      // `unresolved` (where the check consumer sends a human).
      via: {
        envMap: [...via.envMap].sort(),
        direct: [...via.direct].sort(),
        index: [...via.index].sort()
      }
    }
    output.packages[project.name] = entry
    if (image === undefined) noImage.push(project.name)
  }

  return { root, byName, analyzePackage, closureOf, output, noImage }
}

function serialize (output) {
  const packages = {}
  for (const [name, entry] of Object.entries(output.packages).sort(([a], [b]) => a.localeCompare(b))) {
    packages[name] = entry
  }
  return JSON.stringify({ packages }, null, 2) + '\n'
}

function readCommitted (root) {
  const file = path.join(root, OUT_FILE)
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined
}

function printPackage (ctx, query) {
  const hit = Object.entries(ctx.output.packages).find(
    ([name, entry]) => name === query || entry.image === query || entry.dir === query
  )
  if (hit == null) {
    console.error(`no deployable package matches "${query}"`)
    const like = Object.keys(ctx.output.packages).filter(
      (name) => name.includes(query) || (ctx.output.packages[name].image ?? '').includes(query)
    )
    if (like.length > 0) console.error(`did you mean: ${like.join(', ')}`)
    process.exit(2)
  }

  const [name, entry] = hit
  const ownSet = new Set(entry.own)
  const project = ctx.byName.get(name)
  const closure = ctx.closureOf(project)
  const origin = new Map()
  for (const dep of closure) {
    for (const envName of ctx.analyzePackage(dep).env) {
      if (!origin.has(envName)) origin.set(envName, [])
      origin.get(envName).push(dep.name)
    }
  }

  console.log(`package: ${name}`)
  console.log(`dir:     ${entry.dir}`)
  console.log(`image:   ${entry.image ?? '(unknown)'}`)
  console.log(`config:  ${fs.existsSync(path.join(ctx.root, entry.dir, 'src', 'config.ts')) ? 'src/config.ts' : '(no src/config.ts)'}`)
  console.log(`env:     ${entry.env.length} (own ${entry.own.length}, shared ${entry.shared.length})`)

  console.log('\nenv:')
  for (const envName of entry.env) {
    const tag = ownSet.has(envName) ? 'own' : `shared: ${[...new Set(origin.get(envName) ?? [])].join(', ')}`
    console.log(`  ${envName.padEnd(32)} ${tag}`)
  }

  if (entry.unresolved.length > 0) {
    const ownUnresolved = new Map()
    for (const dep of closure) {
      for (const item of ctx.analyzePackage(dep).unresolved) {
        ownUnresolved.set(`${item.file}:${item.line} ${item.expr} @ ${item.pkg}`, item)
      }
    }
    console.log('\nunresolved:')
    for (const key of [...ownUnresolved.keys()].sort()) console.log(`  ${key}`)
  }
}

function main () {
  const args = process.argv.slice(2)
  const flags = args.filter((it) => it.startsWith('--'))
  const target = args.find((it) => !it.startsWith('--'))
  const mode = flags[0] ?? '--write'

  if (flags.length > 1 || !['--write', '--check', '--print'].includes(mode)) {
    console.error('usage: env-contract.js [--write|--check|--print <package-name|image|dir>]')
    process.exit(2)
  }

  const result = analyze()
  const { root } = result

  if (mode === '--print') {
    if (target == null) {
      console.error('usage: env-contract.js --print <package-name|image|dir>')
      process.exit(2)
    }
    printPackage(result, target)
    return
  }

  const text = serialize(result.output)
  const file = path.join(root, OUT_FILE)

  if (mode === '--check') {
    const committed = readCommitted(root)
    if (committed === text) {
      console.log(`✓ ${OUT_FILE} is up to date (${Object.keys(result.output.packages).length} packages)`)
      return
    }
    console.error(`❌ ${OUT_FILE} is stale - run: node common/scripts/env-contract.js`)
    if (committed !== undefined) reportDiff(committed, text)
    process.exit(1)
  }

  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)

  const packages = Object.values(result.output.packages)
  const envNames = new Set()
  let unresolved = 0
  for (const entry of packages) {
    for (const name of entry.env) envNames.add(name)
    unresolved += entry.unresolved.length
  }

  console.log(`✓ ${OUT_FILE}: ${packages.length} packages, ${envNames.size} distinct env names, ${unresolved} unresolved reads`)
  if (result.noImage.length > 0) {
    console.log(`\n⚠️  image not determinable for ${result.noImage.length} deployable package(s):`)
    for (const name of result.noImage) console.log(`  ${name} (${result.output.packages[name].dir})`)
  }
}

function reportDiff (committed, actual) {
  let before
  let after
  try {
    before = JSON.parse(committed)
    after = JSON.parse(actual)
  } catch (err) {
    console.error('  committed file is not valid json')
    return
  }
  const names = new Set([...Object.keys(before.packages ?? {}), ...Object.keys(after.packages ?? {})])
  for (const name of [...names].sort()) {
    const a = before.packages?.[name]
    const b = after.packages?.[name]
    if (a == null) {
      console.error(`  + ${name}`)
      continue
    }
    if (b == null) {
      console.error(`  - ${name}`)
      continue
    }
    for (const field of ['dir', 'image']) {
      if (JSON.stringify(a[field]) !== JSON.stringify(b[field])) {
        console.error(`  ~ ${name}.${field}: ${JSON.stringify(a[field])} -> ${JSON.stringify(b[field])}`)
      }
    }
    for (const field of ['env', 'own', 'shared', 'unresolved']) {
      const added = (b[field] ?? []).filter((it) => !(a[field] ?? []).includes(it))
      const removed = (a[field] ?? []).filter((it) => !(b[field] ?? []).includes(it))
      for (const it of added) console.error(`  ~ ${name}.${field} + ${it}`)
      for (const it of removed) console.error(`  ~ ${name}.${field} - ${it}`)
    }
    for (const bucket of ['envMap', 'direct', 'index']) {
      const added = (b.via?.[bucket] ?? []).filter((it) => !(a.via?.[bucket] ?? []).includes(it))
      const removed = (a.via?.[bucket] ?? []).filter((it) => !(b.via?.[bucket] ?? []).includes(it))
      for (const it of added) console.error(`  ~ ${name}.via.${bucket} + ${it}`)
      for (const it of removed) console.error(`  ~ ${name}.via.${bucket} - ${it}`)
    }
  }
}

if (require.main === module) {
  main()
}

module.exports = { analyzeFile, imageOf }
