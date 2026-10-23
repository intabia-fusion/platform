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
  import type { IntlString } from '@hcengineering/platform'

  import Label from '../../components/Label.svelte'
  import ui from '../../plugin'
  import IconFileDownload from '../_icons/IconFileDownload.svelte'
  import Button from '../button/Button.svelte'
  import FileCover from './FileCover.svelte'
  import type { FileBadgeData } from './types'

  export let name: string
  export let badge: FileBadgeData
  /** Empty when the file has no address: then there is nothing to download. */
  export let url: string
  export let label: IntlString = ui.string.PreviewUnavailable

  let link: HTMLAnchorElement
</script>

<div class="no-preview">
  <div class="cover"><FileCover {badge} /></div>
  <div class="name">{name}</div>
  <div class="meta">
    <Label {label} />
  </div>
  <!-- The link saves under the file's name; the button is what the keyboard and the eye find. -->
  {#if url !== ''}
    <a href={url} download={name} bind:this={link} hidden>{name}</a>
    <div class="action">
      <Button
        label={ui.string.Download}
        icon={IconFileDownload}
        kind="secondary"
        size="medium"
        on:click={() => {
          link.click()
        }}
      />
    </div>
  {/if}
</div>

<style lang="scss">
  .no-preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    max-width: 22rem;
    padding: 2rem 1rem;
    text-align: center;
  }

  .cover {
    width: 16rem;
    max-width: 100%;
    margin-bottom: 0.75rem;
    overflow: hidden;
    border-radius: var(--medium-BorderRadius);
  }

  .name {
    max-width: 100%;
    overflow-wrap: anywhere;
    font-size: 1rem;
    font-weight: 500;
    color: var(--theme-caption-color);
  }

  .meta {
    font-size: 0.8125rem;
    color: var(--theme-dark-color);
  }

  .action {
    margin-top: 0.75rem;
  }
</style>
