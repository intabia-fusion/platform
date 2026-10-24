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

/**
 * Marks `node` with `className` while the focus inside it came from a click: a clicked row keeps the focus,
 * and any later key (a shortcut) would light its focus ring. Tab clears the mark, so keyboard focus still shows.
 */
export function pointerFocus (node: HTMLElement, className: string): { destroy: () => void } {
  const mark = (): void => {
    node.classList.add(className)
  }
  const clear = (): void => {
    node.classList.remove(className)
  }
  const onFocusOut = (event: FocusEvent): void => {
    if (!(event.relatedTarget instanceof Node && node.contains(event.relatedTarget))) clear()
  }
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Tab') clear()
  }
  node.addEventListener('mousedown', mark)
  node.addEventListener('focusout', onFocusOut)
  node.addEventListener('keydown', onKeydown)
  return {
    destroy: () => {
      node.removeEventListener('mousedown', mark)
      node.removeEventListener('focusout', onFocusOut)
      node.removeEventListener('keydown', onKeydown)
    }
  }
}
