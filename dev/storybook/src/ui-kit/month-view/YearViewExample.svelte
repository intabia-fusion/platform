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
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { YearView, type YearViewProps } from '@hcengineering/ui/kit'

  export let props: YearViewProps = {}

  // Days with events in the sample: the 7th and the 15th of every month, and today.
  const today = new Date().toDateString()
  const marked = (date: Date): boolean => date.getDate() === 7 || date.getDate() === 15 || date.toDateString() === today
  const dayTooltip = (date: Date): { label: ReturnType<typeof getEmbeddedLabel> } | undefined =>
    marked(date) ? { label: getEmbeddedLabel('2 events') } : undefined
  let value = new Date(2026, 9, 15).getTime()
</script>

<div class="year-view-example">
  <YearView {...props} bind:value {marked} {dayTooltip} />
</div>

<style lang="scss">
  .year-view-example {
    width: 64rem;
    max-width: 100%;
    background-color: var(--theme-panel-color);
    border: 1px solid var(--global-subtle-ui-BorderColor);
    border-radius: var(--small-BorderRadius);
  }
</style>
