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

export type DBFlavor = 'postgres' | 'cockroach' | 'unknown'

type SupportedFlavor = Exclude<DBFlavor, 'unknown'>

// Type definitions for different database flavors.
// The keys match the DBFlavor type ('postgres' and 'cockroach').
const dbTypes: Record<
SupportedFlavor,
{
  string: string
  string255: string
  int4: string
  int8: string
  float: string
  decimal: string
}
> = {
  cockroach: {
    string: 'STRING',
    string255: 'STRING(255)',
    int4: 'INT4',
    int8: 'INT8',
    float: 'FLOAT',
    decimal: 'DECIMAL'
  },
  postgres: {
    string: 'TEXT',
    string255: 'VARCHAR(255)',
    int4: 'INTEGER',
    int8: 'BIGINT',
    float: 'DOUBLE PRECISION',
    decimal: 'DECIMAL'
  }
} as const

export function getMigrations (flavor: DBFlavor): [string, string][] {
  if (flavor === 'unknown') {
    throw new Error('Cannot generate migrations for an unknown database flavor.')
  }

  const types = dbTypes[flavor]
  if (types === undefined) {
    throw new Error(`Unsupported database flavor: ${flavor}`)
  }

  // NOTE: migrationV5 (`add_usage_dedup_and_limit_state_05`) lives in the foundation3
  // licensing branch. To avoid a merge collision we number the AI-token-dimensions
  // migration as V6; migrations apply by name order so 06 runs after that 05.
  return [migrationV1(flavor), migrationV2(flavor), migrationV3(flavor), migrationV4(flavor), migrationV6(flavor)]
}

function migrationV1 (flavor: SupportedFlavor): [string, string] {
  const types = dbTypes[flavor]

  const sql = `
    CREATE TABLE IF NOT EXISTS billing.livekit_session (
      workspace ${types.string255} NOT NULL,
      session_id ${types.string255} NOT NULL,
      session_start TIMESTAMP NOT NULL,
      session_end TIMESTAMP NOT NULL,
      room ${types.string255} NOT NULL,
      bandwidth ${types.int8} NOT NULL,
      minutes ${types.int8} NOT NULL,
      CONSTRAINT pk_livekit_session PRIMARY KEY (workspace, session_id)
    );

    CREATE INDEX IF NOT EXISTS idx_livekit_session_start ON billing.livekit_session (session_start);
    CREATE INDEX IF NOT EXISTS idx_livekit_session_end ON billing.livekit_session (session_end);
    CREATE INDEX IF NOT EXISTS idx_livekit_session_room ON billing.livekit_session (room);

    CREATE TABLE IF NOT EXISTS billing.livekit_egress (
      workspace ${types.string255} NOT NULL,
      egress_id ${types.string255} NOT NULL,
      egress_start TIMESTAMP NOT NULL,
      egress_end TIMESTAMP NOT NULL,
      room ${types.string255} NOT NULL,
      duration ${types.int4} NOT NULL,
      CONSTRAINT pk_livekit_egress PRIMARY KEY (workspace, egress_id)
    );

    CREATE INDEX IF NOT EXISTS idx_livekit_egress_start ON billing.livekit_egress (egress_start);
    CREATE INDEX IF NOT EXISTS idx_livekit_egress_end ON billing.livekit_egress (egress_end);
    CREATE INDEX IF NOT EXISTS idx_livekit_egress_room ON billing.livekit_egress (room);
  `
  return ['init_tables_01', sql]
}

function migrationV2 (flavor: SupportedFlavor): [string, string] {
  const types = dbTypes[flavor]

  const sql = `
    CREATE TABLE IF NOT EXISTS billing.ai_transcript_usage (
      workspace UUID NOT NULL,
      day DATE NOT NULL,
      last_request_id ${types.string255} NOT NULL,
      last_start_time TIMESTAMP NOT NULL,
      total_duration_seconds ${types.float} NOT NULL,
      total_usd ${types.decimal}(12,6) NOT NULL,
      PRIMARY KEY (workspace, day)
    );

    CREATE INDEX IF NOT EXISTS idx_ai_transcript_usage_day ON billing.ai_transcript_usage (day);

    CREATE TABLE IF NOT EXISTS billing.ai_tokens_usage (
      workspace UUID NOT NULL,
      day DATE NOT NULL,
      reason ${types.string255} NOT NULL,
      total_tokens ${types.int8} NOT NULL,
      PRIMARY KEY (workspace, day, reason)
    );

    CREATE INDEX IF NOT EXISTS idx_ai_tokens_usage_day ON billing.ai_tokens_usage (day);
  `
  return ['init_ai_usage_tables_02', sql]
}

function migrationV3 (flavor: SupportedFlavor): [string, string] {
  const sql = `
    UPDATE billing.livekit_session SET bandwidth = 0 WHERE bandwidth IS NULL;
    ALTER TABLE billing.livekit_session ALTER COLUMN bandwidth SET DEFAULT 0;
  `
  return ['fix_bandwidth_nulls_03', sql]
}

function migrationV4 (flavor: SupportedFlavor): [string, string] {
  const types = dbTypes[flavor]

  const sql = `
    CREATE TABLE IF NOT EXISTS billing.livekit_participant_session (
      workspace ${types.string255} NOT NULL,
      participant_id ${types.string255} NOT NULL,
      session_id ${types.string255} NOT NULL,
      room ${types.string255} NOT NULL,
      joined_at TIMESTAMP NOT NULL,
      left_at TIMESTAMP,
      duration_seconds ${types.float} NOT NULL DEFAULT 0,
      CONSTRAINT pk_livekit_participant_session PRIMARY KEY (workspace, participant_id, session_id)
    );

    CREATE INDEX IF NOT EXISTS idx_livekit_participant_session_joined
      ON billing.livekit_participant_session (joined_at);
  `
  return ['add_participant_sessions_04', sql]
}

function migrationV6 (flavor: SupportedFlavor): [string, string] {
  const types = dbTypes[flavor]

  // ai_tokens_usage gains AI usage dimensions (provider/model/level) and switches from
  // a daily bucket (`day DATE`) to an hourly bucket (`hour TIMESTAMP`, truncated to the
  // hour) so per-workspace rolling windows (5h / week) can be computed accurately.
  // Old daily rows are folded to midnight of their day. The PK widens to include the new
  // dimensions; the legacy `day` column is dropped after backfilling `hour`.
  // Also adds provider_pool: purchased token pools per provider (global, not per-workspace).
  const sql = `
    ALTER TABLE billing.ai_tokens_usage
      ADD COLUMN IF NOT EXISTS provider_id ${types.string255} NOT NULL DEFAULT '';
    ALTER TABLE billing.ai_tokens_usage
      ADD COLUMN IF NOT EXISTS model ${types.string255} NOT NULL DEFAULT '';
    ALTER TABLE billing.ai_tokens_usage
      ADD COLUMN IF NOT EXISTS level ${types.string255} NOT NULL DEFAULT '';
    ALTER TABLE billing.ai_tokens_usage
      ADD COLUMN IF NOT EXISTS hour TIMESTAMP NOT NULL DEFAULT '1970-01-01 00:00:00';

    UPDATE billing.ai_tokens_usage SET hour = day::timestamp WHERE hour = '1970-01-01 00:00:00';

    ALTER TABLE billing.ai_tokens_usage DROP CONSTRAINT IF EXISTS ai_tokens_usage_pkey;
    ALTER TABLE billing.ai_tokens_usage
      ADD CONSTRAINT ai_tokens_usage_pkey PRIMARY KEY (workspace, hour, reason, provider_id, model, level);

    ALTER TABLE billing.ai_tokens_usage DROP COLUMN IF EXISTS day;

    CREATE INDEX IF NOT EXISTS idx_ai_tokens_usage_hour ON billing.ai_tokens_usage (hour);
    CREATE INDEX IF NOT EXISTS idx_ai_tokens_usage_provider ON billing.ai_tokens_usage (provider_id);
    CREATE INDEX IF NOT EXISTS idx_ai_tokens_usage_model ON billing.ai_tokens_usage (model);
    CREATE INDEX IF NOT EXISTS idx_ai_tokens_usage_level ON billing.ai_tokens_usage (level);

    CREATE TABLE IF NOT EXISTS billing.provider_pool (
      provider_id ${types.string255} NOT NULL,
      kind ${types.string255} NOT NULL DEFAULT 'purchased',
      purchased_tokens ${types.int8} NOT NULL DEFAULT 0,
      period ${types.string255} NOT NULL DEFAULT 'monthly',
      period_start TIMESTAMP NOT NULL DEFAULT now(),
      used_tokens ${types.int8} NOT NULL DEFAULT 0,
      exhausted BOOLEAN NOT NULL DEFAULT false,
      notified80 BOOLEAN NOT NULL DEFAULT false,
      notified100 BOOLEAN NOT NULL DEFAULT false,
      PRIMARY KEY (provider_id)
    );
  `
  return ['add_ai_token_dimensions_and_pools_06', sql]
}
