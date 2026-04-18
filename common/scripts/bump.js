const fs = require('fs')
const path = require('path')
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
  try {
    const out = execSync(`npm view ${name}@${version} version`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
    return out.trim() === version
  } catch {
    return false
  }
}

function publish (name) {
  const package = packages[name]
  const version = jsons[name] && jsons[name].version
  if (version && isAlreadyPublished(name, version)) {
    console.log('skip (already published):', name + '@' + version)
    return
  }
  const maxAttempts = 5
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`publishing ${name} (attempt ${attempt}/${maxAttempts})`)
      execSync('pnpm publish --no-git-checks --access public', { encoding: 'utf-8', cwd: package.path, stdio: 'inherit' })
      return
    } catch (err) {
      const msg = String(err.message || '')
      const rateLimited = msg.includes('E429') || msg.includes('rate limit')
      const alreadyPublished = msg.includes('cannot publish over') || msg.includes('E403') && msg.includes('previously published')
      if (alreadyPublished) {
        console.log('skip (already published):', name)
        return
      }
      if (!rateLimited || attempt === maxAttempts) {
        console.log('publish failed:', name, msg.split('\n')[0])
        return
      }
      const backoff = 5000 * attempt
      console.log(`rate-limited, backoff ${backoff}ms then retry`)
      sleep(backoff)
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

function main () {
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
    const toPublish = packageNames.filter(shouldPublish)
    let i = 0
    for (const packageName of toPublish) {
      i++
      console.log(`\n===== [${i}/${toPublish.length}] ${packageName} =====`)
      publish(packageName)
      if (i < toPublish.length) sleep(1500) // throttle to avoid E429
    }
    console.log(`\nDone. Attempted ${toPublish.length} packages.`)
  }

  console.log('... done')
}

main ()
