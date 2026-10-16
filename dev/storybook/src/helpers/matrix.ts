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

import type { ComponentType } from 'svelte'

/** A matrix row or column: its title and the props it adds to every cell. */
export interface MatrixLine {
  title: string
  props: Record<string, unknown>
}

export type MatrixAxis = MatrixLine[]

/** One matrix axis per value of a single prop: `axis('kind', ['primary', 'secondary'])`. */
export function axis (prop: string, values: readonly unknown[]): MatrixAxis {
  return values.map((value) => ({ title: String(value), props: { [prop]: value } }))
}

/** One titled matrix of a variants overview. */
export interface MatrixSection {
  title: string
  component: ComponentType
  rows: MatrixAxis
  columns: MatrixAxis
  props?: Record<string, unknown>
}
