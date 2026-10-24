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
  // Chat message: avatar, author with time and the text; a system message has the neutral avatar
  import Avatar from '../People/Avatar.svelte'
  import type { Person } from '../types'

  export let author: string
  export let time: string
  export let text: string
  export let person: Person | undefined = undefined
</script>

<div class="kit-message">
  <div class="avatar">
    {#if person !== undefined}
      <Avatar {person} size={40} />
    {:else}
      <div class="system">{author[0]}</div>
    {/if}
  </div>
  <div class="content">
    <div class="header"><span class="author">{author}</span><span class="time">{time}</span></div>
    <div class="text">{text}</div>
  </div>
</div>

<style lang="scss">
  .kit-message {
    display: flex;
    gap: 1rem;
    box-sizing: border-box;
    width: 100%;
    padding: 0.5rem 1.25rem;
    border: 1px solid transparent;
  }
  .avatar {
    flex-shrink: 0;
    margin-top: 0.25rem;
    width: 2.5rem;
    height: 2.5rem;
  }
  .system {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    font-weight: 500;
    color: var(--theme-content-color);
    background-color: var(--avatar-bg-color);
    border-radius: 0.5rem;
  }
  .content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .header {
    display: flex;
    margin-bottom: 0.25rem;
    color: var(--global-secondary-TextColor);
  }
  .time {
    margin-left: 0.25rem;
    font-size: 0.75rem;
    line-height: 1.25rem;
  }
  .text {
    color: var(--content-color);
  }
</style>
