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
  import type { AccordionItemProps } from '../../ui-kit/accordion/types'
  import AccordionItem from '../../ui-kit/accordion/AccordionItem.svelte'

  export let props: AccordionItemProps
</script>

<AccordionItem {...props} on:toggle on:select>
  <span slot="meta" class="planned">+1h</span>
  <button slot="actions" class="action" type="button">More</button>
  <p class="content">Rooms</p>
</AccordionItem>
