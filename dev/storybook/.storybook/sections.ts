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

import { type API, addons, types, useAddonState, useStorybookApi, useStorybookState } from '@storybook/manager-api'
import { jsx, styled } from '@storybook/theming'

const ADDON_ID = 'fusion/sections'
const STORAGE_KEY = 'fusion-storybook-section'

type SectionId = 'ui-kit' | 'plugins' | 'screens'

const sections: Array<{ id: SectionId, label: string }> = [
  { id: 'ui-kit', label: 'UI kit' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'screens', label: 'Screens' }
]

// An unlisted root goes to UI kit; null keeps the root in every tab.
const rootSections: Record<string, SectionId | null> = {
  Introduction: null,
  Activity: 'plugins',
  Attachments: 'plugins',
  Icons: 'plugins',
  'Kit (pen.dev)': 'screens'
}

// Generated screens are top-level stories marked by the tag.
function sectionOf ({ title, tags }: { title: string, tags?: string[] }): SectionId | null {
  if (tags?.includes('screen') === true) return 'screens'
  const root = title.split('/')[0]
  return root in rootSections ? rootSections[root] : 'ui-kit'
}

const lastEntry = new Map<SectionId, string>()

function savedSection (): SectionId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return sections.find(({ id }) => id === saved)?.id ?? 'ui-kit'
  } catch {
    return 'ui-kit'
  }
}

function show (api: API, section: SectionId): void {
  void api.setAddonState(ADDON_ID, section)
  void api.experimental_setFilter(ADDON_ID, (item) => {
    const itemSection = sectionOf(item)
    return itemSection == null || itemSection === section
  })
  try {
    localStorage.setItem(STORAGE_KEY, section)
  } catch {}
}

const Tabs = styled.div({
  display: 'flex',
  flexShrink: 0,
  gap: 2
})

const Tab = styled.button(({ theme }) => ({
  border: 'none',
  borderRadius: theme.input.borderRadius,
  padding: '4px 6px',
  background: 'transparent',
  color: theme.textMutedColor,
  font: 'inherit',
  fontSize: theme.typography.size.s1,
  fontWeight: theme.typography.weight.bold,
  lineHeight: '16px',
  cursor: 'pointer',
  '&:hover': { color: theme.color.defaultText },
  '&[aria-selected="true"]': { background: theme.background.hoverable, color: theme.barSelectedColor }
}))

function SectionTabs (): ReturnType<typeof jsx> {
  const api = useStorybookApi()
  const { index, storyId } = useStorybookState()
  const [active] = useAddonState<SectionId>(ADDON_ID)

  const open = (section: SectionId): void => {
    show(api, section)
    const current = index?.[storyId]
    if (current != null && 'title' in current && sectionOf(current) === section) return
    const first = Object.values(index ?? {}).find(
      (entry) => (entry.type === 'story' || entry.type === 'docs') && sectionOf(entry) === section
    )
    const target = lastEntry.get(section) ?? first?.id
    if (target != null) api.selectStory(target)
  }

  return jsx(
    Tabs,
    { role: 'tablist' },
    sections.map(({ id, label }) =>
      jsx(
        Tab,
        {
          key: id,
          role: 'tab',
          'aria-selected': id === active,
          onClick: () => {
            open(id)
          }
        },
        label
      )
    )
  )
}

export function registerSections (): void {
  addons.register(ADDON_ID, (api) => {
    show(api, savedSection())
    // A link or a search result from another tab switches to that tab.
    const follow = (): void => {
      const entry = api.getCurrentStoryData()
      const section = entry == null ? null : sectionOf(entry)
      if (section == null) return
      lastEntry.set(section, entry.id)
      if (section !== api.getAddonState<SectionId>(ADDON_ID)) show(api, section)
    }
    // On a first load storyChanged comes before the manager has the index.
    for (const event of ['storyChanged', 'storyPrepared', 'docsPrepared']) api.on(event, follow)
    addons.add(ADDON_ID, { type: types.experimental_SIDEBAR_TOP, render: SectionTabs })
  })
}
