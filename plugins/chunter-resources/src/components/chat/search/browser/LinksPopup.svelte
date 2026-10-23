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
  import type { MarkupLink } from '@hcengineering/text-core'
  import { SiteIcon } from '@hcengineering/ui/kit'

  import type { LinkPreview } from '../../../../search/attachments'
  import { shortUrl } from '../../../../search/browser'

  export let links: MarkupLink[]
  export let previews: LinkPreview[] = []

  function titleOf (link: MarkupLink): string | undefined {
    return previews.find((p) => p.url === link.url)?.title
  }
</script>

<div class="links">
  {#each links as link (link.url)}
    {@const title = titleOf(link)}
    <a class="link" href={link.url} target="_blank" rel="noopener noreferrer" title={link.url}>
      <SiteIcon host={link.host} />
      <span class="text">
        <!-- The address is the name of a page without a title, so it reads as one, not as a faded hint. -->
        {#if title != null}
          <span class="title">{title}</span>
          <span class="url">{shortUrl(link.url)}</span>
        {:else}
          <span class="title">{shortUrl(link.url)}</span>
        {/if}
      </span>
    </a>
  {/each}
</div>

<style lang="scss">
  .links {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    max-width: 22rem;
    max-height: 18rem;
    overflow-y: auto;
  }

  .link {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    padding: 0.375rem 0.5rem;
    border-radius: var(--small-BorderRadius);
    color: inherit;
    text-decoration: none;

    &:hover {
      background-color: color-mix(in srgb, var(--theme-caption-color) 6%, transparent);
    }
  }

  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .title,
  .url {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .title {
    font-weight: 500;
    color: var(--theme-caption-color);
  }

  .url {
    font-size: 0.75rem;
    color: var(--theme-darker-color);
  }
</style>
