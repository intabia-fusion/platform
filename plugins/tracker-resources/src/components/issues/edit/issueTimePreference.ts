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

import view, { type Viewlet } from '@hcengineering/view'
import tracker from '../../../plugin'

export function normalizeIssueTimeConfig (config: Viewlet['config'], source: Viewlet): Viewlet['config'] {
  if (
    source.config.some((column) => typeof column !== 'string' && column.presenter === tracker.component.IssuePresenter)
  ) {
    config = config.map((column) => {
      const key = typeof column === 'string' ? column : column.key
      if (key !== 'createdOn' && key !== 'modifiedOn') return column
      const current = source.config.find(
        (item) => typeof item !== 'string' && item.key === key && item.presenter === view.component.TimestampLabel
      )
      if (current === undefined || typeof current === 'string') return column
      if (typeof column !== 'string' && column.displayProps?.key !== current.displayProps?.key) return column
      return { ...current, displayProps: { ...current.displayProps, fixed: 'center' } }
    })
  }
  const sourceEstimation = source.config.find(
    (column) => typeof column !== 'string' && column.props?.showReportedTime === true
  )
  if (sourceEstimation === undefined || typeof sourceEstimation === 'string') return config
  const estimation =
    source.variant === 'subissue'
      ? { ...sourceEstimation, props: { ...sourceEstimation.props, widthScope: 'subissue' } }
      : sourceEstimation
  const hasEstimation = config.some(
    (column) => typeof column !== 'string' && column.displayProps?.key === estimation.displayProps?.key
  )
  return config.flatMap((column) => {
    const key = typeof column === 'string' ? column : column.key
    if (key === 'reportedTime') return !hasEstimation ? [estimation] : []
    if (typeof column !== 'string' && column.displayProps?.key === estimation.displayProps?.key) {
      return [estimation]
    }
    return [column]
  })
}
