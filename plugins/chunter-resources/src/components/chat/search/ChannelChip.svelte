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
  import type { Person } from '@hcengineering/contact'
  import { Avatar } from '@hcengineering/contact-resources'
  import type { Class, Doc, Ref } from '@hcengineering/core'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import { Icon, resizeObserver, tooltip } from '@hcengineering/ui'

  import { classIcon } from '../../../search/browser'
  import ThreadMark from '../../chat-message/ThreadMark.svelte'

  export let label: string
  // Its class gives the icon; a direct chat shows the other person instead.
  export let _class: Ref<Class<Doc>> | undefined = undefined
  export let person: Person | undefined = undefined
  /** A thread reply needs marking: the channel name alone points to the wrong spot. */
  export let thread: boolean = false

  let cut = false

  function measure (el: Element): void {
    cut = el.scrollWidth > el.clientWidth + 1
  }

  const hierarchy = getClient().getHierarchy()

  $: icon = classIcon(hierarchy, _class)
</script>

<!-- Full name only when cut, delayed so passing over it shows nothing. -->
<span class="chip flex-gap-1" use:tooltip={cut ? { label: getEmbeddedLabel(label), timeout: 600 } : {}}>
  {#if person !== undefined}
    <span class="icon"><Avatar {person} name={person.name} size="inline" /></span>
  {:else if icon !== undefined}
    <span class="icon"><Icon {icon} size="x-small" /></span>
  {/if}
  <span class="label font-medium-12 text-left secondary-textColor" class:cut use:resizeObserver={measure}>{label}</span>
  {#if thread}<ThreadMark />{/if}
</span>

<style lang="scss">
  .chip {
    display: inline-flex;
    align-items: center;
    flex-shrink: 1;
    min-width: 0;
    max-width: 20rem;
    height: 1.25rem;
    padding: 0 var(--spacing-0_75) 0 var(--spacing-0_5);
    box-shadow: inset 0 0 0 1px var(--global-subtle-ui-BorderColor);
    border-radius: var(--extra-small-BorderRadius);
    background-color: var(--tag-nuance-SkyBackground);
  }

  .icon {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-shrink: 0;
  }

  .label {
    flex-grow: 1;
    flex-shrink: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;

    &.cut {
      mask-image: linear-gradient(to right, #000 calc(100% - 1.5rem), transparent);
      -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 1.5rem), transparent);
    }
  }
</style>
