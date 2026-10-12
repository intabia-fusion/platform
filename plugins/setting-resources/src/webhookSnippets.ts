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

export const webhookSnippetTools = ['json', 'curl', 'postman', 'python', 'nodejs', 'go', 'powershell'] as const
export type WebhookSnippetTool = (typeof webhookSnippetTools)[number]

export const webhookSnippetToolLabels: Record<WebhookSnippetTool, string> = {
  json: 'JSON',
  curl: 'curl',
  postman: 'Postman',
  python: 'Python',
  nodejs: 'Node.js',
  go: 'Go',
  powershell: 'PowerShell'
}

// JSON string escapes are valid Python literals; only null/true/false are spelled differently.
function pythonLiteral (value: unknown, indent: string): string {
  if (value === null || value === undefined) return 'None'
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  if (typeof value !== 'object') return JSON.stringify(value)
  const inner = indent + '    '
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return `[\n${value.map((v) => inner + pythonLiteral(v, inner)).join(',\n')},\n${indent}]`
  }
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return '{}'
  const lines = entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${pythonLiteral(v, inner)}`)
  return `{\n${lines.join(',\n')},\n${indent}}`
}

function indentLines (text: string, indent: string): string {
  return text
    .split('\n')
    .map((line, i) => (i === 0 ? line : indent + line))
    .join('\n')
}

// `url` is absolute, `key` is the placeholder - snippets never carry a real credential.
export function renderWebhookSnippet (tool: WebhookSnippetTool, url: string, key: string, body: unknown): string {
  const json = JSON.stringify(body, null, 2)
  switch (tool) {
    case 'json':
      return json
    case 'curl':
      return [
        `curl -X POST '${url}' \\`,
        `  -H 'Authorization: Bearer ${key}' \\`,
        "  -H 'Content-Type: application/json' \\",
        `  -d '${json.replace(/'/g, "'\\''")}'`
      ].join('\n')
    case 'postman':
      return [
        `POST ${url}`,
        '',
        'Headers:',
        `  Authorization: Bearer ${key}`,
        '  Content-Type: application/json',
        '',
        'Body > raw > JSON:',
        json
      ].join('\n')
    case 'python':
      return [
        'import requests',
        '',
        'resp = requests.post(',
        `    ${JSON.stringify(url)},`,
        `    headers={"Authorization": "Bearer ${key}"},`,
        `    json=${pythonLiteral(body, '    ')},`,
        '    timeout=30,',
        ')',
        'print(resp.status_code, resp.text)'
      ].join('\n')
    case 'nodejs':
      return [
        '// Node.js 18+, save as send.mjs',
        `const res = await fetch(${JSON.stringify(url)}, {`,
        "  method: 'POST',",
        '  headers: {',
        `    Authorization: 'Bearer ${key}',`,
        "    'Content-Type': 'application/json'",
        '  },',
        `  body: JSON.stringify(${indentLines(json, '  ')})`,
        '})',
        'console.log(res.status, await res.text())'
      ].join('\n')
    case 'go':
      return [
        'package main',
        '',
        'import (',
        '\t"fmt"',
        '\t"io"',
        '\t"net/http"',
        '\t"strings"',
        ')',
        '',
        'func main() {',
        `\tbody := \`${json.replace(/`/g, '` + "`" + `')}\``,
        `\treq, err := http.NewRequest("POST", ${JSON.stringify(url)}, strings.NewReader(body))`,
        '\tif err != nil {',
        '\t\tpanic(err)',
        '\t}',
        `\treq.Header.Set("Authorization", "Bearer ${key}")`,
        '\treq.Header.Set("Content-Type", "application/json")',
        '\tresp, err := http.DefaultClient.Do(req)',
        '\tif err != nil {',
        '\t\tpanic(err)',
        '\t}',
        '\tdefer resp.Body.Close()',
        '\tout, _ := io.ReadAll(resp.Body)',
        '\tfmt.Println(resp.Status, string(out))',
        '}'
      ].join('\n')
    case 'powershell':
      // A single-quoted here-string takes the JSON verbatim; its closing '@ must start the line.
      return [
        "$body = @'",
        json,
        "'@",
        `Invoke-RestMethod -Method Post -Uri '${url}' \``,
        `  -Headers @{ Authorization = 'Bearer ${key}' } \``,
        "  -ContentType 'application/json; charset=utf-8' `",
        '  -Body ([System.Text.Encoding]::UTF8.GetBytes($body))'
      ].join('\n')
  }
}
