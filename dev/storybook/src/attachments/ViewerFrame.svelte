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
  import AttachmentPreviewPopup from '@hcengineering/attachment-resources/src/components/AttachmentPreviewPopup.svelte'

  import Group from './Group.svelte'

  export let value: any
  export let title: string
  export let navigation: any = undefined
</script>

<Group {title} direction="column">
  <div class="frame">
    <div class="layer">
      <AttachmentPreviewPopup {value} {navigation} />
    </div>
  </div>
</Group>

<style lang="scss">
  // The viewer draws its own edge and shadow; the frame only rounds its backdrop off.
  .frame {
    position: relative;
    width: min(100%, 64rem);
    height: 36rem;
    overflow: hidden;
    border-radius: var(--large-BorderRadius);
  }

  .layer {
    position: absolute;
    inset: 0;
    display: flex;

    > :global(*) {
      flex-grow: 1;
      min-width: 0;
    }
  }
</style>
