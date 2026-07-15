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
  <!-- Wifi glyph mirrors love-resources BadConnection.svelte for a consistent look. -->
  <svg fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
    <path
      d="M24,25a15.1,15.1,0,0,0-11.7,5.5A2,2,0,0,0,15.4,33,11.5,11.5,0,0,1,24,29a11.5,11.5,0,0,1,8.6,4,2,2,0,1,0,3.1-2.5A15.1,15.1,0,0,0,24,25Z"
    />
    <path
      d="M24,17A22.9,22.9,0,0,0,7.5,23.9a2,2,0,0,0-.2,2.6,1.9,1.9,0,0,0,3,.2,19.3,19.3,0,0,1,27.4,0,1.9,1.9,0,0,0,3-.2,2,2,0,0,0-.2-2.6A22.9,22.9,0,0,0,24,17Z"
    />
    <path
      d="M45.4,17.4a31.5,31.5,0,0,0-42.8,0,2.1,2.1,0,0,0-.2,2.7h0a1.9,1.9,0,0,0,3,.2,27.3,27.3,0,0,1,37.2,0,1.9,1.9,0,0,0,3-.2h0A2.1,2.1,0,0,0,45.4,17.4Z"
    />
    <circle cx="24" cy="38" r="5" />
  </svg>
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

    svg {
      width: 1rem;
      height: 1rem;
    }
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
