/**
  Copyright © 2026 Intabia Fusion.

  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may
  obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
  
  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  
  See the License for the specific language governing permissions and
  limitations under the License.
*/

// ANSI color codes
const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
}

function color(text, colorCode) {
  return `${colorCode}${text}${COLORS.reset}`
}

function success(text) { return color(text, COLORS.green) }
function error(text) { return color(text, COLORS.red) }
function warn(text) { return color(text, COLORS.yellow) }
function info(text) { return color(text, COLORS.cyan) }
function dim(text) { return color(text, COLORS.dim) }
function bold(text) { return color(text, COLORS.bold) }

/**
 * Colorize error message: highlight file paths and ERROR/FAILED keywords
 * Returns object with plain path for terminal links and colored message
 */
function colorizeErrorMessage(msg) {
  if (!msg) return { plain: msg, colored: msg }
  
  let plainPath = ''
  let coloredMsg = msg
  
  // Extract file paths with location info: /path/to/file.ts(17,3)
  const pathWithLocationRegex = /([\/\w.~-]*\/[\w.~-]+\.\w+)\((\d+,\d+)\)/g
  const match = pathWithLocationRegex.exec(msg)
  
  if (match) {
    plainPath = match[1] + '(' + match[2] + ')'
    // Don't add ANSI codes to the path - keep it plain for terminal links
    coloredMsg = msg.replace(pathWithLocationRegex, (m, path, location) => {
      return `${path}(${location})`
    })
  } else {
    // Try to find standalone file paths
    const pathOnlyRegex = /([\/\w.~-]+\/[\w.~-]+\.\w+)/g
    const pathMatch = pathOnlyRegex.exec(msg)
    if (pathMatch) {
      plainPath = pathMatch[1]
    }
  }
  
  // Highlight ERROR/FAILED keywords in the message
  coloredMsg = coloredMsg.replace(/\b(ERROR|FAILED|failure)\b/gi, (match) => {
    return `\x1b[31m${match}\x1b[0m`
  })
  
  return { plain: plainPath, colored: coloredMsg }
}

module.exports = {
  COLORS,
  color,
  success,
  error,
  warn,
  info,
  dim,
  bold,
  colorizeErrorMessage
}
