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

// Their own module, with no imports: utils.ts pulls in the package index, so anything importing a
// caller from there gets `undefined` when it is itself part of that cycle (resize.ts, lazy.ts).

/**
 * @public
 */
export class DelayedCaller {
  op?: () => void
  constructor (readonly delay: number = 10) {}
  call (op: () => void): void {
    const needTimer = this.op === undefined
    this.op = op
    if (needTimer) {
      setTimeout(() => {
        this.op?.()
        this.op = undefined
      }, this.delay)
    }
  }
}
