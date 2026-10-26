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
  // Message above the button; without a text only the 16 px gap stays
  import Icon from '../Icon.svelte'

  export let text: string | undefined = undefined
  export let kind: 'info' | 'error' = 'info'
</script>

<div class="login-status">
  {#if text !== undefined}
    <div class="message" class:error={kind === 'error'}>
      <span class="icon"><Icon name="kit/InfoCircle" size={16} color="currentColor" /></span>
      <span class="text">{text}</span>
    </div>
  {/if}
</div>

<style lang="scss">
  .login-status {
    flex: none;
    box-sizing: border-box;
    width: 396px;
    padding-top: 16px;
  }
  .message {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    box-sizing: border-box;
    padding: 12px 16px;
    font-size: 12px;
    line-height: 1.5;
    color: #201240;
    background-color: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;

    &.error {
      color: #ee7a7a;
      border-color: rgba(238, 122, 122, 0.6);
    }
  }
  .icon {
    display: flex;
    flex-shrink: 0;
    margin-top: 2px;
  }
  .text {
    min-width: 0;
    overflow-wrap: anywhere;
  }
</style>
