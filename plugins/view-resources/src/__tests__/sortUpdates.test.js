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

/* eslint-disable @typescript-eslint/no-var-requires -- Jest runs this Node-only test as CommonJS. */
const { reduceCalls } = require('@hcengineering/core')
const { readFileSync } = require('fs')
const { resolve } = require('path')
const { runInNewContext } = require('vm')
const { compile } = require('svelte/compiler')
const ts = require('typescript')
/* eslint-enable @typescript-eslint/no-var-requires */

describe.each(['../components/list/List.svelte', '../../../tracker-resources/src/components/issues/KanbanView.svelte'])(
  '%s sorting updates',
  (file) => {
    // Run the production block through Svelte: the package's normal .svelte mapper replaces components with mocks.
    const source = readFileSync(resolve(__dirname, file), 'utf8')
    const block = source.match(/ {2}let sortValue:[\s\S]*?(?=\n {2}(?:const docsQuery|\$: resultOptions))/)?.[0]
    if (block === undefined) throw new Error(`Sort block missing in ${file}`)
    const script = ts.transpileModule(
      `export let orderBy, space, _class, viewlet, client, reduceCalls, buildSortRules, hasSortRules;
    ${block}
    export function currentSort() { return { value: sortValue, ready: sortReady }; }`,
      { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }
    ).outputText
    const compiled = compile(`<script>${script}</script>`, { generate: 'dom' })
    const generated = ts.createSourceFile('sort.js', compiled.js.code, ts.ScriptTarget.ES2022)
    const instance = generated.statements.find(
      (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'instance'
    )
    if (instance === undefined) throw new Error(`Svelte instance missing in ${file}`)
    const createInstance = runInNewContext(`${instance.getText(generated)}; instance`, { console })

    it.each(['modifiedOn', undefined, 'kind'])('ignores stale priority rules after switching to %s', async (key) => {
      const pending = []
      const buildSortRules = jest.fn(async () => await new Promise((resolve) => pending.push(resolve)))
      const component = { $$: { dirty: [-1], update: () => {} }, $$set: (_props) => {} }
      const context = createInstance(
        component,
        {
          orderBy: ['priority', 1],
          space: 'project',
          _class: 'issue',
          viewlet: { descriptor: 'viewlet' },
          client: {},
          reduceCalls,
          buildSortRules,
          hasSortRules: (_client, _class, key) => key === 'priority' || key === 'kind'
        },
        (_index, value) => value
      )
      const currentSort = context.find((value) => typeof value === 'function' && value.name === 'currentSort')
      component.$$.update()
      await new Promise((resolve) => setImmediate(resolve))
      expect(buildSortRules).toHaveBeenCalledTimes(1)
      component.$$set({ orderBy: key === undefined ? undefined : [key, -1] })
      component.$$.update()
      await new Promise((resolve) => setImmediate(resolve))
      const rules = { order: 1, default: 1, cases: [{ query: 'urgent', index: 0 }] }
      pending[0](rules)
      await new Promise((resolve) => setImmediate(resolve))

      if (key === 'kind') {
        expect(currentSort()).toEqual({ value: undefined, ready: false })
        expect(buildSortRules).toHaveBeenCalledTimes(2)
        const nextRules = { order: -1, default: 1, cases: [{ query: 'bug', index: 0 }] }
        pending[1](nextRules)
        await new Promise((resolve) => setImmediate(resolve))
        expect(currentSort()).toEqual({ value: { kind: nextRules }, ready: true })
      } else {
        expect(currentSort()).toEqual({ value: key === undefined ? undefined : { modifiedOn: -1 }, ready: true })
      }
    })
  }
)
