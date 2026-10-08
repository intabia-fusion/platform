// Copyright © 2026 Intabia Fusion
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
import type { Class, Doc, Ref } from '@hcengineering/core'
import type { Viewlet, ViewletDescriptor, ViewletPreference } from '@hcengineering/view'
import { buildViewletConfigurations } from '../viewletConfigurations'

const List = 'view:viewlet:List' as Ref<ViewletDescriptor>
const Kanban = 'tracker:viewlet:Kanban' as Ref<ViewletDescriptor>
const Issue = 'tracker:class:Issue' as Ref<Class<Doc>>
const SubIssue = 'tracker:class:SubIssue' as Ref<Class<Doc>>

function viewlet (
  _id: string,
  descriptor: Ref<ViewletDescriptor>,
  attachTo: Ref<Class<Doc>>,
  config: Viewlet['config'],
  variant?: string
): Viewlet {
  return { _id, descriptor, attachTo, config, variant } as unknown as Viewlet
}

function preference (attachedTo: string, config: Viewlet['config'], customAttributes?: string[]): ViewletPreference {
  return { attachedTo, config, customAttributes } as unknown as ViewletPreference
}

const issueList = viewlet('IssueList', List, Issue, ['identifier', 'title', 'status'])
const subIssueList = viewlet('SubIssueList', List, SubIssue, ['identifier', 'title'])
const issueKanban = viewlet('IssueKanban', Kanban, Issue, ['subIssues', 'priority', 'milestone'])

describe('buildViewletConfigurations', () => {
  test('ignores viewlets of the previous descriptor until the query answers', () => {
    // Switched kanban -> list before the query answered.
    const result = buildViewletConfigurations(issueList, [issueKanban], [preference('IssueKanban', ['priority'])])
    expect(result).toEqual({})
  })

  test('keeps per-class configs of the current descriptor only', () => {
    // Kanban last: without the filter it would win.
    const result = buildViewletConfigurations(issueList, [issueList, subIssueList, issueKanban], [])
    expect(result).toEqual({ [Issue]: issueList.config, [SubIssue]: subIssueList.config })
  })

  test('matches the variant the way the query does', () => {
    const subVariant = viewlet('IssueListSub', List, Issue, ['title'], 'sub')
    const noVariant = viewlet('IssueListEmpty', List, SubIssue, ['identifier'], '')

    expect(buildViewletConfigurations(issueList, [subVariant, noVariant], [])).toEqual({
      [SubIssue]: noVariant.config
    })
    expect(buildViewletConfigurations(subVariant, [issueList, subVariant], [])).toEqual({
      [Issue]: subVariant.config
    })
  })

  test('applies preferences of the current descriptor viewlets', () => {
    const result = buildViewletConfigurations(
      issueList,
      [issueList, subIssueList],
      [preference('IssueList', ['title']), preference('SubIssueList', [], ['severity'])]
    )
    expect(result[Issue]).toEqual(['title'])
    expect(result[SubIssue]).toEqual([
      ...(subIssueList.config as string[]),
      { key: 'severity', displayProps: { key: 'custom_severity', compression: true, custom: true } }
    ])
  })
})
