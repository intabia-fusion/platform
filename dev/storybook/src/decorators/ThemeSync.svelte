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
  import { getContext } from 'svelte'

  export let theme: string
  export let accent: string
  export let language: string

  // Drives the app's own Theme through the setters it exposes, so stories render exactly as in the app.
  const { setTheme } = getContext<{ setTheme: (theme: string) => void }>('theme')
  const { setAccent } = getContext<{ setAccent: (accent: string) => void }>('accent')
  const { setLanguage } = getContext<{ setLanguage: (language: string) => Promise<void> }>('lang')

  $: setTheme(theme)
  $: setAccent(accent)
  $: void setLanguage(language)
</script>
