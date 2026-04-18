<!--
// Copyright © 2022 Hardcore Engineering Inc.
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
  import { Document } from '@intabiafusion/document'
  import { Ref } from '@intabiafusion/core'
  import { ButtonKind, ButtonSize } from '@intabiafusion/ui'
  import { ObjectBox } from '@intabiafusion/view-resources'

  import document from '../plugin'

  export let value: Ref<Document> | undefined
  export let readonly: boolean = false
  export let kind: ButtonKind = 'no-border'
  export let size: ButtonSize = 'small'
  export let justify: 'left' | 'center' = 'center'
  export let width: string | undefined = undefined
  export let onChange: (value: any) => void
</script>

<ObjectBox
  bind:value
  on:change={(e) => {
    onChange(e.detail)
  }}
  _class={document.class.Document}
  label={document.string.Document}
  searchField={'title'}
  docQuery={{}}
  {readonly}
  {kind}
  {size}
  {justify}
  {width}
/>
