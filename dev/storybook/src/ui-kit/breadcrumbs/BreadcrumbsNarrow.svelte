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
  import { Breadcrumbs, type BreadcrumbsItem } from '@hcengineering/ui/kit'

  export let items: BreadcrumbsItem[]
  export let width: string = '16rem'
</script>

<!-- A header that is too narrow: the path gives way first, the current crumb truncates last. -->
<div class="narrow" style:width><Breadcrumbs {items} /></div>

<style lang="scss">
  .narrow {
    display: flex;
    min-width: 0;
    border: 1px dashed var(--theme-divider-color);
  }
</style>
