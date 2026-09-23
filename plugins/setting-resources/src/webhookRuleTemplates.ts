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
import { type WebhookRuleCondition } from '@hcengineering/setting'

export interface WebhookRuleTemplateRule {
  name: string
  match: WebhookRuleCondition[]
  forEach?: string
  where?: WebhookRuleCondition[]
  fields: Partial<Record<ApiKeyOperation, Record<string, string>>>
}

export interface WebhookRuleTemplate {
  id: string
  label: string
  docsUrl: string
  sample: Record<string, unknown>
  rules: WebhookRuleTemplateRule[]
}

// Samples/paths verified against each template's `docsUrl`. `labels`/`annotations` sub-keys
// (alertname, severity, instance, summary) are Prometheus convention, not the webhook schema itself.
const alertmanagerAlerts = [
  {
    status: 'firing',
    labels: { alertname: 'HighErrorRate', severity: 'critical', instance: 'api-1:9090' },
    annotations: { summary: 'Error rate above 5% for 10m' },
    startsAt: '2026-09-21T10:00:00Z',
    endsAt: '0001-01-01T00:00:00Z',
    generatorURL: 'http://prometheus.example.com/graph?g0.expr=...',
    fingerprint: 'a1b2c3d4e5f6'
  },
  {
    status: 'resolved',
    labels: { alertname: 'DiskSpaceLow', severity: 'warning', instance: 'db-2:9100' },
    annotations: { summary: 'Disk usage back under 80%' },
    startsAt: '2026-09-21T09:40:00Z',
    endsAt: '2026-09-21T10:05:00Z',
    generatorURL: 'http://prometheus.example.com/graph?g0.expr=...',
    fingerprint: 'f6e5d4c3b2a1'
  }
]

function alertRules (issueBody: string): WebhookRuleTemplateRule[] {
  return [
    {
      name: 'firing',
      match: [],
      forEach: 'alerts',
      where: [{ path: 'status', op: 'eq', value: 'firing' }],
      fields: {
        'chat:post': {
          message:
            '🔥 **FIRING** 🔥\n\n**{{labels.alertname}}**\n\nSeverity: {{labels.severity}}\n\nInstance: {{labels.instance}}\n\nSummary: {{annotations.summary}}'
        },
        'issue:create': {
          title: '{{labels.alertname}}: {{labels.instance}}',
          body: `Severity: {{labels.severity}}\n\n{{annotations.summary}}\n\nSource: {{${issueBody}}}`
        }
      }
    },
    {
      name: 'resolved',
      match: [],
      forEach: 'alerts',
      where: [{ path: 'status', op: 'eq', value: 'resolved' }],
      fields: {
        'chat:post': {
          message:
            '✅ **RESOLVED** ✅\n\n**{{labels.alertname}}**\n\nSeverity: {{labels.severity}}\n\nInstance: {{labels.instance}}\n\nSummary: {{annotations.summary}}'
        }
      }
    }
  ]
}

export const webhookRuleTemplates: WebhookRuleTemplate[] = [
  {
    id: 'alertmanager',
    label: 'Prometheus Alertmanager',
    docsUrl: 'https://prometheus.io/docs/alerting/latest/configuration/#webhook_config',
    sample: {
      version: '4',
      groupKey: '{}:{alertname="HighErrorRate"}',
      truncatedAlerts: 0,
      status: 'firing',
      receiver: 'webhook',
      groupLabels: { alertname: 'HighErrorRate' },
      commonLabels: { alertname: 'HighErrorRate', severity: 'critical' },
      commonAnnotations: { summary: 'Error rate above 5% for 10m' },
      externalURL: 'http://alertmanager.example.com',
      alerts: alertmanagerAlerts
    },
    rules: alertRules('generatorURL')
  },
  {
    id: 'grafana',
    label: 'Grafana',
    docsUrl:
      'https://grafana.com/docs/grafana/latest/alerting/configure-notifications/manage-contact-points/integrations/webhook-notifier/',
    sample: {
      receiver: 'webhook',
      status: 'firing',
      orgId: 1,
      alerts: alertmanagerAlerts.map((a) => ({
        ...a,
        silenceURL: 'https://grafana.example.com/alerting/silence/new',
        dashboardURL: 'https://grafana.example.com/d/dashboard-uid',
        panelURL: 'https://grafana.example.com/d/dashboard-uid?viewPanel=2',
        values: { B: 7.2 }
      })),
      groupLabels: { alertname: 'HighErrorRate' },
      commonLabels: { alertname: 'HighErrorRate', severity: 'critical' },
      commonAnnotations: { summary: 'Error rate above 5% for 10m' },
      externalURL: 'https://grafana.example.com/',
      version: '1',
      groupKey: '{}:{}',
      truncatedAlerts: 0,
      title: '[FIRING:1] HighErrorRate (critical)',
      state: 'alerting',
      message: 'Error rate above 5% for 10m'
    },
    rules: alertRules('dashboardURL')
  },
  {
    id: 'gitlab-push',
    label: 'GitLab - push event',
    docsUrl: 'https://docs.gitlab.com/user/project/integrations/webhook_events/',
    sample: {
      object_kind: 'push',
      event_name: 'push',
      before: '95790bf891e76fee5e1747ab589903a6a1f80f22',
      after: 'da1560886d4f094c3e6c9ef40349f7d38b5d27d7',
      ref: 'refs/heads/master',
      checkout_sha: 'da1560886d4f094c3e6c9ef40349f7d38b5d27d7',
      user_id: 4,
      user_name: 'John Smith',
      user_username: 'jsmith',
      project: {
        name: 'Diaspora',
        path_with_namespace: 'mike/diaspora',
        web_url: 'http://example.com/mike/diaspora'
      },
      commits: [
        {
          id: 'b6568db1bc1dcd7f8b4d5a946b0b91f9dacd7327',
          message: 'Update Catalan translation to e38cb41.'
        }
      ],
      total_commits_count: 4
    },
    rules: [
      {
        name: 'push',
        match: [{ path: 'object_kind', op: 'eq', value: 'push' }],
        fields: {
          'chat:post': {
            message:
              '{{user_name}} pushed {{total_commits_count}} commit(s) to {{ref}} in {{project.path_with_namespace}}'
          }
        }
      }
    ]
  },
  {
    id: 'gitlab-pipeline',
    label: 'GitLab - pipeline event',
    docsUrl: 'https://docs.gitlab.com/user/project/integrations/webhook_events/',
    sample: {
      object_kind: 'pipeline',
      object_attributes: {
        id: 31,
        ref: 'master',
        status: 'failed',
        detailed_status: 'failed',
        url: 'http://example.com/gitlab-org/gitlab-test/-/pipelines/31'
      },
      project: {
        name: 'Gitlab Test',
        path_with_namespace: 'gitlab-org/gitlab-test',
        web_url: 'http://example.com/gitlab-org/gitlab-test'
      },
      commit: {
        id: 'bcbb5ec396a2c0f828686f14fac9b80b780504f2',
        message: 'test',
        url: 'http://example.com/gitlab-org/gitlab-test/commit/bcbb5ec396a2c0f828686f14fac9b80b780504f2',
        author: { name: 'Administrator', email: 'user@gitlab.com' }
      },
      user: { name: 'Administrator', username: 'root' }
    },
    rules: [
      {
        name: 'failed pipeline',
        match: [
          { path: 'object_kind', op: 'eq', value: 'pipeline' },
          { path: 'object_attributes.status', op: 'eq', value: 'failed' }
        ],
        fields: {
          'issue:create': {
            title:
              'Pipeline {{object_attributes.status}} on {{object_attributes.ref}} ({{project.path_with_namespace}})',
            body: 'Commit {{commit.id}} by {{commit.author.name}}: {{commit.message}}\n\n{{object_attributes.url}}'
          },
          'chat:post': {
            message: 'Pipeline {{object_attributes.status}} on {{object_attributes.ref}} - {{object_attributes.url}}'
          }
        }
      }
    ]
  },
  {
    id: 'sentry-issue-alert',
    label: 'Sentry - issue alert',
    docsUrl: 'https://docs.sentry.io/organization/integrations/integration-platform/webhooks/issue-alerts/',
    sample: {
      action: 'triggered',
      actor: { id: 'sentry', name: 'Sentry', type: 'application' },
      data: {
        event: {
          event_id: 'e4874d664c3540c1a32eab185f12c5ab',
          title: 'ReferenceError: heck is not defined',
          culprit: '?(<anonymous>)',
          level: 'error',
          platform: 'javascript',
          url: 'https://sentry.io/api/0/projects/test-org/front-end/events/e4874d664c3540c1a32eab185f12c5ab/',
          web_url:
            'https://sentry.io/organizations/test-org/issues/1117540176/events/e4874d664c3540c1a32eab185f12c5ab/',
          issue_url: 'https://sentry.io/api/0/issues/1117540176/',
          issue_id: '1117540176',
          metadata: { type: 'ReferenceError', value: 'heck is not defined', filename: '<anonymous>' }
        },
        triggered_rule: 'Very Important Alert!'
      },
      installation: { uuid: 'a8e5d37a-696c-4c54-adb5-b3f28d64c7de' }
    },
    rules: [
      {
        name: 'issue alert',
        match: [{ path: 'action', op: 'eq', value: 'triggered' }],
        fields: {
          'issue:create': {
            title: '{{data.event.title}}',
            body: '{{data.event.culprit}}\n\n{{data.event.web_url}}'
          },
          'chat:post': {
            message: '[{{data.event.level}}] {{data.event.title}} - {{data.event.web_url}}'
          }
        }
      }
    ]
  }
]
