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
  import { Breadcrumb, Header, Label, Scroller } from '@hcengineering/ui'
  import workflow from '@hcengineering/workflow'
</script>

<div class="hulyComponent">
  <Header adaptive={'disabled'}>
    <Breadcrumb label={workflow.string.Workflow} size={'large'} isCurrent />
  </Header>
  <div class="hulyComponent-content__container columns">
    <div class="hulyComponent-content__column">
      <Scroller>
        <div class="p-6">
          <Label label={workflow.string.Workflow} />
          <p class="paragraph-regular-14 secondary-textColor mt-2">To be defined....</p>
        </div>
      </Scroller>
    </div>
  </div>
</div>

<style lang="scss">
  .p-6 {
    padding: 1.5rem;
  }
  .mt-2 {
    margin-top: 0.5rem;
  }
</style>
