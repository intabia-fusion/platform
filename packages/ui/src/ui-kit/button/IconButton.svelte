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
  import type { IconComponent } from '../../types'
  import Button from './Button.svelte'
  import type { ButtonEvents, IconButtonProps } from './types'

  type $$Props = IconButtonProps
  type $$Events = ButtonEvents

  export let icon: IconComponent
  export let element: HTMLButtonElement | undefined = undefined

  export function focus (): void {
    element?.focus()
  }
</script>

<Button bind:element {icon} {...$$restProps} on:click on:keydown on:focus on:blur />
