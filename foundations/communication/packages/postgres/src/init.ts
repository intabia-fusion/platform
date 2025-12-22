//
// Copyright © 2025 Hardcore Engineering Inc.
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

import type postgres from 'postgres'
import { Domain } from '@hcengineering/communication-sdk-types'
import { Doc, Hierarchy, notEmpty, Ref, Mixin } from '@hcengineering/core'

/* eslint-disable @typescript-eslint/naming-convention */

const migrationsDomain = 'communication._migrations'

let isSchemaInitialized = false
let initPromise: Promise<void> | null = null

export function isInitialized (): boolean {
  return isSchemaInitialized
}

export async function initSchema (sql: postgres.Sql, hierarchy: Hierarchy): Promise<void> {
  if (isInitialized()) return

  if (initPromise == null) {
    initPromise = (async () => {
      const maxAttempts = 3
      const retryDelay = 3000

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          await init(sql)
          isSchemaInitialized = true
          return
        } catch (err) {
          if (attempt === maxAttempts) {
            throw err
          }
          console.warn(`InitSchema attempt ${attempt} failed, retrying in ${retryDelay}ms…`, err)
          await delay(retryDelay)
        }
      }
    })()
      .catch((err) => {
        throw err
      })
      .finally(() => {
        initPromise = null
      })
  }

  await initPromise
}

export async function createPartitions (sql: postgres.Sql, hierarchy: Hierarchy): Promise<void> {
  console.log('Starting to create partitions...')
  const classes = hierarchy.classes()
  const domains = new Set(classes
    .filter(it => hierarchy.classHierarchyMixin(it._id, 'communication:mixin:Messageable' as Ref<Mixin<Doc>>) != null)
    .map((it) => it.domain)
    .filter(notEmpty))
  console.log('DOMAINS', domains)
  const tables = [Domain.MessageIndex]

  for (const table of tables) {
    const tablename = table.replace('communication.', '')
    for (const domain of domains) {
      const domainTablename = `${tablename}_${domain}`
      const partitionName = `"communication"."${domainTablename}"`

      const selectSql = `SELECT 1 FROM pg_tables WHERE schemaname = 'communication' and tablename='${domainTablename}' LIMIT 1;`
      const res = await sql.unsafe(selectSql)

      if (res.length === 0) {
        const partitionSql = `CREATE TABLE ${partitionName} PARTITION OF ${table} FOR VALUES IN ('${domain}');`
        await sql.unsafe(partitionSql)
      }
    }
  }
  console.log('Finished creating partitions.')
}

function delay (ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function init (sql: postgres.Sql): Promise<void> {
  if (isSchemaInitialized) return
  const start = performance.now()
  console.log('🗃️ Initializing schema...')
  await sql.unsafe('CREATE SCHEMA IF NOT EXISTS communication;')
  await sql.unsafe(`CREATE TABLE IF NOT EXISTS ${migrationsDomain}
                    (
                        name       VARCHAR(255) NOT NULL,
                        created_on TIMESTAMPTZ  NOT NULL DEFAULT now(),
                        PRIMARY KEY (name)
                    )`)

  const appliedMigrations = await sql.unsafe(`SELECT name
                                              FROM ${migrationsDomain}`)
  const appliedNames = appliedMigrations.map((it) => it.name)

  const migrations = getMigrations()
  for (const [name, sqlString] of migrations) {
    if (appliedNames.includes(name)) continue
    try {
      await sql.unsafe(sqlString)
      await sql.unsafe(
        `INSERT INTO ${migrationsDomain}(name)
         VALUES ($1::varchar);`,
        [name]
      )
      console.log(`✅ Migration ${name} applied`)
    } catch (err) {
      console.error(`❌ Failed on ${name}:`, err)
      throw err
    }
  }
  isSchemaInitialized = true
  const end = performance.now()
  const resTime = (end - start) / 1000
  console.log(`🎉 All migrations complete in ${resTime.toFixed(2)} sec`)
}

function getMigrations (): [string, string][] {
  return [
    migrationV1_1(),
    migrationV1_2()
  ]
}

function migrationV1_1 (): [string, string] {
  const sql = `
      DROP SCHEMA IF EXISTS communication CASCADE;
      CREATE SCHEMA IF NOT EXISTS communication;
      CREATE TABLE IF NOT EXISTS ${migrationsDomain}
      (
          name       VARCHAR(255) NOT NULL,
          created_on TIMESTAMPTZ  NOT NULL DEFAULT now(),
          PRIMARY KEY (name)
      )
  `

  return ['recreate_schema-v1_1', sql]
}

function migrationV1_2 (): [string, string] {
  const sql = `
      CREATE TABLE ${Domain.MessageIndex}
      (
          workspace_id UUID         NOT NULL,
          domain       VARCHAR(255) NOT NULL,
          doc_id       VARCHAR(255) NOT NULL,
          message_id   VARCHAR(22)  NOT NULL,
          message_type VARCHAR(255) NOT NULL,
          created      TIMESTAMPTZ  NOT NULL,
          creator      VARCHAR(255) NOT NULL,
          blob_id      UUID         NOT NULL,
          PRIMARY KEY (workspace_id, domain, doc_id, message_id)
      ) PARTITION BY LIST (domain);

      CREATE INDEX idx_messageindex_workspaceid_id_domain ON ${Domain.MessageIndex} (workspace_id, domain, doc_id);
      CREATE INDEX idx_messageindex_workspaceid_id_domain_messageid ON ${Domain.MessageIndex} (workspace_id, domain, doc_id, message_id);

      -- ============================================================================
      -- TABLE: thread_index
      -- ============================================================================

      CREATE TABLE ${Domain.ThreadIndex}
      (
          workspace_id UUID         NOT NULL,
          domain       VARCHAR(255) NOT NULL,
          doc_id       VARCHAR(255) NOT NULL,
          doc_class    VARCHAR(255) NOT NULL,
          message_id   VARCHAR(22)  NOT NULL,
          thread_id    VARCHAR(255) NOT NULL,
          thread_type VARCHAR(255) NOT NULL,
          PRIMARY KEY (workspace_id, domain, doc_id, message_id),
          CONSTRAINT thread_unique_constraint UNIQUE (workspace_id, thread_id, thread_type)
      );

      CREATE INDEX idx_threadindex_workspaceid_threadid
          ON ${Domain.ThreadIndex} (workspace_id, thread_id);

      CREATE INDEX idx_threadindex_workspaceid_id_domain
        ON ${Domain.ThreadIndex} (workspace_id, domain, doc_id);

      CREATE INDEX idx_threadindex_workspaceid_id_domain_messageid
          ON ${Domain.ThreadIndex} (workspace_id, domain, doc_id, message_id);

      -- ============================================================================
      -- TABLE: notification_context
      -- ============================================================================
      CREATE TABLE ${Domain.NotificationContext}
      (
          workspace_id UUID         NOT NULL,
          domain       VARCHAR(255) NOT NULL,
          context_id   UUID         NOT NULL DEFAULT gen_random_uuid(),
          doc_id       VARCHAR(255) NOT NULL,
          doc_class    VARCHAR(255) NOT NULL,
          account      UUID         NOT NULL,
          last_view    TIMESTAMPTZ  NOT NULL DEFAULT now(),
          last_update  TIMESTAMPTZ  NOT NULL DEFAULT now(),
          last_notify  TIMESTAMPTZ  NOT NULL DEFAULT now(),
          PRIMARY KEY (context_id),
          UNIQUE (workspace_id, domain, doc_id, account)
      );

      CREATE UNIQUE INDEX idx_notification_context_ws_doc_account
          ON ${Domain.NotificationContext} (workspace_id, domain, doc_id, account)
          INCLUDE 
          (last_view, last_update, last_notify);

      CREATE INDEX idx_notification_context_ws_account ON ${Domain.NotificationContext} (workspace_id, account);

      CREATE INDEX idx_notification_context_ws_last_notify
          ON ${Domain.NotificationContext} (workspace_id, account, last_notify DESC)
          INCLUDE 
          (domain, doc_id, last_view, last_update, last_notify);

      CREATE INDEX idx_notification_context_id ON ${Domain.NotificationContext} (context_id);

      -- ============================================================================
      -- TABLE: notification
      -- ============================================================================
      CREATE TABLE ${Domain.Notification}
      (
          context_id      UUID         NOT NULL,
          notification_id UUID         NOT NULL DEFAULT gen_random_uuid(),
          read            BOOLEAN      NOT NULL DEFAULT false,
          message_id      VARCHAR(22)  NOT NULL,
          created         TIMESTAMPTZ  NOT NULL,
          content         JSONB        NOT NULL DEFAULT '{}',
          blob_id         UUID         NOT NULL,
          creator         VARCHAR(255) NOT NULL DEFAULT '',
          type            VARCHAR(255) NOT NULL DEFAULT '',
          PRIMARY KEY (notification_id),
          FOREIGN KEY (context_id) REFERENCES ${Domain.NotificationContext} (context_id) ON DELETE CASCADE
      );

      CREATE INDEX idx_notification_context_read_created_desc
          ON ${Domain.Notification} (context_id, read, created DESC);

      CREATE INDEX idx_notification_context
          ON ${Domain.Notification} (context_id);

      CREATE INDEX idx_notification_context_message
          ON ${Domain.Notification} (context_id, message_id);

      -- ============================================================================
      -- TABLE: label
      -- ============================================================================
      CREATE TABLE ${Domain.Label}
      (
          workspace_id UUID         NOT NULL,
          domain       VARCHAR(255) NOT NULL,
          label_id     VARCHAR(255) NOT NULL,
          doc_id       VARCHAR(255) NOT NULL,
          doc_class    VARCHAR(255) NOT NULL,
          account      UUID         NOT NULL,
          created      TIMESTAMPTZ  NOT NULL DEFAULT now(),
          PRIMARY KEY (workspace_id, domain, doc_id, label_id, account)
      );

      CREATE INDEX idx_label_workspace_domain
          ON ${Domain.Label} (workspace_id, domain, doc_id);

      CREATE INDEX idx_label_workspace_account
          ON ${Domain.Label} (workspace_id, account);

      CREATE INDEX idx_label_workspace_label
          ON ${Domain.Label} (workspace_id, account, label_id);

      -- ============================================================================
      -- TABLE: peer (Domain.Peer)
      -- ============================================================================
      CREATE TABLE ${Domain.Peer}
      (
          workspace_id UUID         NOT NULL,
          card_id      VARCHAR(255) NOT NULL,
          kind         TEXT         NOT NULL,
          value        TEXT         NOT NULL,
          extra        JSONB        NOT NULL DEFAULT '{}',
          created      TIMESTAMPTZ  NOT NULL DEFAULT now(),
          PRIMARY KEY (workspace_id, card_id, kind, value)
      );

      CREATE INDEX peer_workspace_card_kind
          ON ${Domain.Peer} (workspace_id, card_id, kind);

      CREATE INDEX peer_kind_value
          ON ${Domain.Peer} (kind, value);
  `
  return ['reinit_tables-v1_2', sql]
}
