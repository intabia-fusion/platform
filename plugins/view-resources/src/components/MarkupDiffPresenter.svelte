<!--
// Copyright © 2023 Anticrm Platform Contributors.
// Copyright © 2023, 2024 Hardcore Engineering Inc.
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
  import { AnyAttribute, Markup } from '@hcengineering/core'
  import { EmptyMarkup, markupToJSON } from '@hcengineering/text'
  import { MarkupDiffViewer } from '@hcengineering/text-editor-resources'
  import { ShowMore } from '@hcengineering/ui'

  import { cleanupDiff } from '../markupDiff'

  export let value: Markup | undefined
  export let prevValue: Markup | undefined = undefined
  export let attribute: AnyAttribute | undefined = undefined
  export let withShowMore = true

  export let showOnlyDiff: boolean = false

  $: content = markupToJSON(value ?? EmptyMarkup)
  $: comparedVersion = markupToJSON(prevValue ?? EmptyMarkup)

  $: if (showOnlyDiff) {
    ;[content, comparedVersion] = cleanupDiff(content, comparedVersion)
  }
</script>

{#if withShowMore}
  <ShowMore>
    {#key [value, prevValue]}
      <MarkupDiffViewer objectClass={attribute?.attributeOf} {content} {comparedVersion} />
    {/key}
  </ShowMore>
{:else}
  {#key [value, prevValue]}
    <MarkupDiffViewer objectClass={attribute?.attributeOf} {content} {comparedVersion} />
  {/key}
{/if}
