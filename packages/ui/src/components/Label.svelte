<!--
// Copyright © 2020, 2021 Anticrm Platform Contributors.
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
  import { translateCB } from '@hcengineering/platform'
  import { languageStore } from '@hcengineering/theme'

  export let label: IntlString
  export let params: Record<string, any> = {}

  let _value: string | undefined
  let request = 0

  $: if (label !== undefined) {
    // A slower answer for previous params (strings still loading) must not overwrite the current one.
    const current = ++request
    // languageStore fires on a language change only, not on every theme update; '' until the theme is set.
    translateCB(label, params ?? {}, $languageStore === '' ? undefined : $languageStore, (r) => {
      if (current === request) _value = r
    })
  } else {
    ++request
    _value = label
  }
</script>

{#if _value !== undefined}
  {_value}
{:else}
  {label}
{/if}
