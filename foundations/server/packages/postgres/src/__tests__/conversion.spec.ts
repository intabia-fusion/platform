import core, {
  AccountRole,
  type AccountUuid,
  DOMAIN_SPACE,
  Hierarchy,
  MeasureMetricsContext,
  ModelDb,
  type SessionData,
  TxFactory,
  type DocumentUpdate,
  type PersonId,
  type Ref,
  type Space,
  type Tx,
  type WorkspaceUuid
} from '@hcengineering/core'
import { PostgresAdapter } from '../storage'
import { convertArrayParams, decodeArray, filterProjection } from '../utils'
import { genMinModel, test, type ComplexClass } from './minmodel'
import { createDummyClient, type TypedQuery } from './utils'
import { ConnectionMgr, type DBFlavor } from '@hcengineering/postgres-base'

describe('array conversion', () => {
  it('should handle undefined parameters', () => {
    expect(convertArrayParams(undefined)).toBeUndefined()
  })

  it('should convert empty arrays', () => {
    expect(convertArrayParams([['foo']])).toEqual(['{"foo"}'])
    expect(convertArrayParams([[]])).toEqual(['{}'])
  })

  it('should handle string arrays with special characters', () => {
    expect(convertArrayParams([['hello', 'world"quote"']])).toEqual(['{"hello","world\\"quote\\""}'])
  })

  it('should handle null values', () => {
    expect(convertArrayParams([[null, 'value', null]])).toEqual(['{NULL,"value",NULL}'])
  })

  it('should handle mixed type arrays', () => {
    expect(convertArrayParams([[123, 'text', null, true]])).toEqual(['{123,"text",NULL,true}'])
  })

  it('should pass through non-array parameters', () => {
    expect(convertArrayParams(['text', 123, null])).toEqual(['text', 123, null])
  })
})

describe('array decoding', () => {
  it('should decode NULL to empty array', () => {
    expect(decodeArray('NULL')).toEqual([])
  })

  it('should decode empty array', () => {
    expect(decodeArray('{}')).toEqual([''])
  })

  it('should decode simple string array', () => {
    expect(decodeArray('{hello,world}')).toEqual(['hello', 'world'])
  })
  it('should decode encoded string array', () => {
    expect(decodeArray('{"hello","world"}')).toEqual(['hello', 'world'])
  })

  it('should decode array with quoted strings', () => {
    expect(decodeArray('{hello,"quoted value"}')).toEqual(['hello', 'quoted value'])
  })

  it('should decode array with escaped quotes', () => {
    expect(decodeArray('{"hello \\"world\\""}')).toEqual(['hello "world"'])
  })

  it('should decode array with multiple escaped characters', () => {
    expect(decodeArray('{"first \\"quote\\"","second \\"quote\\""}')).toEqual(['first "quote"', 'second "quote"'])
  })
})

const factory = new TxFactory('email:test' as PersonId)
function upd (id: string, partial: DocumentUpdate<ComplexClass>): Tx {
  return factory.createTxUpdateDoc<ComplexClass>(
    test.class.ComplexClass,
    core.space.Workspace,
    id as Ref<ComplexClass>,
    partial
  )
}

describe('query to sql conversion tests', () => {
  it('check dummy db client', async () => {
    const queries: TypedQuery[] = []
    const c = createDummyClient(queries)

    await c.execute('select now()')
    expect(queries[0].query).toEqual('select now()')
  })
  it('check simple update', async () => {
    const { adapter, ctx, queries } = createTestContext()

    await adapter.tx(
      ctx,
      upd('obj1', {
        stringField: 'test'
      })
    )
    expect(queries[0].query).toEqual(
      'UPDATE pg_testing SET "modifiedBy" = update_data."_modifiedBy", "modifiedOn" = update_data."_modifiedOn", "%hash%" = update_data."_%hash%", data = COALESCE(data || update_data._data)\n            FROM (values ($2::text, $3::text,$4::bigint,$5::text,$6::jsonb)) AS update_data(__id, "_modifiedBy","_modifiedOn","_%hash%","_data")\n            WHERE "workspaceId" = $1::uuid AND "_id" = update_data.__id'
    )
  })
  it('check space update', async () => {
    const { adapter, ctx, queries } = createTestContext()

    await adapter.tx(
      ctx,
      upd('obj1', {
        space: 'new-space' as Ref<Space>
      })
    )
    expect(queries[0].query).toEqual(
      'UPDATE pg_testing SET "modifiedBy" = update_data."_modifiedBy", "modifiedOn" = update_data."_modifiedOn", "%hash%" = update_data."_%hash%", "space" = update_data."_space"\n            FROM (values ($2::text, $3::text,$4::bigint,$5::text,$6::text)) AS update_data(__id, "_modifiedBy","_modifiedOn","_%hash%","_space")\n            WHERE "workspaceId" = $1::uuid AND "_id" = update_data.__id'
    )
  })
  it('check few documents update', async () => {
    const { adapter, ctx, queries } = createTestContext()

    await adapter.tx(
      ctx,
      upd('obj1', {
        stringField: 'test'
      }),
      upd('obj2', {
        stringField: 'test2'
      }),
      upd('obj3', {
        stringField: 'test'
      })
    )
    expect(queries[0].query).toEqual(
      'UPDATE pg_testing SET "modifiedBy" = update_data."_modifiedBy", "modifiedOn" = update_data."_modifiedOn", "%hash%" = update_data."_%hash%", data = COALESCE(data || update_data._data)\n            FROM (values ($2::text, $3::text,$4::bigint,$5::text,$6::jsonb),($7::text, $8::text,$9::bigint,$10::text,$11::jsonb),($12::text, $13::text,$14::bigint,$15::text,$16::jsonb)) AS update_data(__id, "_modifiedBy","_modifiedOn","_%hash%","_data")\n            WHERE "workspaceId" = $1::uuid AND "_id" = update_data.__id'
    )
  })
})
function createTestContext (): { adapter: PostgresAdapter, ctx: MeasureMetricsContext, queries: TypedQuery[] } {
  const ctx = new MeasureMetricsContext('test', {})
  const queries: TypedQuery[] = []
  const c = createDummyClient(queries)

  const minModel = genMinModel()
  const hierarchy = new Hierarchy()
  for (const tx of minModel) {
    hierarchy.tx(tx)
  }
  const modelDb = new ModelDb(hierarchy)
  modelDb.addTxes(ctx, minModel, true)
  const adapter = new PostgresAdapter(
    c,
    new ConnectionMgr(c),
    {
      url: () => 'test',
      close: () => {}
    },
    'workspace' as WorkspaceUuid,
    hierarchy,
    modelDb,
    'test'
  )
  return { adapter, ctx, queries }
}

describe('number comparison on jsonb fields', () => {
  function translate (
    tkey: string,
    value: any,
    flavor: DBFlavor = 'postgres'
  ): { sql: string | undefined, values: any[] } {
    const { adapter } = createTestContext()
    ;(adapter as any).dbFlavor = flavor
    const values: any[] = []
    let idx = 1
    const vars = {
      add (value: any, type: string = ''): string {
        values.push(value)
        return `$${idx++}${type}`
      },
      addArray (value: any[], type: string = ''): string {
        values.push(value)
        return `$${idx++}${type}`
      }
    }
    return { sql: (adapter as any).translateQueryValue(vars, tkey, value, 'common'), values }
  }

  // The shape numericJsonKey builds: the field's text as numeric, when Postgres accepts it as one.
  function numericKey (text: string): string {
    return `(CASE WHEN pg_input_is_valid(${text}, 'numeric') THEN (${text})::numeric END)`
  }

  it('compares a jsonb field with a number as a number, not as text', () => {
    // Text orders '10' before '9': `number > 9 AND number < 100` used to match nothing.
    const { sql, values } = translate("task.data#>>'{number}'", { $gt: 9, $lt: 100 })

    const key = numericKey("task.data#>>'{number}'")
    expect(sql).toEqual(`${key} > $1::numeric AND ${key} < $2::numeric`)
    expect(values).toEqual([9, 100])
  })

  it('does the same for a field of a joined document and for an arrow path', () => {
    expect(translate('lookup_activity_attachedTo."data"#>>\'{replies}\'', { $gte: 1 }).sql).toEqual(
      `${numericKey('lookup_activity_attachedTo."data"#>>\'{replies}\'')} >= $1::numeric`
    )
    expect(translate("data->'a'->'b'", { $lte: 5 }).sql).toEqual(`${numericKey("data->'a'->>'b'")} <= $1::numeric`)
  })

  it('falls back to the json type check where pg_input_is_valid does not exist (cockroach, unknown)', () => {
    const fallback =
      "(CASE WHEN jsonb_typeof(task.data#>'{number}') = 'number' THEN (task.data#>>'{number}')::numeric END)"
    expect(translate("task.data#>>'{number}'", { $gt: 9 }, 'cockroach').sql).toEqual(`${fallback} > $1::numeric`)
    expect(translate("task.data#>>'{number}'", { $gt: 9 }, 'unknown').sql).toEqual(`${fallback} > $1::numeric`)
    expect(translate("data->'a'->'b'", { $lte: 5 }, 'cockroach').sql).toEqual(
      "(CASE WHEN jsonb_typeof(data->'a'->'b') = 'number' THEN (data->'a'->>'b')::numeric END) <= $1::numeric"
    )
  })

  it('leaves text ranges, equality and real columns as they were', () => {
    expect(translate("task.data#>>'{title}'", { $gt: 'a' }).sql).toEqual("task.data#>>'{title}' > $1::text")
    expect(translate("task.data#>>'{number}'", 9).values).toEqual(['9'])
    expect(translate("task.data#>>'{number}'", { $in: [1, 2] }).values).toEqual([['1', '2']])
    expect(translate('task."modifiedOn"', { $gt: 9 }).sql).toEqual('task."modifiedOn" > $1::numeric')
  })
})

describe('projection', () => {
  it('mixin query projection', () => {
    const data = {
      '638611f18894c91979399ef3': {
        Источник_6386125d8894c91979399eff: 'Workable'
      },
      attachments: 1,
      avatar: null,
      avatarProps: null,
      avatarType: 'color',
      channels: 3,
      city: 'Poland',
      docUpdateMessages: 31,
      name: 'Mulkuha,Muklyi',
      'notification:mixin:Collaborators': {
        collaborators: []
      },
      'recruit:mixin:Candidate': {
        Title_63f38419efefd99805238bbd: 'Backend-RoR',
        Trash_64493626f9b50e77bf82d231: 'Нет',
        __mixin: 'true',
        applications: 1,
        onsite: null,
        remote: null,
        skills: 18,
        title: '',
        Опытработы_63860d5c8894c91979399e73: '2018',
        Уровеньанглийского_63860d038894c91979399e6f: 'UPPER'
      }
    }
    const projected = filterProjection<any>(data, {
      'recruit:mixin:Candidate.Уровеньанглийского_63860d038894c91979399e6f': 1,
      _class: 1,
      space: 1,
      modifiedOn: 1
    })
    expect(projected).toEqual({
      'recruit:mixin:Candidate': {
        Уровеньанглийского_63860d038894c91979399e6f: 'UPPER'
      }
    })
  })
})

describe('addSecurity - SQL injection prevention', () => {
  function createAccount (uuid: string, role: AccountRole = AccountRole.User): SessionData {
    return {
      account: {
        uuid: uuid as AccountUuid,
        role,
        primarySocialId: `social:${uuid}` as any,
        socialIds: [`social:${uuid}`] as any,
        fullSocialIds: []
      },
      isTriggerCtx: false
    } as unknown as SessionData
  }

  it('should parameterize account uuid in members check', () => {
    const { adapter } = createTestContext()
    // Mock findAllSync to avoid ClassCollaborators lookup failure
    jest.spyOn((adapter as any).modelDb, 'findAllSync').mockReturnValue([])
    const maliciousUuid = "'; DROP TABLE space; --"

    // Create a mock ValuesVariables-like object
    const values: any[] = []
    let idx = 1
    const vars = {
      add (value: any, type: string = ''): string {
        values.push(value)
        return type !== '' ? `$${idx++}${type}` : `$${idx++}`
      }
    }

    const result = adapter.addSecurity(
      core.class.Space,
      vars as any,
      {},
      false,
      DOMAIN_SPACE,
      createAccount(maliciousUuid)
    )

    // UUID must NOT appear directly in SQL string
    expect(result).toBeDefined()
    expect(result).not.toContain(maliciousUuid)
    // Should use ARRAY[$N] parameterized form
    expect(result).toMatch(/members @> ARRAY\[\$\d+::text\]/)
    // The malicious value should be in the values array (parameterized)
    expect(values).toContain(maliciousUuid)
  })

  it('should parameterize account uuid in collaborator check for guest', () => {
    const { adapter } = createTestContext()
    jest.spyOn((adapter as any).modelDb, 'findAllSync').mockReturnValue([])
    const maliciousUuid = "'; DROP TABLE space; --"

    const values: any[] = []
    let idx = 1
    const vars = {
      add (value: any, type: string = ''): string {
        values.push(value)
        return type !== '' ? `$${idx++}${type}` : `$${idx++}`
      }
    }

    const result = adapter.addSecurity(
      core.class.Space,
      vars as any,
      {},
      false,
      DOMAIN_SPACE,
      createAccount(maliciousUuid, AccountRole.Guest)
    )

    // Guest with DocGuest role returns undefined (early exit)
    // Regular Guest should still parameterize
    if (result !== undefined) {
      expect(result).not.toContain(maliciousUuid)
      expect(values).toContain(maliciousUuid)
    }
  })

  it('should not contain raw uuid for normal user', () => {
    const { adapter } = createTestContext()
    jest.spyOn((adapter as any).modelDb, 'findAllSync').mockReturnValue([])
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

    const values: any[] = []
    let idx = 1
    const vars = {
      add (value: any, type: string = ''): string {
        values.push(value)
        return type !== '' ? `$${idx++}${type}` : `$${idx++}`
      }
    }

    const result = adapter.addSecurity(core.class.Space, vars as any, {}, false, DOMAIN_SPACE, createAccount(uuid))

    expect(result).toBeDefined()
    // The actual UUID should never appear in the SQL text
    expect(result).not.toContain(uuid)
    // It should appear in parameterized values
    expect(values).toContain(uuid)
  })
})
