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

/**
 * Columns of the grouped list of meetings, one per entry of the config of
 * `love.viewlet.ListPermanentMeetings`: the meeting itself, its next occurrence, the members and the
 * last session. Fixed widths are what makes the row a grid, so the caption row above the list has the
 * same columns as the cells under it.
 */
export const MEETING_LIST_COLUMNS = [
  'minmax(14rem, 1fr)',
  'minmax(10rem, 12rem)',
  'minmax(8rem, 10rem)',
  'minmax(10rem, 12rem)'
]

/** Below this the row scrolls sideways instead of squeezing its columns. */
export const MEETING_LIST_MIN_ROW_WIDTH = '52rem'

/** The lead column of a row: the checkbox, before the first configured attribute. */
export const MEETING_LIST_LEAD_COLUMN = '1.5rem'
