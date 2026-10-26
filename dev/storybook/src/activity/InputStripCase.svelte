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
  import { FileTile } from '@hcengineering/ui/kit'

  import DraftCase from './DraftCase.svelte'
</script>

<!-- Lays tiles and drafts out as AttachmentRefInput does. -->
<div class="strip">
  <FileTile kind="file" name="Q3 report.pdf" size={1_240_000} badge={{ label: 'PDF', color: 'Firework' }} removable />
  <DraftCase draft="poll" />
  <DraftCase draft="quiz" />
</div>

<style lang="scss">
  .strip {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    overflow-x: auto;
    border: 1px solid var(--global-ui-BorderColor);
    border-radius: var(--medium-BorderRadius);
    background-color: var(--theme-bg-color);
  }
</style>
