// Blob DB checked against a real Postgres (testcontainers).

import { MeasureMetricsContext } from '@hcengineering/core'
import { postgresUrl } from '@hcengineering/test-containers'
import postgres, { type Sql } from 'postgres'
import { PostgresDB } from '../datalake/db'
import { type UUID } from '../datalake/types'

jest.setTimeout(120000)

describe('PostgresDB.createBlobData', () => {
  const ctx = new MeasureMetricsContext('test', {})
  let sql: Sql
  let db: PostgresDB

  beforeAll(async () => {
    sql = postgres(await postgresUrl(), { max: 4, onnotice: () => {} })
    // migration 02 reads the account service table, which is not part of this schema
    await sql`CREATE SCHEMA IF NOT EXISTS global_account`
    await sql`CREATE TABLE IF NOT EXISTS global_account.workspace (uuid uuid, data_id text)`
    db = await PostgresDB.create(ctx, sql)
  })

  afterAll(async () => {
    await sql?.end()
  })

  it('does not leave blob.data behind when the blob insert fails', async () => {
    const hash = '11111111-1111-4111-8111-111111111111' as UUID
    // missing parent violates fk_parent on the second INSERT
    const rec = {
      workspace: 'ws',
      name: 'child',
      hash,
      location: 'kv',
      parent: 'no-such-parent',
      filename: 'f',
      size: 1,
      type: 'text/plain'
    } as any

    await expect(db.createBlobData(ctx, rec)).rejects.toThrow()

    expect(await db.getData(ctx, { hash, location: 'kv' } as any)).toBeNull()
    expect(await sql`SELECT 1 FROM blob.blob WHERE workspace = 'ws' AND name = 'child'`).toHaveLength(0)
  })
})
