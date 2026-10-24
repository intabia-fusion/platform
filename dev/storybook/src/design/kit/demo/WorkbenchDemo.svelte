<!--
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
-->
<script lang="ts">
  import Frame from '../Frame.svelte'
  import { person } from '../sample'
  import type { NavEntry } from '../types'
  import Navigator from '../Workbench/Navigator.svelte'
  import SpaceHeader from '../Workbench/SpaceHeader.svelte'
  import Workbench from '../Workbench/Workbench.svelte'
  import { railApps, sidebarWidgets } from '../Workbench/apps'

  export let panel: boolean = false

  const entries: NavEntry[] = [
    { item: 'My issues', icon: 'tracker/myissues' },
    { item: 'All issues', icon: 'tracker/issues' },
    { divider: true },
    { group: 'Your projects', add: true },
    { space: 'Mobile app', icon: 'tracker/home', color: 'Porpoise' },
    { item: 'Issues', icon: 'tracker/issues', selected: true, indent: true }
  ]
</script>

<Frame title={panel ? 'Workbench with side panel' : 'Workbench'} width={1440} height={810}>
  <Workbench
    workspace="demo"
    tab={{ label: 'Tracker', icon: 'tracker/tracker' }}
    apps={railApps.map((app) => ({ ...app, selected: app.app === 'tracker' }))}
    widgets={sidebarWidgets.map((icon) => ({ icon }))}
    account={person}
    {panel}
  >
    <svelte:fragment slot="navigator"><Navigator title="Tracker" newLabel="New issue" {entries} /></svelte:fragment>
    <SpaceHeader view="board" title="Issues" titleIcon="tracker/issues" />
    <svelte:fragment slot="panel"><div style="padding: 1rem">Side panel</div></svelte:fragment>
  </Workbench>
</Frame>
