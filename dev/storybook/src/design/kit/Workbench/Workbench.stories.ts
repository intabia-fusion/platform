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
import type { Meta, StoryObj } from '@storybook/svelte'

import FramedSections from '../FramedSections.svelte'
import SizedDemo from '../demo/SizedDemo.svelte'
import WorkbenchDemo from '../demo/WorkbenchDemo.svelte'
import { person } from '../sample'
import type { NavEntry } from '../types'
import AppRail from './AppRail.svelte'
import NavGroup from './NavGroup.svelte'
import NavItem from './NavItem.svelte'
import NavSpace from './NavSpace.svelte'
import Navigator from './Navigator.svelte'
import PanelHeader from './PanelHeader.svelte'
import Sidebar from './Sidebar.svelte'
import SpaceHeader from './SpaceHeader.svelte'
import TopBar from './TopBar.svelte'
import { railApps, sidebarWidgets } from './apps'

const meta: Meta = {
  title: 'Kit (pen.dev)/Workbench',
  tags: ['!autodocs'],
  parameters: { layout: 'padded', controls: { disable: true } }
}

export default meta
type Story = StoryObj<typeof meta>

export const Workbench: Story = {
  render: () => ({ Component: WorkbenchDemo, props: {} })
}

export const WithSidePanel: Story = {
  render: () => ({ Component: WorkbenchDemo, props: { panel: true } })
}

const sections = (list: unknown[]): Story => ({
  render: (_args, { title, name }) => ({
    Component: FramedSections,
    props: { sections: list, title: `${title.slice(title.lastIndexOf('/') + 1)} - ${name}` }
  })
})

const one = [{ title: '', props: {} }]
const sized = (
  component: unknown,
  width: number,
  height: number,
  props: Record<string, unknown>,
  nav = false
): Record<string, unknown> => ({
  component,
  width,
  height,
  nav,
  props
})

const entries: NavEntry[] = [
  { item: 'My issues', icon: 'kit/Crosshair' },
  { item: 'All issues', icon: 'kit/CheckSquare', count: 12 },
  { divider: true },
  { group: 'Your projects', add: true },
  { space: 'Mobile app', icon: 'kit/HouseFill', color: 'Porpoise' },
  { item: 'Issues', icon: 'kit/CheckSquare', selected: true, indent: true }
]

export const TopBarStates: Story = sections([
  {
    title: 'TopBar',
    component: SizedDemo,
    rows: [
      { title: 'tracker', props: sized(TopBar, 640, 36, { tab: { label: 'Tracker', icon: 'kit/CheckSquare' } }) },
      { title: 'calendar', props: sized(TopBar, 640, 36, { tab: { label: 'Calendar', icon: 'kit/Calendar' } }) }
    ],
    columns: one
  }
])

export const AppRailStates: Story = sections([
  {
    title: 'AppRail',
    component: SizedDemo,
    rows: [
      {
        title: 'tracker selected',
        props: sized(AppRail, 80, 760, {
          workspace: 'demo',
          account: person,
          apps: railApps.map((app) => ({ ...app, selected: app.app === 'tracker' }))
        })
      }
    ],
    columns: one
  }
])

export const SidebarStates: Story = sections([
  {
    title: 'Sidebar',
    component: SizedDemo,
    rows: [
      { title: 'none selected', props: sized(Sidebar, 56, 240, { widgets: sidebarWidgets.map((icon) => ({ icon })) }) },
      {
        title: 'selected widget',
        props: sized(Sidebar, 56, 240, { widgets: sidebarWidgets.map((icon, i) => ({ icon, selected: i === 1 })) })
      },
      { title: 'single widget', props: sized(Sidebar, 56, 240, { widgets: [{ icon: 'kit/Calendar' }] }) }
    ],
    columns: one
  }
])

export const NavigatorStates: Story = sections([
  {
    title: 'Navigator',
    component: SizedDemo,
    rows: [
      {
        title: 'with New button',
        props: sized(Navigator, 260, 420, { title: 'Tracker', newLabel: 'New issue', entries }, true)
      },
      { title: 'without New button', props: sized(Navigator, 260, 420, { title: 'Tracker', entries }, true) }
    ],
    columns: one
  }
])

export const NavItemStates: Story = sections([
  {
    title: 'NavItem',
    component: SizedDemo,
    rows: [
      { title: 'plain', props: sized(NavItem, 240, 40, { label: 'All issues', icon: 'kit/CheckSquare' }) },
      {
        title: 'selected',
        props: sized(NavItem, 240, 40, { label: 'All issues', icon: 'kit/CheckSquare', selected: true })
      },
      { title: 'indent', props: sized(NavItem, 240, 40, { label: 'Issues', icon: 'kit/CheckSquare', indent: true }) },
      { title: 'count', props: sized(NavItem, 240, 40, { label: 'All issues', icon: 'kit/CheckSquare', count: 12 }) }
    ],
    columns: one
  }
])

export const NavGroupStates: Story = sections([
  {
    title: 'NavGroup',
    component: SizedDemo,
    rows: [
      { title: 'plain', props: sized(NavGroup, 240, 56, { label: 'Your projects' }) },
      { title: 'with add', props: sized(NavGroup, 240, 56, { label: 'Your projects', add: true }) }
    ],
    columns: one
  }
])

export const NavSpaceStates: Story = sections([
  {
    title: 'NavSpace',
    component: SizedDemo,
    rows: [
      { title: 'default icon', props: sized(NavSpace, 240, 40, { label: 'Mobile app' }) },
      {
        title: 'own icon and color',
        props: sized(NavSpace, 240, 40, { label: 'Web', icon: 'kit/CheckSquare', color: 'Orange' })
      }
    ],
    columns: one
  }
])

export const SpaceHeaderStates: Story = sections([
  {
    title: 'SpaceHeader',
    component: SizedDemo,
    rows: [
      {
        title: 'list',
        props: sized(SpaceHeader, 720, 110, { view: 'list', title: 'Issues', titleIcon: 'kit/CheckSquare' })
      },
      {
        title: 'board',
        props: sized(SpaceHeader, 720, 110, { view: 'board', title: 'Issues', titleIcon: 'kit/CheckSquare' })
      },
      {
        title: 'custom tabs',
        props: sized(SpaceHeader, 720, 110, { view: 'list', title: 'Backlog', tabs: ['Open', 'Closed'], tab: 'Closed' })
      }
    ],
    columns: one
  }
])

export const PanelHeaderStates: Story = sections([
  {
    title: 'PanelHeader',
    component: SizedDemo,
    rows: [
      {
        title: 'title with icon',
        props: sized(PanelHeader, 640, 60, { title: 'Workspace settings', icon: 'kit/Gear' })
      },
      { title: 'chat channel', props: sized(PanelHeader, 640, 60, { title: 'general', icon: 'kit/Hash' }) }
    ],
    columns: one
  }
])
