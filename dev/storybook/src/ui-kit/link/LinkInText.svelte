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
  import ui from '@hcengineering/ui'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { Link } from '@hcengineering/ui/kit'
</script>

<p class="link-in-text">
  The spec is in
  <Link label={getEmbeddedLabel('design-notes.pdf')} href="#spec" />, the demo on
  <Link label={getEmbeddedLabel('example.com')} href="https://example.com" icon={ui.icon.Link} external />.
</p>

<style lang="scss">
  .link-in-text {
    margin: 0;
    max-width: 24rem;
    color: var(--global-primary-TextColor);
  }
</style>
