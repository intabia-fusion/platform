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
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { IconAdd } from '@hcengineering/ui'
  import { IconButton, Menu } from '@hcengineering/ui/kit'

  import { languages, priorities } from './items'
</script>

<div class="slots">
  <section>
    <h3 class="slots__title">actions - next to the search field</h3>
    <Menu items={priorities} selected="high" withSearch autofocus={false}>
      <IconButton
        slot="actions"
        icon={IconAdd}
        kind="ghost"
        size="small"
        tooltip={{ label: getEmbeddedLabel('New priority') }}
      />
    </Menu>
  </section>
  <section>
    <h3 class="slots__title">header - the current value above the rows</h3>
    <Menu items={languages} selected="Deutsch" withSearch autofocus={false}>
      <div slot="header" class="slots__current">
        <span class="slots__caption">Selected</span>
        <span>Deutsch (Europe)</span>
      </div>
    </Menu>
  </section>
</div>

<style lang="scss">
  .slots {
    display: flex;
    gap: var(--spacing-4);
    align-items: flex-start;

    &__title {
      margin: 0 0 var(--spacing-1);
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--theme-caption-color);
    }
    &__current {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-0_5);
      font-size: 0.875rem;
      color: var(--global-primary-TextColor);
    }
    &__caption {
      font-size: 0.625rem;
      font-weight: 500;
      text-transform: uppercase;
      color: var(--global-tertiary-TextColor);
    }
  }
</style>
