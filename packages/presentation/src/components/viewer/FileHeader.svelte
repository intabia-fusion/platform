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
  import { themeStore } from '@hcengineering/ui'
  import { FileBadge, formatFileSize } from '@hcengineering/ui/kit'

  import { fileBadge } from '../../file'

  export let name: string
  export let contentType: string
  export let subtitle: string | undefined = undefined
  export let size: number | undefined = undefined
  // Solid plate: a tinted badge turns muddy over a grey picture.
  export let plate: boolean = false

  // Files opened from a link or the drive have no format, so the badge comes from the name.
  $: badge = fileBadge(name, contentType)
  $: shownSubtitle =
    subtitle ??
    [badge.label, size != null && size > 0 ? formatFileSize(size, $themeStore.language) : undefined]
      .filter((it) => it != null && it !== '')
      .join(' · ')
</script>

<header class="file-header">
  <div class="file">
    <span class="icon" class:plate><FileBadge {...badge} variant="title" /></span>
    <span class="titles">
      <span class="name" title={name}>{name}</span>
      {#if shownSubtitle !== ''}<span class="subtitle">{shownSubtitle}</span>{/if}
    </span>
  </div>
  <div class="actions"><slot /></div>
</header>

<style lang="scss">
  .file-header {
    position: relative;
    z-index: 2;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 1rem;
    flex-shrink: 0;
    height: 3.5rem;
    padding: 0 1rem;
    border-bottom: 1px solid var(--viewer-divider, var(--theme-divider-color));

    // Kit buttons take the accent by default; next to a file they stay neutral.
    --button-tertiary-IconColor: var(--viewer-icon, var(--theme-content-color));
    --button-tertiary-icon-IconColor: var(--viewer-icon, var(--theme-content-color));
    --button-tertiary-hover-BackgroundColor: var(
      --viewer-hover,
      color-mix(in srgb, var(--theme-caption-color) 8%, transparent)
    );
    --button-tertiary-active-BackgroundColor: var(
      --viewer-active,
      color-mix(in srgb, var(--theme-caption-color) 14%, transparent)
    );
  }

  .file {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }

  .icon {
    display: flex;
    flex-shrink: 0;
    border-radius: var(--small-BorderRadius);

    &.plate {
      background-color: var(--viewer-plate);
    }
  }

  .titles {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 500;
    font-size: 0.875rem;
    color: var(--viewer-text, var(--theme-caption-color));
  }

  .subtitle {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: var(--viewer-muted, var(--theme-content-color));
  }

  .actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.25rem;
  }
</style>
