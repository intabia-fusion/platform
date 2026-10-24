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
  import { LinkCard, LinkCoverCard, SiteIcon } from '@hcengineering/ui/kit'

  import { favicon, logo } from '../attachments/fixtures'
  import Group from '../attachments/Group.svelte'
  import Specimen from '../attachments/Specimen.svelte'
  import Board from './Board.svelte'
  import { article, repo, textOnly } from './links'
</script>

<Board>
  <Group title="LinkCard" note="The preview sizes the card up front; the details only fill the site row.">
    <LinkCard preview={article.preview} details={article.details} detailsLoaded />
    <LinkCard preview={repo.preview} details={repo.details} detailsLoaded />
    <LinkCard preview={textOnly.preview} details={textOnly.details} detailsLoaded />
    <LinkCard preview={article.preview} details={article.details} detailsLoaded removable />
    <LinkCard preview={repo.preview} details={repo.details} detailsLoaded removable />
    <!-- A logo on a transparent background: the thumbnail's box has no visible edge. -->
    <LinkCard
      preview={{
        title: 'Meet',
        description:
          'Real-time meetings in the browser: share your video, your desktop and your slides with the team and with customers.',
        image: logo('#f2c94c'),
        imageWidth: 256,
        imageHeight: 256
      }}
      details={{ url: 'https://meet.example.com/abc-defg-hij', hostname: 'meet.example.com' }}
      detailsLoaded
    />
    <LinkCard
      preview={{ ...repo.preview, image: 'https://broken.invalid/preview.png' }}
      details={{ ...repo.details, icon: favicon('#6b3fd4', 'P') }}
      detailsLoaded
    />
    <LinkCard preview={article.preview} />
    <LinkCard />
    <LinkCard preview={{ url: 'https://docs.example.com/releases/2026-10' }} detailsLoaded />
    <LinkCard detailsLoaded />
  </Group>

  <Group
    title="LinkCoverCard"
    note="A link in a grid of them, as the chat search shows it: the page's picture or the site's own tile; the list adds its texts through slots."
  >
    <div class="cover-card">
      <LinkCoverCard
        url={article.details.url}
        host={article.details.hostname}
        title={article.preview.title}
        image={article.preview.image}
      >
        {article.preview.description}
        <span slot="footer">Alex Doe · 12 Oct</span>
      </LinkCoverCard>
    </div>
    <div class="cover-card">
      <LinkCoverCard url="https://github.com/sveltejs/svelte" host="github.com" title="sveltejs/svelte">
        Web development for the rest of us.
        <span slot="footer">Alex Doe · 12 Oct</span>
      </LinkCoverCard>
    </div>
  </Group>

  <Group
    title="SiteIcon"
    note="The icon from the page's details, else the site's favicon by its address, else the globe."
  >
    <Specimen label="src"><SiteIcon src={article.details.icon} /></Specimen>
    <Specimen label="host"><SiteIcon host="github.com" /></Specimen>
    <Specimen label="none"><SiteIcon host="missing.invalid" /></Specimen>
    <Specimen label="large"><SiteIcon src={repo.details.icon} size="large" /></Specimen>
  </Group>
</Board>

<style lang="scss">
  .cover-card {
    display: flex;
    width: 18rem;
  }
</style>
