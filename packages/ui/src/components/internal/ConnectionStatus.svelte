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
  import { eventToHTMLElement, showPopup } from '../..'
  import ui from '../../plugin'
  import Icon from '../Icon.svelte'
  import { connOnline, connRate, connCooldown } from './connectionStatusStore'
  import ConnectionStatusPopup from './ConnectionStatusPopup.svelte'

  let pressed = false

  function openPopup (e: MouseEvent): void {
    pressed = true
    showPopup(ConnectionStatusPopup, {}, eventToHTMLElement(e), () => {
      pressed = false
    })
  }

  $: state = !$connOnline ? 'offline' : $connRate !== undefined ? 'limited' : 'online'
</script>

<button class="statusWifi {state}" class:pressed on:click={openPopup}>
  <Icon icon={ui.icon.Wifi} size="small" />
  {#if state === 'limited'}<span class="cooldown">{$connCooldown}s</span>{/if}
</button>

<style lang="scss">
  .statusWifi {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0 0.375rem;
    height: 1.5rem;
    background: transparent;
    border: none;
    cursor: pointer;

    &.online {
      color: var(--theme-state-positive-color);
    }
    &.offline {
      color: var(--theme-dark-color);
      animation: pulse 1.2s ease-in-out infinite;
    }
    &.limited {
      color: var(--theme-state-negative-color);
    }
    &:hover,
    &.pressed {
      opacity: 0.8;
    }
    .cooldown {
      font-size: 0.75rem;
      font-weight: 500;
    }
  }
  @keyframes pulse {
    50% {
      opacity: 0.3;
    }
  }
</style>
