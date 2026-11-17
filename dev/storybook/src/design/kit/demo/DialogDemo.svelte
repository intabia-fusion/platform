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
  // Dialog with a text body, for the catalog; the other props go to the Dialog wrapper
  import Dialog from '../Actions/Dialog.svelte'

  export let title: string = 'Archive channel'
</script>

<Dialog {title} {...$$restProps}>
  <p class="text">Members keep the history, new messages cannot be posted. You can restore the channel later.</p>
</Dialog>

<style>
  .text {
    margin: 0;
    line-height: 1.25rem;
    color: var(--global-primary-TextColor);
  }
</style>
