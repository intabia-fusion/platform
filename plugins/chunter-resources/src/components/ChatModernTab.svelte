<!--
// Copyright © 2026 Intabia Fusion.
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
  import { IconComponent, languageStore, ModernTab } from '@hcengineering/ui'
  import { Doc } from '@hcengineering/core'
  import contact from '@hcengineering/contact'
  import { getClient } from '@hcengineering/presentation'
  import chunter from '@hcengineering/chunter'

  import { getChatDocIcon, getChatDocTitle } from '../utils'

  export let doc: Doc

  const client = getClient()
  const hierarchy = client.getHierarchy()

  let label: string | undefined = undefined
  let icon: IconComponent | undefined = undefined
  let iconProps: Record<string, any> | undefined = undefined

  $: isPerson =
    hierarchy.isDerived(doc._class, contact.class.Contact) ||
    hierarchy.isDerived(doc._class, chunter.class.DirectMessage)

  $: void getChatDocTitle(doc, $languageStore).then((it) => {
    label = it.identifier ?? it.title
  })

  $: void getChatDocIcon(doc).then((it) => {
    icon = it.icon
    iconProps = { ...it.iconProps, value: doc, showStatus: false }
  })
</script>

<ModernTab
  {label}
  {icon}
  {iconProps}
  iconSize={isPerson ? 'tiny' : 'x-small'}
  maxSize="12rem"
  canClose
  kind="secondary"
  on:close
/>
