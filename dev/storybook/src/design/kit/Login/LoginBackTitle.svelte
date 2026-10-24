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
  // Heading of the workspace list: back button and the title
  import Icon from '../Icon.svelte'

  export let title: string
  export let width: number = 428
</script>

<div class="login-back-title" style:width="{width}px">
  <span class="back"><Icon name="ui/Back" size={16} color="#201240" /></span>
  <span class="title">{title}</span>
</div>

<style lang="scss">
  .login-back-title {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
    height: 44px;
  }
  .back {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 44px;
  }
  .title {
    min-width: 0;
    overflow: hidden;
    font-size: 24px;
    font-weight: 600;
    line-height: 1.3;
    color: #000061;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
