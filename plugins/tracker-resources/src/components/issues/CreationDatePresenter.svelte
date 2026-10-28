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
  import { tooltip } from '@hcengineering/ui'
  import tracker from '../../plugin'

  export let value: number

  // A list column shows the calendar day, not "8 days ago": the exact moment is in the tooltip.
  $: shortCreationDate = new Date(value).toLocaleString('default', { month: 'short', day: 'numeric' })
  $: fullCreationDate = new Date(value).toLocaleString('default', {
    minute: '2-digit',
    hour: 'numeric',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
</script>

<div
  class="creationDateLabel"
  use:tooltip={{
    label: tracker.string.CreationDate,
    props: { value: fullCreationDate }
  }}
>
  {shortCreationDate}
</div>

<style lang="scss">
  .creationDateLabel {
    overflow: hidden;
    min-width: min-content;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 0.75rem;
    color: var(--theme-dark-color);
  }
</style>
