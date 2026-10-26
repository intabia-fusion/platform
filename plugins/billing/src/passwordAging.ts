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

type Listener = (value: boolean) => void

// Plain store contract instead of svelte/store: this package is imported by models and reaches
// node-only jest runs, where svelte's ESM store cannot be parsed.
const listeners = new Set<Listener>()
let passwordAgain = false

export const isPasswordAgain = {
  subscribe (run: Listener): () => void {
    listeners.add(run)
    run(passwordAgain)
    return () => {
      listeners.delete(run)
    }
  }
}

export function setIsPasswordAgain (value: boolean): void {
  if (value === passwordAgain) {
    return
  }
  passwordAgain = value
  for (const run of [...listeners]) {
    run(passwordAgain)
  }
}
