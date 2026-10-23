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
  import type { AttachmentFormat } from '@hcengineering/attachment'
  import { formatLabels } from '@hcengineering/attachment-resources'
  import { translate } from '@hcengineering/platform'
  import { IconFile, ModernDropdownLabels, themeStore, type DropdownTextItem } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'

  import chunter from '../../../../plugin'
  import FilterButtonContent from '../FilterButtonContent.svelte'
  import FormatIcon from './FormatIcon.svelte'

  /** The formats of the tab, each an option. */
  export let available: AttachmentFormat[]
  export let selected: AttachmentFormat[] = []

  const ALL = '$all'
  const dispatch = createEventDispatcher<{ change: AttachmentFormat[] }>()

  let items: DropdownTextItem[] = []
  let request = 0
  $: void load(available, $themeStore.language)

  // The labels of a language switched to again later must not land over the newer ones.
  async function load (formats: AttachmentFormat[], lang: string): Promise<void> {
    const current = ++request
    try {
      const built = await build(formats, lang)
      if (current === request) items = built
    } catch (err: any) {
      console.warn('failed to translate the file types', err)
    }
  }

  async function build (formats: AttachmentFormat[], lang: string): Promise<DropdownTextItem[]> {
    const all: DropdownTextItem = {
      id: ALL,
      label: await translate(chunter.string.SearchFilterAllFileTypes, {}, lang),
      // Its own icon: the sliders already mark the place filter next to it.
      icon: IconFile,
      exclusive: true
    }
    const options = await Promise.all(
      formats.map(async (format) => ({
        id: format,
        label: await translate(formatLabels[format], {}, lang),
        icon: FormatIcon,
        iconProps: { format }
      }))
    )
    return [all, ...options]
  }

  $: picked = selected.length > 0 ? (selected as string[]) : [ALL]
  $: pickedItems = items.filter((item) => picked.includes(`${item.id}`))

  function onSelected (value: unknown): void {
    const ids = (Array.isArray(value) ? value : [value]).map((id) => `${id}`).filter((id) => id !== ALL)
    dispatch('change', ids as AttachmentFormat[])
  }
</script>

<ModernDropdownLabels
  {items}
  selected={picked}
  iconSize="small"
  multiselect
  autoSelect={false}
  label={chunter.string.SearchFilterFileType}
  kind="secondary"
  size="small"
  on:selected={(e) => {
    onSelected(e.detail)
  }}
>
  <svelte:fragment slot="content">
    {#if pickedItems[0] != null}
      <FilterButtonContent
        title={pickedItems[0].label}
        icon={pickedItems[0].icon}
        iconProps={pickedItems[0].iconProps}
        count={pickedItems.length}
      />
    {/if}
  </svelte:fragment>
</ModernDropdownLabels>
