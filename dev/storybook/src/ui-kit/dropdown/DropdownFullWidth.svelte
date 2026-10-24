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
  import { Dropdown } from '@hcengineering/ui/kit'

  const items = [
    { id: 'high', label: getEmbeddedLabel('High') },
    { id: 'long', label: getEmbeddedLabel('Very long value that does not fit into the place') }
  ]
  const placeholder = getEmbeddedLabel('No priority')
</script>

<div class="examples">
  <div class="caption">Без fullWidth - по содержимому</div>
  <div class="place"><Dropdown {items} selected="high" /></div>
  <div class="caption">fullWidth, secondary - в поле формы шириной 16rem</div>
  <div class="place"><Dropdown {items} selected="high" fullWidth /></div>
  <div class="place"><Dropdown {items} {placeholder} fullWidth /></div>
  <div class="caption">fullWidth, justify center - текст посередине, шеврон у правого края</div>
  <div class="place"><Dropdown {items} selected="high" fullWidth justify="center" /></div>
  <div class="place"><Dropdown {items} selected="high" fullWidth justify="center" chevron={false} /></div>
  <div class="caption">fullWidth, ghost - длинное значение обрезается, шеврон у правого края</div>
  <div class="place"><Dropdown {items} selected="long" kind="ghost" fullWidth /></div>
</div>

<style lang="scss">
  .examples {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
  }
  .caption {
    margin-top: var(--spacing-1);
    font-size: 0.75rem;
    color: var(--theme-dark-color);
  }
  .place {
    width: 16rem;
    outline: 1px dashed var(--theme-divider-color);
  }
</style>
