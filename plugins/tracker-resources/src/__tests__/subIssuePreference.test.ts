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

import type { Viewlet, ViewletPreference } from '@hcengineering/view'
import { normalizeIssueTimeConfig } from '../components/issues/edit/issueTimePreference'
import tracker from '../plugin'
import view from '@hcengineering/view'

const combined = {
  key: '',
  displayProps: { key: 'subestimation', dividerBefore: true },
  props: { showReportedTime: true }
}
const previous = { key: '', displayProps: { key: 'subestimation' } }
const reported = { key: 'reportedTime', displayProps: { key: 'subreportedTime' } }
const source = { config: [combined] } as unknown as Viewlet

it('isolates subissue widths for saved and live configurations', () => {
  const subissues = { variant: 'subissue', config: [combined] } as unknown as Viewlet
  const expected = { ...combined, props: { ...combined.props, widthScope: 'subissue' } }
  expect(normalizeIssueTimeConfig([previous] as unknown as Viewlet['config'], subissues)).toEqual([expected])
  expect(normalizeIssueTimeConfig(subissues.config, subissues)).toEqual([expected])
  expect(normalizeIssueTimeConfig(source.config, source)).toEqual([combined])
})

it('replaces the old columns with one combined column and preserves unrelated columns', () => {
  for (const columns of [[reported], [previous], [reported, previous]]) {
    const pref = { config: ['title', ...columns, 'assignee'] } as unknown as ViewletPreference
    expect(normalizeIssueTimeConfig(pref.config, source)).toEqual(['title', combined, 'assignee'])
  }
  const hidden = { config: ['title', 'assignee'] } as unknown as ViewletPreference
  expect(normalizeIssueTimeConfig(hidden.config, source)).toEqual(hidden.config)
  const original = { config: [reported] } as unknown as ViewletPreference
  expect(normalizeIssueTimeConfig(original.config, { config: [] } as unknown as Viewlet)).toBe(original.config)
})

it('normalizes saved columns in the main issue list', () => {
  const estimation = {
    key: '',
    displayProps: { key: 'estimation', dividerBefore: true },
    props: { showReportedTime: true }
  }
  const oldEstimation = { key: '', displayProps: { key: 'estimation' } }
  const main = { config: [estimation] } as unknown as Viewlet
  for (const columns of [[reported], [oldEstimation], [reported, oldEstimation]]) {
    const pref = { config: ['title', ...columns, 'assignee'] } as unknown as ViewletPreference
    expect(normalizeIssueTimeConfig(pref.config, main)).toEqual(['title', estimation, 'assignee'])
  }
})

it('centers issue timestamp columns without changing other presenters or hidden columns', () => {
  const issue = { key: '', presenter: tracker.component.IssuePresenter }
  const created = {
    key: 'createdOn',
    presenter: view.component.TimestampLabel,
    displayProps: { key: 'created', fixed: 'left', dividerBefore: true }
  }
  const modified = {
    key: 'modifiedOn',
    presenter: view.component.TimestampLabel,
    displayProps: { key: 'modified', fixed: 'left', dividerBefore: true }
  }
  const other = {
    key: 'createdOn',
    presenter: tracker.component.IssuePresenter,
    displayProps: { key: 'other', fixed: 'left' }
  }
  const source = { config: [issue, created, modified] } as unknown as Viewlet
  const config = [other, created] as unknown as Viewlet['config']
  expect(normalizeIssueTimeConfig(config, source)).toEqual([
    other,
    { ...created, displayProps: { ...created.displayProps, fixed: 'center' } }
  ])
  expect(normalizeIssueTimeConfig([modified] as unknown as Viewlet['config'], source)).toEqual([
    { ...modified, displayProps: { ...modified.displayProps, fixed: 'center' } }
  ])
  expect(normalizeIssueTimeConfig(config, { config: [created, modified] } as unknown as Viewlet)).toEqual(config)
})

it('replaces legacy timestamp columns with the current columns without changing their order', () => {
  const issue = { key: '', presenter: tracker.component.IssuePresenter }
  const created = {
    key: 'createdOn',
    presenter: view.component.TimestampLabel,
    displayProps: { key: 'created', fixed: 'center', dividerBefore: true },
    props: { label: 'created' }
  }
  const modified = {
    key: 'modifiedOn',
    presenter: view.component.TimestampLabel,
    displayProps: { key: 'modified', fixed: 'center', dividerBefore: true },
    props: { label: 'modified' }
  }
  const oldCreated = { key: 'createdOn', displayProps: { key: 'created', fixed: 'left', dividerBefore: true } }
  const oldModified = {
    key: 'modifiedOn',
    presenter: 'tracker:component:ModificationDatePresenter',
    displayProps: { key: 'modified', fixed: 'left', dividerBefore: true }
  }
  const source = { config: [issue, created, modified] } as unknown as Viewlet
  const config = ['title', oldModified, 'assignee', oldCreated] as unknown as Viewlet['config']
  expect(normalizeIssueTimeConfig(config, source)).toEqual(['title', modified, 'assignee', created])
  expect(normalizeIssueTimeConfig(['title', oldCreated] as unknown as Viewlet['config'], source)).toEqual([
    'title',
    created
  ])
  expect(normalizeIssueTimeConfig(['title', 'createdOn'] as unknown as Viewlet['config'], source)).toEqual([
    'title',
    created
  ])
  expect(normalizeIssueTimeConfig(config, { config: [created, modified] } as unknown as Viewlet)).toEqual(config)
})
