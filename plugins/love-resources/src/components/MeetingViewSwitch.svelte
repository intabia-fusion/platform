<!--
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
-->
<!--
  The view switch of the meetings section, drawn in the panel header where the viewlet icons used to
  be: three icon segments, one of them on, exactly as the mockup shows it.
-->
<script lang="ts">
  import type { Asset, IntlString } from '@hcengineering/platform'
  import { SegmentedControl } from '@hcengineering/ui/kit'

  export let items: Array<{ id: string, label: IntlString, icon: Asset }> = []
  export let selected: string
  export let onSelect: (id: string) => void

  // The panel header hands every control the same props; this switch has no use for them.
  export let inline: boolean | undefined = undefined
  export let disabled: boolean | undefined = undefined

  function select (event: CustomEvent<string>): void {
    onSelect(event.detail)
  }
</script>

<!-- The same height as the buttons standing beside it in the header: a larger plate read as a heavier control. -->
<SegmentedControl {items} {selected} size="small" iconOnly on:select={select} />
