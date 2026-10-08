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
import type { Viewlet, ViewletPreference } from '@hcengineering/view'
import { injectCustomAttributes } from './customAttributes'

export function buildViewletConfigurations (
  viewlet: Viewlet,
  configurationRaw: Viewlet[],
  preference: ViewletPreference[]
): Record<Ref<Class<Doc>>, Viewlet['config']> {
  // configurationRaw may still hold the previous descriptor's viewlets, e.g. kanban for a list.
  const raw = configurationRaw.filter(
    (it) => it.descriptor === viewlet.descriptor && (it.variant ?? '') === (viewlet.variant ?? '')
  )
  const configurations: Record<Ref<Class<Doc>>, Viewlet['config']> = {}

  for (const v of raw) {
    configurations[v.attachTo] = v.config
  }

  // Add viewlet configurations.
  for (const pref of preference) {
    const vl = raw.find((it) => it._id === pref.attachedTo)
    if (vl === undefined) continue
    const base = pref.config.length > 0 ? pref.config : vl.config
    configurations[vl.attachTo] = injectCustomAttributes(base, pref.customAttributes)
  }

  return configurations
}
