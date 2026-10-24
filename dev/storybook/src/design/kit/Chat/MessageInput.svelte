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
  // Message input: the text field with a placeholder and the toolbar under it
  import ClassicButton from '../Actions/ClassicButton.svelte'

  export let placeholder: string = 'Start typing...'
</script>

<div class="kit-message-input">
  <div class="field">{placeholder}</div>
  <div class="panel">
    <div class="group">
      <ClassicButton kind="ghost" iconSize={20} icon="text-editor/Attach" />
      <ClassicButton kind="ghost" iconSize={20} icon="media/CamOn" />
      <div class="divider" />
      <ClassicButton kind="ghost" iconSize={20} icon="chunter/IconMic" />
      <div class="divider" />
      <ClassicButton kind="ghost" iconSize={20} icon="text-editor/RIMention" />
      <ClassicButton kind="ghost" iconSize={20} icon="emoji/emoji" />
      <div class="divider" />
      <ClassicButton kind="ghost" iconSize={20} icon="templates/template" />
    </div>
    <ClassicButton kind="ghost" iconSize={20} icon="text-editor/Send" disabled />
  </div>
</div>

<style lang="scss">
  .kit-message-input {
    box-sizing: border-box;
    width: 100%;
    border: 1px solid var(--theme-refinput-border);
    border-radius: 0.375rem;
  }
  .field {
    box-sizing: border-box;
    height: 2.75rem;
    padding: 0.125rem 0.75rem;
    line-height: 1.3125rem;
    color: var(--theme-trans-color);
  }
  .panel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-sizing: border-box;
    height: 2.625rem;
    padding: 0.325rem 0.75rem;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
  .divider {
    width: 1px;
    height: 1.5rem;
    background-color: var(--theme-refinput-divider);
  }
</style>
