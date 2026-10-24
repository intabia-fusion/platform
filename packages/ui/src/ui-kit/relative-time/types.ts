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
 * - `ago` - how long ago `value` (a timestamp) was: «5 minutes ago»; the full date on hover;
 * - `countdown` - time left until `value` (a timestamp): «04:59», «1:04:59», then «3 days»; nothing once it is over;
 * - `offset` - `value` is a shift in milliseconds from an event: «in 15 minutes», «2 hours before».
 */
export type RelativeTimeFormat = 'ago' | 'countdown' | 'offset'

export interface RelativeTimeProps {
  /** A timestamp for `ago` and `countdown`, a shift in milliseconds for `offset`; nothing is shown without it. */
  value?: number | null
  format?: RelativeTimeFormat
  /** With `offset`: days, hours and minutes in short form (`1d 2h 30m`) instead of the largest unit. */
  exact?: boolean
}

export interface RelativeTimeEvents {
  /** With `countdown`: the time is over. */
  timeout: CustomEvent<null>
}
