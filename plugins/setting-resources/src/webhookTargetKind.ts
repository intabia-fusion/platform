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

import { type ApiKeyOperation } from '@hcengineering/account-client'
import { type Class, type Doc, type DocumentQuery, type Ref } from '@hcengineering/core'
import { type IntlString } from '@hcengineering/platform'
import { type ObjectSearchCategory } from '@hcengineering/presentation'
import { type WebhookRuleTargetKind } from '@hcengineering/setting'
import settingsRes from './plugin'

// Class ids as string literals - the same escape hatch export-resources uses to avoid a
// tracker/chunter/document dependency, which is forbidden here.
const projectClass = 'tracker:class:Project' as Ref<Class<Doc>>
const issueClass = 'tracker:class:Issue' as Ref<Class<Doc>>
const channelClass = 'chunter:class:Channel' as Ref<Class<Doc>>
const teamspaceClass = 'document:class:Teamspace' as Ref<Class<Doc>>
const documentClass = 'document:class:Document' as Ref<Class<Doc>>
// Spotlight finds an issue by its identifier too - a title-only search can't reach "TSK-12".
const issueCategory = 'tracker:completion:IssueCategory' as Ref<ObjectSearchCategory>

export const PLACEHOLDER_KEY = '<API_KEY>'
export const PLACEHOLDER_REPORT = '<REPORT_ID>'

/** What each operation acts on, so only targets of that kind can be picked. Keep in step with
 * pod-webhook's src/targets.ts and pods/server/src/opsApi.ts. */
export interface TargetKind {
  _class: Ref<Class<Doc>>
  docQuery?: DocumentQuery<Doc>
  searchField: string
  category?: Ref<ObjectSearchCategory>
  // Body field carrying the target.
  bodyField: 'space' | 'issue' | 'document'
  // Doc field substituted into the example, and stored as WebhookRuleTarget.id.
  field: 'identifier' | '_id'
  placeholder: string
  hint: IntlString
  kind: WebhookRuleTargetKind
}

export function targetKind (op: ApiKeyOperation): TargetKind {
  switch (op) {
    case 'issue:create':
      return {
        _class: projectClass,
        searchField: 'name',
        bodyField: 'space',
        field: 'identifier',
        placeholder: '<PROJECT_IDENTIFIER>',
        hint: settingsRes.string.WebhookIncomingPlaceholderProject,
        kind: 'Project'
      }
    case 'issue:update':
    case 'issue:comment':
    case 'issue:time_report':
      return {
        _class: issueClass,
        searchField: 'title',
        category: issueCategory,
        bodyField: 'issue',
        field: 'identifier',
        placeholder: '<ISSUE_IDENTIFIER>',
        hint: settingsRes.string.WebhookIncomingPlaceholderIssue,
        kind: 'Issue'
      }
    case 'chat:post':
      return {
        _class: channelClass,
        searchField: 'name',
        bodyField: 'space',
        field: '_id',
        placeholder: '<CHANNEL_ID>',
        hint: settingsRes.string.WebhookIncomingPlaceholderChannel,
        kind: 'Channel'
      }
    case 'doc:create':
      return {
        _class: teamspaceClass,
        searchField: 'name',
        bodyField: 'space',
        field: '_id',
        placeholder: '<TEAMSPACE_ID>',
        hint: settingsRes.string.WebhookIncomingPlaceholderTeamspace,
        kind: 'Teamspace'
      }
    case 'doc:update':
      return {
        _class: documentClass,
        searchField: 'title',
        bodyField: 'document',
        field: '_id',
        placeholder: '<DOCUMENT_ID>',
        hint: settingsRes.string.WebhookIncomingPlaceholderDocument,
        kind: 'Document'
      }
  }
}

export interface WebhookExample {
  title: string
  json: Record<string, unknown>
  hint?: IntlString
}

export function buildWebhookExamples (op: ApiKeyOperation, targetValue: string | undefined): WebhookExample[] {
  const kind = targetKind(op)
  const hint = targetValue === undefined ? kind.hint : undefined
  const targetEntry = { [kind.bodyField]: targetValue ?? kind.placeholder }
  switch (op) {
    case 'issue:create':
      return [
        {
          title: op,
          json: {
            action: op,
            ...targetEntry,
            title: 'Payment webhook retries indefinitely',
            body: '## Steps to reproduce\n\n1. Trigger a webhook delivery\n2. Watch it retry forever'
          },
          hint
        }
      ]
    case 'issue:update':
      return [
        {
          title: op,
          json: {
            action: op,
            ...targetEntry,
            title: 'Payment webhook stops retrying after fix',
            body: 'Confirmed fixed after deploying the retry-cap change.'
          },
          hint
        }
      ]
    case 'issue:comment':
      return [
        {
          title: op,
          json: { action: op, ...targetEntry, message: 'Reproduced on staging, looking into the retry loop now.' },
          hint
        }
      ]
    case 'issue:time_report':
      // Two shapes for one operation: without `id` it logs time, with `id` it corrects the very
      // report an outgoing `issue.time_reported` announced.
      return [
        {
          title: `${op} - create`,
          json: {
            action: op,
            ...targetEntry,
            employee: 'user@example.com',
            date: '2026-09-03',
            hours: 2.5,
            description: 'Investigated the retry loop'
          },
          hint
        },
        {
          title: `${op} - update`,
          json: {
            action: op,
            ...targetEntry,
            id: PLACEHOLDER_REPORT,
            hours: 3.5,
            description: 'Investigated the retry loop and the backoff cap'
          },
          hint
        }
      ]
    case 'chat:post':
      return [{ title: op, json: { action: op, ...targetEntry, message: 'Deploy finished, all green.' }, hint }]
    case 'doc:create':
      return [
        {
          title: op,
          json: {
            action: op,
            ...targetEntry,
            title: 'Q3 Roadmap',
            body: '# Roadmap\n\nMarkdown content for the new document.'
          },
          hint
        }
      ]
    case 'doc:update':
      return [
        {
          title: op,
          json: { action: op, ...targetEntry, title: 'Q3 Roadmap (revised)', body: 'Updated markdown content.' },
          hint
        }
      ]
  }
}

/** Field name suggestions for the rule editor - reuses buildWebhookExamples's sample keys instead of
 * a second hand-maintained list, minus `action` and the operation's target field. */
export function webhookOpFieldNames (op: ApiKeyOperation): string[] {
  const kind = targetKind(op)
  const names = new Set<string>()
  for (const example of buildWebhookExamples(op, undefined)) {
    for (const key of Object.keys(example.json)) {
      if (key === 'action' || key === kind.bodyField) continue
      names.add(key)
    }
  }
  return Array.from(names)
}
