//
// Copyright © 2026 Intabia Fusion.
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

const fs = require('fs')

// Blink and V8 store a script source as UTF-16 if it has a single non-Latin-1 char, else as 8-bit.
// esbuild `charset: 'ascii'` leaves such chars in regex literals; these helpers escape the rest.
const nonLatin1 = /[^\x00-\xff]/g
const escapeChar = (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')

// Shifts sourcemap columns on the few lines it touches.
function escapeNonLatin1File (file) {
  const text = fs.readFileSync(file, 'utf8')
  if (!/[^\x00-\xff]/.test(text)) return
  fs.writeFileSync(file, text.replace(nonLatin1, escapeChar))
}

class EscapeNonLatin1Plugin {
  apply (compiler) {
    const { Compilation, sources } = compiler.webpack
    compiler.hooks.compilation.tap('EscapeNonLatin1Plugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        { name: 'EscapeNonLatin1Plugin', stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE + 1 },
        (assets) => {
          for (const name of Object.keys(assets)) {
            if (!name.endsWith('.js')) continue
            const text = assets[name].source().toString()
            if (!/[^\x00-\xff]/.test(text)) continue
            const replaced = new sources.ReplaceSource(assets[name])
            for (const m of text.matchAll(nonLatin1)) {
              replaced.replace(m.index, m.index, escapeChar(m[0]))
            }
            compilation.updateAsset(name, replaced)
          }
        }
      )
    })
  }
}

module.exports = { EscapeNonLatin1Plugin, escapeNonLatin1File }
