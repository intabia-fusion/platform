<!--
// Copyright © 2024 Hardcore Engineering Inc.
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
  import { type ProjectType, type ProjectTypeDescriptor } from '@intabiafusion/task'
  import { SpaceTypeGeneralSectionEditor } from '@intabiafusion/setting-resources'
  import { Component } from '@intabiafusion/ui'

  export let type: ProjectType | undefined
  export let descriptor: ProjectTypeDescriptor | undefined
  export let disabled: boolean = true
</script>

<SpaceTypeGeneralSectionEditor {type} {descriptor} {disabled}>
  <svelte:fragment slot="extra">
    {#if descriptor?.editor}
      <Component is={descriptor.editor} props={{ type }} {disabled} />
    {/if}
  </svelte:fragment>
</SpaceTypeGeneralSectionEditor>
