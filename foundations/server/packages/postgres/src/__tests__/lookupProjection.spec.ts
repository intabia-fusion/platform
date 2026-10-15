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

import { MeasureMetricsContext } from '@hcengineering/core'
import { PostgresAdapter } from '../storage'
import { splitProjection, type JoinProps, type LookupFieldSet } from '../utils'

// `$lookup.<path>.<field>` projection keys cut a join down to the listed fields (`1`) or to everything
// but them (`0`): the SELECT names only those columns, jsonb keys through jsonb_build_object or the
// `-` operator, and a partial joined row is parsed like a full one, numeric columns included.
describe('lookup projection', () => {
  const ctx = new MeasureMetricsContext('test', {})
  const adapter = Object.create(PostgresAdapter.prototype)
  const vars = { add: () => '$1' }

  const include = (...fields: string[]): LookupFieldSet => ({ fields: new Set(fields), exclude: false })
  const exclude = (...fields: string[]): LookupFieldSet => ({ fields: new Set(fields), exclude: true })

  const direct: JoinProps = {
    table: 'notification_read_state',
    path: 'readState',
    fromAlias: 'chunter_doc',
    fromField: 'readState',
    toAlias: 'lookup_notification_read_state_readState',
    toField: '_id',
    isReverse: false
  }

  const reverse: JoinProps = {
    table: 'contact_channel',
    path: 'channels',
    fromAlias: 'contact',
    fromField: '_id',
    toAlias: 'reverse_lookup_contact_channel_channels',
    toField: 'attachedTo',
    isReverse: true,
    classes: ['contact:class:Channel' as any]
  }

  describe('splitProjection', () => {
    it('separates lookup keys by join path from the base projection', () => {
      const { base, lookup } = splitProjection({
        name: 1,
        '$lookup.attachedTo.title': 1,
        '$lookup.attachedTo.archived': 1,
        '$lookup.attachedTo.$lookup.space.name': 1
      } as any)
      expect(base).toEqual({ name: 1 })
      expect(lookup?.get('attachedTo')).toEqual(include('title', 'archived'))
      expect(lookup?.get('attachedTo.space')).toEqual(include('name'))
    })

    it('leaves the base document whole when only lookup keys are given', () => {
      const { base, lookup } = splitProjection({ '$lookup.readState.latestMessageTimestamp': 1 } as any)
      expect(base).toBeUndefined()
      expect(lookup?.get('readState')).toEqual(include('latestMessageTimestamp'))
    })

    it('passes undefined through', () => {
      expect(splitProjection(undefined)).toEqual({ base: undefined, lookup: undefined })
    })

    it('reads a path with only zeros as exclusion, apart from the base mode', () => {
      const { base, lookup } = splitProjection({
        description: 0,
        '$lookup.attachedTo.name': 0,
        '$lookup.attachedTo.date': 0,
        '$lookup.space.name': 1
      } as any)
      expect(base).toEqual({ description: 0 })
      expect(lookup?.get('attachedTo')).toEqual(exclude('name', 'date'))
      expect(lookup?.get('space')).toEqual(include('name'))
    })

    it('reads a mixed path as inclusion and drops its zeros', () => {
      const { lookup } = splitProjection({ '$lookup.attachedTo.name': 1, '$lookup.attachedTo.date': 0 } as any)
      expect(lookup?.get('attachedTo')).toEqual(include('name'))
    })

    it('skips malformed lookup keys', () => {
      const { base, lookup } = splitProjection({ $lookup: 1, '$lookup.attachedTo': 1 } as any)
      expect(base).toBeUndefined()
      expect(lookup).toBeUndefined()
    })
  })

  describe('SELECT of the base document', () => {
    it('keeps every column but the excluded ones and the jsonb payload', () => {
      const sql: string = adapter.getProjection(vars, 'chunter_doc', { hidden: 0, title: 0 }, [])
      expect(sql).toContain('chunter_doc."_id" AS "_id"')
      expect(sql).toContain('chunter_doc."pinned" AS "pinned"')
      expect(sql).toContain('chunter_doc."modifiedOn" AS "modifiedOn"')
      expect(sql).toContain('chunter_doc.data as data')
      expect(sql).not.toContain('"hidden"')
      expect(sql).not.toContain('chunter_doc.*')
    })

    it('leaves a zero out of an inclusion projection', () => {
      const sql: string = adapter.getProjection(vars, 'chunter_doc', { pinned: 1, hidden: 0 }, [])
      expect(sql).toContain('chunter_doc."pinned" AS "pinned"')
      expect(sql).not.toContain('"hidden"')
      expect(sql).not.toContain('data')
    })
  })

  describe('SELECT of a join', () => {
    it('selects every column of a join without a lookup projection, as before', () => {
      const sql: string = adapter.getProjection(vars, 'chunter_doc', undefined, [direct])
      expect(sql).toContain('chunter_doc.*')
      expect(sql).toContain(`${direct.toAlias}."modifiedOn" as "${direct.toAlias}_modifiedOn"`)
      expect(sql).toContain(`${direct.toAlias}."data" as "${direct.toAlias}_data"`)
    })

    it('selects only the listed columns of a direct join with _id, _class and space, _id first', () => {
      const sql: string = adapter.getProjection(
        vars,
        'chunter_doc',
        undefined,
        [direct],
        new Map([['readState', include('latestMessageTimestamp', 'latestMessageId')]])
      )
      expect(sql).toContain('chunter_doc.*')
      const idColumn = `${direct.toAlias}."_id" as "${direct.toAlias}__id"`
      expect(sql.indexOf(idColumn)).toBeGreaterThan(0)
      expect(sql.indexOf(idColumn)).toBeLessThan(sql.indexOf('latestMessageTimestamp'))
      expect(sql).toContain(`${direct.toAlias}."_class" as "${direct.toAlias}__class"`)
      expect(sql).toContain(`${direct.toAlias}."space" as "${direct.toAlias}_space"`)
      expect(sql).toContain(`${direct.toAlias}."latestMessageTimestamp" as "${direct.toAlias}_latestMessageTimestamp"`)
      expect(sql).toContain(`${direct.toAlias}."latestMessageId" as "${direct.toAlias}_latestMessageId"`)
      expect(sql).not.toContain('modifiedOn')
      expect(sql).not.toContain('"data"')
    })

    it('builds the data column of a direct join from the listed jsonb keys only', () => {
      const sql: string = adapter.getProjection(
        vars,
        'chunter_doc',
        undefined,
        [direct],
        new Map([['readState', include('latestMessageTimestamp', 'title')]])
      )
      expect(sql).toContain(
        `jsonb_build_object('title', ${direct.toAlias}."data"->'title') as "${direct.toAlias}_data"`
      )
      expect(sql).not.toContain(`${direct.toAlias}."data" as`)
    })

    it('excludes columns and jsonb keys of a direct join, keeping the rest', () => {
      const sql: string = adapter.getProjection(
        vars,
        'chunter_doc',
        undefined,
        [direct],
        new Map([['readState', exclude('latestMessageId', 'title')]])
      )
      const idColumn = `${direct.toAlias}."_id" as "${direct.toAlias}__id"`
      expect(sql.indexOf(idColumn)).toBeLessThan(sql.indexOf(`${direct.toAlias}."modifiedOn"`))
      expect(sql).toContain(`${direct.toAlias}."latestMessageTimestamp" as "${direct.toAlias}_latestMessageTimestamp"`)
      expect(sql).not.toContain('latestMessageId')
      expect(sql).toContain(`(${direct.toAlias}."data" - ARRAY['title']::text[]) as "${direct.toAlias}_data"`)
    })

    it('excludes only columns of a direct join and keeps the jsonb payload whole', () => {
      const sql: string = adapter.getProjection(
        vars,
        'chunter_doc',
        undefined,
        [direct],
        new Map([['readState', exclude('latestMessageId')]])
      )
      expect(sql).toContain(`${direct.toAlias}."data" as "${direct.toAlias}_data"`)
      expect(sql).not.toContain('latestMessageId')
    })

    it('aggregates a reverse join from the listed fields in row shape', () => {
      const sql: string = adapter.getProjection(
        vars,
        'contact',
        undefined,
        [reverse],
        new Map([['channels', include('lastMessage')]])
      )
      expect(sql).not.toContain(`jsonb_agg(${reverse.toAlias}.*)`)
      expect(sql).toContain(
        `'_id', ${reverse.toAlias}."_id", '_class', ${reverse.toAlias}."_class", 'space', ${reverse.toAlias}."space"`
      )
      expect(sql).toContain(`'data', jsonb_build_object('lastMessage', ${reverse.toAlias}."data"->'lastMessage')`)
      expect(sql).toContain(`AS ${reverse.toAlias}`)
    })

    it('aggregates a reverse join without the excluded fields', () => {
      const sql: string = adapter.getProjection(
        vars,
        'contact',
        undefined,
        [reverse],
        new Map([['channels', exclude('value', 'modifiedOn')]])
      )
      expect(sql).toContain(`'_id', ${reverse.toAlias}."_id"`)
      expect(sql).toContain(`'createdOn', ${reverse.toAlias}."createdOn"`)
      expect(sql).not.toContain("'modifiedOn'")
      expect(sql).toContain(`'data', (${reverse.toAlias}."data" - ARRAY['value']::text[])`)
    })

    it('leaves a join whole when the projection names another path', () => {
      const sql: string = adapter.getProjection(
        vars,
        'chunter_doc',
        undefined,
        [direct],
        new Map([['preview', include('title')]])
      )
      expect(sql).toContain(`${direct.toAlias}."data" as "${direct.toAlias}_data"`)
      expect(sql).toContain(`${direct.toAlias}."modifiedOn"`)
    })

    it('names _id and _class once when the projection lists them', () => {
      const sql: string = adapter.getProjection(
        vars,
        'chunter_doc',
        undefined,
        [direct],
        new Map([['readState', include('_id', '_class', 'latestMessageTimestamp')]])
      )
      expect(sql.split(`${direct.toAlias}."_id" as`).length - 1).toBe(1)
      expect(sql.split(`${direct.toAlias}."_class" as`).length - 1).toBe(1)
      expect(sql).toContain(`${direct.toAlias}."latestMessageTimestamp"`)
    })

    it('keeps _id, _class and space of a join under an exclusion naming them', () => {
      const sql: string = adapter.getProjection(
        vars,
        'chunter_doc',
        undefined,
        [direct],
        new Map([['readState', exclude('_id', '_class', 'space', 'latestMessageId')]])
      )
      expect(sql).toContain(`${direct.toAlias}."_id" as "${direct.toAlias}__id"`)
      expect(sql).toContain(`${direct.toAlias}."_class" as "${direct.toAlias}__class"`)
      expect(sql).toContain(`${direct.toAlias}."space" as "${direct.toAlias}_space"`)
      expect(sql).not.toContain('latestMessageId')
    })

    it('keeps a nested jsonb path of a direct join by its top key, whole', () => {
      const sql: string = adapter.getProjection(
        vars,
        'chunter_doc',
        undefined,
        [direct],
        new Map([['readState', include('icon.asset', 'icon.emoji', 'title')]])
      )
      expect(sql).toContain(
        `jsonb_build_object('icon', ${direct.toAlias}."data"->'icon', 'title', ${direct.toAlias}."data"->'title') as "${direct.toAlias}_data"`
      )
      expect(sql).not.toContain("'icon.asset'")
    })

    it('leaves the jsonb payload of a join whole when an exclusion names a nested path', () => {
      const sql: string = adapter.getProjection(
        vars,
        'chunter_doc',
        undefined,
        [direct],
        new Map([['readState', exclude('icon.asset')]])
      )
      expect(sql).toContain(`${direct.toAlias}."data" as "${direct.toAlias}_data"`)
      expect(sql).not.toContain('ARRAY[')
    })

    it('projects two direct joins each by its own fields', () => {
      const second: JoinProps = {
        table: 'doc_preview',
        path: 'preview',
        fromAlias: 'chunter_doc',
        fromField: 'preview',
        toAlias: 'lookup_doc_preview_preview',
        toField: '_id',
        isReverse: false
      }
      const sql: string = adapter.getProjection(
        vars,
        'chunter_doc',
        undefined,
        [direct, second],
        new Map([
          ['readState', include('latestMessageTimestamp')],
          ['preview', include('title')]
        ])
      )
      expect(sql).toContain(`${direct.toAlias}."latestMessageTimestamp"`)
      expect(sql).not.toContain(`${direct.toAlias}."data"`)
      expect(sql).toContain(
        `jsonb_build_object('title', ${second.toAlias}."data"->'title') as "${second.toAlias}_data"`
      )
      expect(sql).not.toContain(`${second.toAlias}."modifiedOn"`)
      // Each join starts with its own _id: that is what parseLookupColumns counts joins by.
      expect(sql.indexOf(`${direct.toAlias}."_id" as`)).toBeLessThan(sql.indexOf(`${second.toAlias}."_id" as`))
    })

    it('keeps the base projection apart from the lookup one', () => {
      const sql: string = adapter.getProjection(
        vars,
        'chunter_doc',
        { pinned: 1 },
        [direct],
        new Map([['readState', include('latestMessageTimestamp')]])
      )
      expect(sql).not.toContain('chunter_doc.*')
      expect(sql).toContain('chunter_doc."pinned" AS "pinned"')
      expect(sql).toContain(`${direct.toAlias}."latestMessageTimestamp"`)
    })
  })

  describe('ORDER BY a join field', () => {
    // A missing joined row is NULL, which Postgres puts first in DESC order: a join field sorts
    // its NULLs last whichever way, a field of the base document is ordered as before.
    const orderAdapter = Object.create(PostgresAdapter.prototype)
    orderAdapter.hierarchy = { findAttribute: () => undefined }
    orderAdapter.dbFlavor = 'postgres'

    it('puts the rows without the joined document last', () => {
      const desc: string = orderAdapter.buildOrder(
        vars,
        'chunter:class:Chat',
        'chunter_doc',
        { '$lookup.readState.latestMessageTimestamp': -1 },
        [direct]
      )
      expect(desc).toBe(`ORDER BY ${direct.toAlias}."latestMessageTimestamp" DESC NULLS LAST`)
      const asc: string = orderAdapter.buildOrder(
        vars,
        'chunter:class:Chat',
        'chunter_doc',
        { '$lookup.readState.latestMessageTimestamp': 1 },
        [direct]
      )
      expect(asc).toBe(`ORDER BY ${direct.toAlias}."latestMessageTimestamp" ASC NULLS FIRST`)
    })

    it('leaves the order of a base field alone', () => {
      const sql: string = orderAdapter.buildOrder(vars, 'chunter:class:Chat', 'chunter_doc', { modifiedOn: -1 }, [])
      expect(sql).toBe('ORDER BY chunter_doc."modifiedOn" DESC')
    })
  })

  describe('localizeProjection', () => {
    // The adapter rewrites a mixin attribute of the base class to `<mixin>.<attr>`; a lookup key
    // already has dots and goes through as it is.
    const mixinAdapter = Object.create(PostgresAdapter.prototype)
    mixinAdapter.hierarchy = {
      isMixin: (_class: string) => _class === 'test:mixin:Extra',
      findAttribute: (_class: string, key: string) =>
        key === 'extra'
          ? { attributeOf: 'test:mixin:Extra', name: 'extra' }
          : { attributeOf: 'test:class:Base', name: key }
    }

    it('passes lookup keys through for a plain class', () => {
      expect(
        adapter.localizeProjection?.call({ hierarchy: { isMixin: () => false } }, 'test:class:A', {
          name: 1,
          '$lookup.space.name': 1
        })
      ).toEqual({ name: 1, '$lookup.space.name': 1 })
    })

    it('rewrites a mixin attribute and leaves lookup keys as they are', () => {
      expect(
        mixinAdapter.localizeProjection('test:mixin:Extra', { extra: 1, name: 1, '$lookup.space.name': 1 })
      ).toEqual({ 'test:mixin:Extra.extra': 1, name: 1, '$lookup.space.name': 1 })
    })
  })

  describe('parse', () => {
    it('reads a partial direct join row with its numeric columns as numbers', async () => {
      const [doc] = await adapter.parseLookup(
        ctx,
        [
          {
            _id: 'chat:1',
            _class: 'chunter:class:Chat',
            modifiedOn: '1',
            data: { pinned: false },
            lookup_notification_read_state_readstate__id: 'rs:1',
            lookup_notification_read_state_readstate__class: 'notification:class:ReadState',
            lookup_notification_read_state_readstate_latestMessageTimestamp: '1790671315240'
          }
        ],
        [direct],
        undefined,
        undefined,
        'chunter_doc'
      )
      const state = doc.$lookup.readState
      expect(state).toEqual({
        _id: 'rs:1',
        _class: 'notification:class:ReadState',
        latestMessageTimestamp: 1790671315240
      })
      expect(doc.pinned).toBe(false)
    })

    it('leaves the lookup empty when the joined row is missing', async () => {
      const [doc] = await adapter.parseLookup(
        ctx,
        [
          {
            _id: 'chat:1',
            _class: 'chunter:class:Chat',
            modifiedOn: '1',
            data: {},
            lookup_notification_read_state_readstate__id: null,
            lookup_notification_read_state_readstate__class: null,
            lookup_notification_read_state_readstate_latestMessageTimestamp: null
          }
        ],
        [direct],
        undefined,
        undefined,
        'chunter_doc'
      )
      expect(doc.$lookup.readState).toBeUndefined()
    })

    it('tells two partial direct joins apart when the first one is missing', async () => {
      const second: JoinProps = {
        table: 'doc_preview',
        path: 'preview',
        fromAlias: 'chunter_doc',
        fromField: 'preview',
        toAlias: 'lookup_doc_preview_preview',
        toField: '_id',
        isReverse: false
      }
      const [doc] = await adapter.parseLookup(
        ctx,
        [
          {
            _id: 'chat:1',
            _class: 'chunter:class:Chat',
            modifiedOn: '1',
            data: {},
            lookup_notification_read_state_readstate__id: null,
            lookup_notification_read_state_readstate__class: null,
            lookup_notification_read_state_readstate_latestMessageTimestamp: null,
            lookup_doc_preview_preview__id: 'preview:1',
            lookup_doc_preview_preview__class: 'core:class:DocPreview',
            lookup_doc_preview_preview_data: { title: '#general' }
          }
        ],
        [direct, second],
        undefined,
        undefined,
        'chunter_doc'
      )
      expect(doc.$lookup.readState).toBeUndefined()
      expect(doc.$lookup.preview).toEqual({ _id: 'preview:1', _class: 'core:class:DocPreview', title: '#general' })
    })

    it('reads a direct join row cut by an exclusion like a full one', async () => {
      const [doc] = await adapter.parseLookup(
        ctx,
        [
          {
            _id: 'chat:1',
            _class: 'chunter:class:Chat',
            modifiedOn: '1',
            data: {},
            lookup_notification_read_state_readstate__id: 'rs:1',
            lookup_notification_read_state_readstate__class: 'notification:class:ReadState',
            lookup_notification_read_state_readstate_modifiedOn: '7',
            lookup_notification_read_state_readstate_latestMessageTimestamp: '9',
            // `data - ARRAY['title']`: the other keys come as they are
            lookup_notification_read_state_readstate_data: { 'acc-1': { timestamp: 5 } }
          }
        ],
        [direct],
        undefined,
        undefined,
        'chunter_doc'
      )
      expect(doc.$lookup.readState).toEqual({
        _id: 'rs:1',
        _class: 'notification:class:ReadState',
        modifiedOn: 7,
        latestMessageTimestamp: 9,
        'acc-1': { timestamp: 5 }
      })
    })

    it('reads partial reverse join rows', async () => {
      const [doc] = await adapter.parseLookup(
        ctx,
        [
          {
            _id: 'person:1',
            _class: 'contact:class:Person',
            modifiedOn: '1',
            data: { name: 'a' },
            reverse_lookup_contact_channel_channels: [
              { _id: 'ch:1', _class: 'contact:class:Channel', data: { lastMessage: 2000 } },
              { _id: 'ch:2', _class: 'contact:class:Channel', data: { lastMessage: 500 } }
            ]
          }
        ],
        [reverse],
        undefined,
        undefined,
        'contact'
      )
      expect(doc.$lookup.channels).toEqual([
        { _id: 'ch:1', _class: 'contact:class:Channel', lastMessage: 2000 },
        { _id: 'ch:2', _class: 'contact:class:Channel', lastMessage: 500 }
      ])
    })
  })
})
