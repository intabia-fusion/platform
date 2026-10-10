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
  import type { Class, Doc, DocumentQuery, Ref, Space } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import type { AnyComponent, AnySvelteComponent } from '@hcengineering/ui'
  import { BlankView, showPopup } from '@hcengineering/ui'
  import { filterStore, setFilters } from '../filter'
  import { onboardingHints } from '../onboarding'
  import view from '../plugin'

  export let _class: Ref<Class<Doc>>
  export let query: DocumentQuery<Doc>
  // Documents matching the query without search and filters.
  export let gtotal: number
  export let space: Ref<Space> | undefined = undefined
  export let createItemDialog: AnyComponent | AnySvelteComponent | undefined = undefined
  export let createItemDialogProps: Record<string, any> | undefined = undefined

  const hierarchy = getClient().getHierarchy()

  $: info = hierarchy.classHierarchyMixin(_class, view.mixin.EmptyStateInfo)
  $: icon = hierarchy.findClass(_class)?.icon
  // With search or filters on, an empty result can't prove there is no data at all.
  $: narrowed = query.$search != null || $filterStore.length > 0

  $: actions = narrowed
    ? $filterStore.length > 0
      ? [
          {
            label: view.string.ClearFilters,
            onClick: () => {
              setFilters([])
            }
          }
        ]
      : []
    : $onboardingHints && createItemDialog !== undefined
      ? [{ label: info?.createLabel ?? view.string.EmptyStateCreateLabel, onClick: createFirstItem }]
      : []

  function createFirstItem (): void {
    if (createItemDialog === undefined) return
    showPopup(createItemDialog, { space, ...createItemDialogProps }, 'top')
  }
</script>

<BlankView
  {icon}
  header={narrowed ? view.string.NothingFound : (info?.title ?? view.string.EmptyStateDescription)}
  label={narrowed ? (gtotal > 0 ? view.string.NothingFoundHidden : view.string.ChangeSearchQuery) : info?.description}
  labelParams={{ count: gtotal }}
  {actions}
/>
