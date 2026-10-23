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
  import Board from './Board.svelte'
  import { createFixtures, viewerSamples } from './fixtures'
  import ViewerFrame from './ViewerFrame.svelte'

  const f = createFixtures()
  const samples: Array<{ key: string, title: string, navigation?: any }> = [
    { key: 'image', title: 'Picture · paging through a chat', navigation: { prev: () => {}, next: () => {} } },
    { key: 'imageLight', title: 'Light screenshot · the first file of a chat', navigation: { next: () => {} } },
    ...Object.entries(viewerSamples)
      .filter(([key]) => key !== 'image' && key !== 'imageLight')
      .map(([key, title]) => ({ key, title }))
  ]
</script>

<Board>
  {#each samples as { key, title, navigation }}
    <ViewerFrame {title} value={f[key]} {navigation} />
  {/each}
</Board>
