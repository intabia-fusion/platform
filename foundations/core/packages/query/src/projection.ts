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

import core, { type Doc, type FindOptions, type Tx, type TxMixin, type TxUpdateDoc } from '@hcengineering/core'

export type AnyProjection = Record<string, any>

const LOOKUP = '$lookup.'

// Needed of every result document to match, sort and patch it.
const liveQueryFields = ['_class', 'space', 'modifiedOn'] as const

export function isLookupKey (key: string): boolean {
  return key.startsWith(LOOKUP)
}

// Only an inclusion of the base document gets them; an exclusion just stops listing them, and nothing
// left means no projection, since `{}` would read as an inclusion of `_id` and `_class` alone.
export function withLiveQueryFields (projection: AnyProjection | undefined): AnyProjection | undefined {
  if (projection == null) return undefined
  const keys = Object.keys(projection)
  // As before: an empty projection becomes the live query fields alone
  if (keys.length === 0) return { _class: 1, space: 1, modifiedOn: 1 }
  const baseKeys = keys.filter((key) => !isLookupKey(key))
  if (baseKeys.length === 0) return projection
  if (baseKeys.every((key) => projection[key] === 0)) {
    const res = { ...projection }
    for (const key of liveQueryFields) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete res[key]
    }
    return Object.keys(res).length > 0 ? res : undefined
  }
  return { ...projection, _class: 1, space: 1, modifiedOn: 1 }
}

// No `projection` key when nothing is left of it: callers compare options by deep equality.
export function withLiveQueryOptions<T extends Doc> (options: FindOptions<T> | undefined): FindOptions<T> | undefined {
  if (options?.projection == null) return options
  const projection = withLiveQueryFields(options.projection)
  if (projection == null) {
    const { projection: _, ...rest } = options
    return rest
  }
  return { ...options, projection: projection as FindOptions<T>['projection'] }
}

// `$lookup.<key>.` cut off: a nested `$lookup.<inner>.<field>` becomes a lookup key of that document.
export function lookupProjection (projection: AnyProjection | undefined, key: string): AnyProjection | undefined {
  if (projection == null) return undefined
  const prefix = `${LOOKUP}${key}.`
  let res: AnyProjection | undefined
  for (const pkey in projection) {
    if (!pkey.startsWith(prefix)) continue
    res ??= {}
    res[pkey.substring(prefix.length)] = projection[pkey]
  }
  return res
}

// The keys under `objWay` (`$lookup.a`, `$lookup.a.$lookup.b`) with the prefix cut off; `''` is the result document.
export function projectionAt (projection: AnyProjection | undefined, objWay: string): AnyProjection | undefined {
  if (projection == null || objWay === '') return projection
  const prefix = `${objWay}.`
  let res: AnyProjection | undefined
  for (const pkey in projection) {
    if (!pkey.startsWith(prefix)) continue
    res ??= {}
    res[pkey.substring(prefix.length)] = projection[pkey]
  }
  return res
}

export interface LookupFieldSet {
  fields: Set<string>
  exclude: boolean
}

// Only zeros exclude, any one includes with the zeros ignored; undefined means the join is whole.
export function lookupFields (
  projection: AnyProjection | undefined,
  objWay: string,
  key: string
): LookupFieldSet | undefined {
  if (projection == null) return undefined
  const prefix = `${objWay === '' ? '' : objWay + '.'}${LOOKUP}${key}.`
  const values: AnyProjection = {}
  for (const pkey in projection) {
    if (!pkey.startsWith(prefix)) continue
    const field = pkey.substring(prefix.length)
    if (field === '' || isLookupKey(field)) continue
    values[field] = projection[pkey]
  }
  const names = Object.keys(values)
  if (names.length === 0) return undefined
  const exclude = names.every((field) => values[field] === 0)
  return {
    fields: new Set(exclude ? names : names.filter((field) => values[field] !== 0)),
    exclude
  }
}

// Operation keys, the keys under operators, and for a mixin both spellings of an attribute.
export function touchedAttributes (tx: Tx): string[] {
  if (tx._class === core.class.TxMixin) {
    const mixinTx = tx as TxMixin<Doc, Doc>
    const keys = Object.keys(mixinTx.attributes ?? {})
    return [...keys, ...keys.map((key) => `${mixinTx.mixin}.${key}`)]
  }
  const operations = (tx as TxUpdateDoc<Doc>).operations ?? {}
  const res: string[] = []
  for (const key in operations) {
    if (key.startsWith('$')) {
      const nested = (operations as any)[key]
      if (typeof nested === 'object' && nested !== null) res.push(...Object.keys(nested))
    } else {
      res.push(key)
    }
  }
  return res
}

function sameField (a: string, b: string): boolean {
  return a === b || a.startsWith(b + '.') || b.startsWith(a + '.')
}

// A mixin id has colons and no dots, an attribute path has no colons.
function bareName (attr: string): string {
  return attr.includes(':') ? attr.substring(attr.indexOf('.') + 1) : attr
}

function named (fields: Set<string>, attr: string): boolean {
  const bare = bareName(attr)
  return Array.from(fields).some((field) => sameField(attr, field) || sameField(bare, bareName(field)))
}

export function txTouchesProjected (fields: LookupFieldSet, tx: Tx): boolean {
  const touched = touchedAttributes(tx)
  if (fields.exclude) {
    return touched.some((attr) => !named(fields.fields, attr))
  }
  return touched.some((attr) => named(fields.fields, attr))
}
