const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')
const execSync = require('child_process').execSync
const repo = '@intabiafusion'

const packages = {}
const pathes = {}
const jsons = {}
const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim()

function fillPackages (config) {
  for (const project of config.projects) {
    const packageName = project.name ?? project.packageName
    if (typeof packageName !== 'string' || !packageName.startsWith(repo)) continue
    const projectPath = project.path ?? project.projectFolder ?? path.relative(repoRoot, project.fullPath ?? '')
    if (typeof projectPath !== 'string' || projectPath.length === 0) continue
    const fullProjectPath = path.resolve(repoRoot, projectPath)

    packages[packageName] = {
      version: project.version,
      path: fullProjectPath
    }
    pathes[fullProjectPath] = packageName

    const file = path.join(fullProjectPath, 'package.json')
    if (!fs.existsSync(file)) {
      console.log('skip, package.json not found:', file)
      continue
    }

    const raw = fs.readFileSync(file)
    jsons[packageName] = JSON.parse(raw)
  }
}

function bumpPackage (name, newVersion) {
  const json = jsons[name]

  if (json === undefined) return
  json.version = newVersion
  const depTypes = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
  for (const depType of depTypes) {
    if (typeof json[depType] !== 'object') continue
    for (const [dependency, currentVersion] of Object.entries(json[depType])) {
      if (packages[dependency] !== undefined) {
        json[depType][dependency] = String(currentVersion).startsWith('workspace:')
          ? `workspace:^${newVersion}`
          : `^${newVersion}`
      }
    }
  }
}

function shouldPublish (name) {
  const json = jsons[name]
  return json !== undefined && json.repository !== undefined
}

function sleep (ms) {
  execSync(`sleep ${Math.max(0.1, ms / 1000)}`)
}

function isAlreadyPublished (name, version) {
  // HTTPS HEAD/GET against registry — no rate limit impact like `npm view`.
  return new Promise((resolve) => {
    const registryUrl = process.env.NPM_REGISTRY || 'https://registry.npmjs.org'
    const url = `${registryUrl}/${encodeURIComponent(name)}/${version}`
    const client = url.startsWith('https:') ? https : http
    const req = client.get(url, (res) => {
      resolve(res.statusCode === 200)
      res.resume()
    })
    req.on('error', () => resolve(false))
    req.setTimeout(5000, () => { req.destroy(); resolve(false) })
  })
}

function normalizeWorkspaceDeps (packagePath) {
  // npm publish rejects workspace: ranges. Rewrite to plain semver, return original for restore.
  const packageJsonPath = path.join(packagePath, 'package.json')
  let original = null
  try {
    original = fs.readFileSync(packageJsonPath, 'utf8')
    const pkg = JSON.parse(original)
    const depFields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
    let changed = false
    for (const field of depFields) {
      const deps = pkg[field]
      if (!deps || typeof deps !== 'object') continue
      for (const [n, range] of Object.entries(deps)) {
        if (typeof range === 'string' && range.startsWith('workspace:')) {
          deps[n] = range.replace(/^workspace:/, '')
          changed = true
        }
      }
    }
    if (changed) {
      fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
    }
  } catch (err) {
    console.warn(`normalize failed for ${packagePath}: ${err.message}`)
  }
  return original
}

function restorePackageJson (packagePath, original) {
  if (original == null) return
  try {
    fs.writeFileSync(path.join(packagePath, 'package.json'), original, 'utf8')
  } catch (err) {
    console.warn(`restore failed for ${packagePath}: ${err.message}`)
  }
}

async function publish (name) {
  const package = packages[name]
  const version = jsons[name] && jsons[name].version
  if (version && await isAlreadyPublished(name, version)) {
    console.log('skip (already published):', name + '@' + version)
    return
  }
  let attempt = 0
  let backoff = 10000
  while (true) {
    attempt++
    const original = normalizeWorkspaceDeps(package.path)
    try {
      console.log(`publishing ${name} (attempt ${attempt})`)
      execSync('npm publish --access public 2>&1', { encoding: 'utf-8', cwd: package.path })
      console.log('published:', name)
      restorePackageJson(package.path, original)
      return
    } catch (err) {
      restorePackageJson(package.path, original)
      const output = String((err.stdout || '') + (err.stderr || '') + (err.message || ''))
      process.stdout.write(output)
      const rateLimited = output.includes('E429') || output.includes('rate limit')
      const alreadyPublished = output.includes('cannot publish over') || (output.includes('E403') && output.includes('previously published'))
      if (alreadyPublished) {
        console.log('skip (already published):', name)
        return
      }
      if (rateLimited) {
        console.log(`rate-limited, backoff ${backoff}ms then retry (attempt ${attempt})`)
        sleep(backoff)
        backoff = Math.min(backoff * 2, 300000) // cap at 5min
        continue
      }
      // Non-retryable error — give up on this pkg.
      console.log('publish failed (non-retryable):', name)
      return
    }
  }
}

function fix (name) {
  const package = packages[name]
  try {
    console.log('fixing', name)
    execSync('npm pkg fix', { encoding: 'utf-8', cwd: package.path })
  } catch (err) {
    console.log(err)
  }
}

async function main () {
  const args = process.argv

  const doFix = args.includes('--fix')
  const doPublish = args.includes('--publish')
  const doDry = args.includes('--dry') || args.includes('--dry-run')

  const version = args.reverse().find((a) => !a.startsWith('--') && !a.endsWith('bump.js') && !a.endsWith('node'))
  if (version === undefined || version === '') {
    console.log('usage: node bump.js [--dry] [--fix] [--publish] <version>')
    return
  }
  if( !/^(\d+\.)?(\d+\.)?(\*|\d+)$/.test(version)) {
    console.log('Invalid <version>', version, ' should be xx.xx.xx')
    return
  }

  console.log('bump version ...', version)

  const output = execSync('node common/scripts/install-run-rush.js list -p --json', { encoding: 'utf-8', cwd: repoRoot })
  const lines = output.split('\n')
  let jsonStart = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('{')) {
      jsonStart = i
      break
    }
  }
  if (jsonStart === -1) {
    console.error('Could not find JSON output from rush list')
    process.exit(1)
  }
  const config = JSON.parse(lines.slice(jsonStart).join('\n'))

  fillPackages(config)

  const packageNames = Object.keys(packages)
  for (const packageName of packageNames) {
    bumpPackage(packageName, version)
  }

  let writeCount = 0
  for (const packageName of packageNames) {
    const package = packages[packageName]
    if (jsons[packageName] === undefined) continue
    const file = path.join(package.path, 'package.json')
    const res = JSON.stringify(jsons[packageName], undefined, 2)
    if (doDry) {
      writeCount++
    } else {
      fs.writeFileSync(file, res + '\n')
    }
  }
  if (doDry) {
    console.log('dry-run: would write', writeCount, 'package.json files. Publishable:',
      packageNames.filter(shouldPublish).length)
    return
  }
  if (doFix) {
    for (const packageName of packageNames) {
      if (shouldPublish(packageName)) {
        fix(packageName)
      }
    }
  }
  if (doPublish) {
    const fromArg = args.find((a) => a.startsWith('--from='))
    let toPublish
    if (fromArg) {
      const roots = fromArg.slice('--from='.length).split(',').map((s) => s.trim()).filter(Boolean)
      const needed = new Set()
      const visit = (n) => {
        if (needed.has(n)) return
        const j = jsons[n]
        if (!j) return
        needed.add(n)
        for (const f of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
          for (const d of Object.keys(j[f] || {})) if (d.startsWith(repo + '/')) visit(d)
        }
      }
      for (const r of roots) visit(r)
      toPublish = [...needed].filter(shouldPublish)
      console.log(`--from filter: ${roots.length} roots -> ${needed.size} transitive -> ${toPublish.length} publishable`)
    } else {
      toPublish = packageNames.filter(shouldPublish)
    }
    let i = 0
    for (const packageName of toPublish) {
      i++
      console.log(`\n===== [${i}/${toPublish.length}] ${packageName} =====`)
      await publish(packageName)
      if (i < toPublish.length) sleep(3000) // throttle to avoid E429
    }
    console.log(`\nDone. Attempted ${toPublish.length} packages.`)
  }

  console.log('... done')
}

main().catch((err) => { console.error(err); process.exit(1) })
