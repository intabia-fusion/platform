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

import { Editor, Extension, Mark, Node } from '@tiptap/core'

// Guards common/pnpm-patches/@tiptap__core@2.27.1.patch: a module-level extension must not keep
// the copy configured for an editor, or the destroyed editor stays reachable through its options.
describe('tiptap extension child links', () => {
  it('configure() does not leave the configured copy in child', () => {
    const onChange = jest.fn()
    for (const base of [
      Extension.create<{ onChange?: () => void }>({ name: 'ext' }),
      Mark.create<{ onChange?: () => void }>({ name: 'mark' }),
      Node.create<{ onChange?: () => void }>({ name: 'node' })
    ]) {
      const configured = base.configure({ onChange })
      expect(configured.options.onChange).toBe(onChange)
      expect(base.child).toBeNull()
    }
  })

  it('Editor.destroy() clears child links along the extend() chain', () => {
    const root = Extension.create({ name: 'root' })
    const child = root.extend({})
    const grandchild = child.extend({})
    expect(root.child).toBe(child)

    // The real Editor needs a DOM; destroy() only touches these fields.
    const editor = {
      emit: jest.fn(),
      removeAllListeners: jest.fn(),
      extensionManager: { extensions: [grandchild] }
    }
    Editor.prototype.destroy.call(editor)

    expect(root.child).toBeNull()
    expect(child.child).toBeNull()
    expect(grandchild.parent).toBe(child)
  })
})
