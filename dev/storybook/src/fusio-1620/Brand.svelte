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
  import logo from './assets/logo.png'
  import intabia from './assets/wordmark-intabia.png'
  import platform from './assets/wordmark-platform.png'

  export let onDark = false
</script>

<div class="brand" class:on-dark={onDark} role="img" aria-label="Интабия Платформа">
  <img src={logo} alt="" width="44" height="44" />
  <div class="wordmark" aria-hidden="true">
    <span class="intabia" style:mask-image="url({intabia})" />
    <span class="platform" style:mask-image="url({platform})" />
  </div>
</div>

<style>
  .brand { display: flex; align-items: center; gap: 12px; color: #000061; }
  .on-dark { color: #ffffff; }
  img { flex: none; }
  .wordmark { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; }
  span { display: block; background: currentColor; mask-size: contain; mask-repeat: no-repeat; mask-position: left center; }
  .intabia { width: 85px; height: 11px; }
  .platform { width: 120px; height: 14px; }
</style>
