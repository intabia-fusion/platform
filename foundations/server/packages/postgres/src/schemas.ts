import { DOMAIN_COLLABORATOR, DOMAIN_MODEL_TX, DOMAIN_RELATION, DOMAIN_SPACE, DOMAIN_TX } from '@hcengineering/core'

export type DataType = 'bigint' | 'bool' | 'text' | 'text[]' | 'integer'

export function getIndex (field: FieldSchema): string {
  if (field.indexType === undefined || field.indexType === 'btree') {
    return ''
  }
  return ` USING ${field.indexType}`
}

export interface FieldSchema {
  type: DataType
  notNull: boolean
  index: boolean
  indexType?: 'btree' | 'gin' | 'gist' | 'brin' | 'hash'
  check?: string
}

export type Schema = Record<string, FieldSchema>

const baseSchema: Schema = {
  _id: {
    type: 'text',
    notNull: true,
    index: false
  },
  _class: {
    type: 'text',
    notNull: true,
    index: true
  },
  space: {
    type: 'text',
    notNull: true,
    index: true
  },
  modifiedBy: {
    type: 'text',
    notNull: true,
    index: false
  },
  createdBy: {
    type: 'text',
    notNull: false,
    index: false
  },
  modifiedOn: {
    type: 'bigint',
    notNull: true,
    index: false
  },
  createdOn: {
    type: 'bigint',
    notNull: false,
    index: false
  },
  '%hash%': {
    type: 'text',
    notNull: false,
    index: false
  }
}

const defaultSchema: Schema = {
  ...baseSchema,
  attachedTo: {
    type: 'text',
    notNull: false,
    index: true
  }
}

const collaboratorSchema: Schema = {
  ...baseSchema,
  attachedTo: {
    type: 'text',
    notNull: true,
    index: true
  },
  attachedToClass: {
    type: 'text',
    notNull: true,
    index: true
  },
  collaborator: {
    type: 'text',
    notNull: true,
    index: true
  }
}

const chatSchema: Schema = {
  ...baseSchema,
  attachedTo: {
    type: 'text',
    notNull: true,
    index: true
  },
  attachedToClass: {
    type: 'text',
    notNull: true,
    index: true
  },
  account: {
    type: 'text',
    notNull: true,
    index: true
  },
  pinned: {
    type: 'bool',
    notNull: true,
    index: true
  },
  hidden: {
    type: 'bool',
    notNull: true,
    index: true
  }
}

const attachmentSchema: Schema = {
  ...baseSchema,
  attachedTo: {
    type: 'text',
    notNull: true,
    index: true
  },
  attachedToClass: {
    type: 'text',
    notNull: true,
    index: true
  },
  size: {
    type: 'bigint',
    notNull: true,
    index: true
  },
  type: {
    type: 'text',
    notNull: true,
    index: true
  },
  file: {
    type: 'text',
    notNull: true,
    index: true
  }
}

const spaceSchema: Schema = {
  ...baseSchema,
  private: {
    type: 'bool',
    notNull: true,
    index: true
  },
  members: {
    type: 'text[]',
    notNull: true,
    index: true,
    indexType: 'gin'
  },
  archived: {
    type: 'bool',
    notNull: true,
    index: true
  },
  referenceId: {
    type: 'text',
    notNull: false,
    index: true
  }
}

const relationSchema: Schema = {
  ...baseSchema,
  docA: {
    type: 'text',
    notNull: true,
    index: true
  },
  docB: {
    type: 'text',
    notNull: true,
    index: true
  },
  association: {
    type: 'text',
    notNull: true,
    index: true
  }
}

const txSchema: Schema = {
  ...defaultSchema,
  objectSpace: {
    type: 'text',
    notNull: true,
    index: true
  },
  objectId: {
    type: 'text',
    notNull: false,
    index: false
  }
}

const notificationSchema: Schema = {
  ...baseSchema,
  lastView: {
    type: 'bigint',
    notNull: false,
    index: false
  },
  lastUpdate: {
    type: 'bigint',
    notNull: false,
    index: true
  },
  lastNotify: {
    type: 'bigint',
    notNull: false,
    index: false
  },
  lastNotifiedMessage: {
    type: 'bigint',
    notNull: false,
    index: false
  },
  isViewed: {
    type: 'bool',
    notNull: true,
    index: true
  },
  archived: {
    type: 'bool',
    notNull: true,
    index: true
  },
  user: {
    type: 'text',
    notNull: true,
    index: true
  }
}

const dncSchema: Schema = {
  ...baseSchema,
  objectId: {
    type: 'text',
    notNull: true,
    index: true
  },
  objectClass: {
    type: 'text',
    notNull: true,
    index: false
  },
  objectSpace: {
    type: 'text',
    notNull: true,
    index: false
  },
  // customIndexes below; a single-column index on top of them would only cost writes.
  parentObjectId: {
    type: 'text',
    notNull: false,
    index: false
  },
  parentObjectClass: {
    type: 'text',
    notNull: false,
    index: false
  },
  lastNotify: {
    type: 'bigint',
    notNull: true,
    index: false
  },
  unreadCount: {
    type: 'integer',
    notNull: true,
    index: false,
    check: '"unreadCount" >= 0'
  },
  unreadMessagesCount: {
    type: 'integer',
    notNull: true,
    index: false,
    check: '"unreadMessagesCount" >= 0'
  },
  notifiedMessagesCount: {
    type: 'integer',
    notNull: true,
    index: false,
    check: '"notifiedMessagesCount" >= 0'
  },
  user: {
    type: 'text',
    notNull: true,
    index: true
  }
}

const userNotificationSchema: Schema = {
  ...baseSchema,
  user: {
    type: 'text',
    notNull: true,
    index: true
  }
}

const timeSchema: Schema = {
  ...baseSchema,
  workslots: {
    type: 'bigint',
    notNull: false,
    index: true
  },
  doneOn: {
    type: 'bigint',
    notNull: false,
    index: true
  },
  user: {
    type: 'text',
    notNull: true,
    index: true
  },
  rank: {
    type: 'text',
    notNull: true,
    index: false
  }
}

const calendarSchema: Schema = {
  ...baseSchema,
  hidden: {
    type: 'bool',
    notNull: true,
    index: true
  }
}

const eventSchema: Schema = {
  ...defaultSchema,
  calendar: {
    type: 'text',
    notNull: true,
    index: true
  },
  date: {
    type: 'bigint',
    notNull: true,
    index: true
  },
  dueDate: {
    type: 'bigint',
    notNull: true,
    index: true
  },
  participants: {
    type: 'text[]',
    notNull: true,
    index: true
  }
}

const docSyncInfo: Schema = {
  ...baseSchema,
  needSync: {
    type: 'text',
    notNull: false,
    index: false
  },
  externalVersion: {
    type: 'text',
    notNull: false,
    index: false
  },
  repository: {
    type: 'text',
    notNull: false,
    index: false
  },
  url: {
    type: 'text',
    notNull: false,
    index: false
  },
  parent: {
    type: 'text',
    notNull: false,
    index: false
  },
  objectClass: {
    type: 'text',
    notNull: false,
    index: false
  },
  deleted: {
    type: 'bool',
    notNull: false,
    index: false
  }
}

const githubLogin: Schema = {
  ...baseSchema,
  login: {
    type: 'text',
    notNull: true,
    index: true
  }
}

const docReadStateSchema: Schema = {
  ...defaultSchema,
  attachedToClass: {
    type: 'text',
    notNull: true,
    index: true
  },
  // Indexed together with workspaceId in customIndexes below.
  latestMessageId: {
    type: 'text',
    notNull: false,
    index: false
  },
  latestMessageTimestamp: {
    type: 'bigint',
    notNull: false,
    index: false
  }
}

const activitySchema: Schema = {
  ...defaultSchema,
  forwardedMessage: {
    type: 'text',
    notNull: false,
    index: true
  },
  forwardFromId: {
    type: 'text',
    notNull: false,
    index: true
  },
  forwardFromClass: {
    type: 'text',
    notNull: false,
    index: true
  },
  replies: {
    type: 'integer',
    notNull: false,
    index: false
  }
}

type CustomIndexType = 'unique' | 'custom'

export const customIndexes: Record<string, Record<CustomIndexType, string[]>[]> = {
  [translateDomain('chunter_doc')]: [
    {
      unique: ['attachedTo', 'attachedToClass', 'account'],
      custom: []
    }
  ],
  [translateDomain('notification_read_state')]: [
    {
      unique: ['attachedTo', 'attachedToClass'],
      custom: [
        'CREATE INDEX IF NOT EXISTS notification_read_state_workspaceId_latestMessageId__index ON notification_read_state ("workspaceId", "latestMessageId");',
        'CREATE INDEX IF NOT EXISTS notification_read_state_workspaceId_latestMessageTimestamp__index ON notification_read_state ("workspaceId", "latestMessageTimestamp");'
      ]
    }
  ],
  [translateDomain('notification-dnc')]: [
    {
      unique: ['user', 'objectId', 'objectClass'],
      custom: [
        'CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_objectId__index ON notification_dnc ("workspaceId", "objectId");',
        'CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_parentObjectId__index ON notification_dnc ("workspaceId", "parentObjectId");',
        'CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_user_lastNotify_desc__index ON notification_dnc ("workspaceId", "user", "lastNotify" DESC);',
        'CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_user_unread__index ON notification_dnc ("workspaceId", "user", "unreadCount") WHERE "unreadCount" > 0;',
        'CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_user_objectClass__index ON notification_dnc ("workspaceId", "user", "objectClass");',
        'CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_user_unreadMessages__index ON notification_dnc ("workspaceId", "user", "unreadMessagesCount") WHERE "unreadMessagesCount" > 0;',
        'CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_user_notifiedMessages__index ON notification_dnc ("workspaceId", "user", "notifiedMessagesCount") WHERE "notifiedMessagesCount" > 0;'
      ]
    }
  ],
  [DOMAIN_SPACE]: [
    {
      unique: [],
      custom: [
        'CREATE UNIQUE INDEX IF NOT EXISTS space_unique_workspaceId_referenceId__index ON space ("workspaceId", "referenceId") WHERE "referenceId" IS NOT NULL;'
      ]
    }
  ],
  [translateDomain('activity')]: [
    {
      unique: [],
      custom: [
        'CREATE INDEX IF NOT EXISTS activity_attachedTo_createdOn__index ON activity ("workspaceId", "attachedTo", "createdOn" DESC);',
        'CREATE INDEX IF NOT EXISTS activity_workspaceId_modifiedOn_threads__index ON activity ("workspaceId", "modifiedOn" DESC) WHERE replies > 0;'
      ]
    }
  ]
}

export function addSchema (domain: string, schema: Schema): void {
  domainSchemas[translateDomain(domain)] = schema
  domainSchemaFields.set(domain, createSchemaFields(schema))
}

export function translateDomain (domain: string): string {
  return domain.replaceAll('-', '_')
}

export const domainSchemas: Record<string, Schema> = {
  [DOMAIN_SPACE]: spaceSchema,
  [DOMAIN_TX]: txSchema,
  [DOMAIN_MODEL_TX]: txSchema,
  [translateDomain('time')]: timeSchema,
  [translateDomain('calendar')]: calendarSchema,
  [translateDomain('event')]: eventSchema,
  notification: notificationSchema,
  [translateDomain('notification-dnc')]: dncSchema,
  [translateDomain('notification-user')]: userNotificationSchema,
  [translateDomain('github_sync')]: docSyncInfo,
  [translateDomain('github_user')]: githubLogin,
  [DOMAIN_RELATION]: relationSchema,
  [DOMAIN_COLLABORATOR]: collaboratorSchema,
  [translateDomain('chunter_doc')]: chatSchema,
  kanban: defaultSchema,
  [translateDomain('attachment')]: attachmentSchema,
  [translateDomain('notification_read_state')]: docReadStateSchema,
  [translateDomain('activity')]: activitySchema
}

// Snapshot of the schemas declared above. `domainSchemas` is replaced per domain by what the
// database actually has (see `getTableSchema` in utils.ts); this copy keeps the declared shape so
// the loader can report columns a table is missing.
export const declaredSchemas: Readonly<Record<string, Schema>> = { ...domainSchemas }

export function getSchema (domain: string): Schema {
  return domainSchemas[translateDomain(domain)] ?? defaultSchema
}

export function getDocFieldsByDomains (domain: string): string[] {
  const schema = domainSchemas[translateDomain(domain)] ?? defaultSchema
  return Object.keys(schema)
}

export interface SchemaAndFields {
  schema: Schema

  fields: string[]
  domainFields: Set<string>
}

function createSchemaFields (schema: Schema): SchemaAndFields {
  const fields = Object.keys(schema)
  const domainFields = new Set(Object.keys(schema))
  return { schema, fields, domainFields }
}

const defaultSchemaFields: SchemaAndFields = createSchemaFields(defaultSchema)

const domainSchemaFields = new Map<string, SchemaAndFields>()
for (const [domain, _schema] of Object.entries(domainSchemas)) {
  domainSchemaFields.set(domain, createSchemaFields(_schema))
}

export function getSchemaAndFields (domain: string): SchemaAndFields {
  return domainSchemaFields.get(translateDomain(domain)) ?? defaultSchemaFields
}
