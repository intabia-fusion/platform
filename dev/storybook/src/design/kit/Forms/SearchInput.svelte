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
  import { SearchInput } from '@hcengineering/ui/kit'
  import type { SearchInputKind, SearchInputSize } from '@hcengineering/ui/kit'

  export let kind: SearchInputKind | undefined = undefined
  export let size: SearchInputSize | undefined = undefined
  export let value: string | undefined = undefined
  export let placeholder: string | undefined = undefined
  export let collapsed: boolean = false
  export let width: number | undefined = undefined
</script>

<div style:width={width !== undefined ? `${width}px` : 'fit-content'}>
  <SearchInput
    {kind}
    {size}
    {value}
    {collapsed}
    fullWidth={width !== undefined}
    placeholder={placeholder !== undefined ? getEmbeddedLabel(placeholder) : undefined}
  />
</div>
