<!--
// Copyright © 2026 Intabia Fusion.
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License, this file is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<script lang="ts">
  // Internal login-scoped Label component.
  // This component mirrors the public Label API but applies login-scoped
  // color tokens (prefixed with `--login-*`) to avoid mutating global theme
  // variables in the login plugin.
  import type { IntlString } from '@hcengineering/platform'
  import { translateCB } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'

  export let label: IntlString
  export let params: Record<string, any> = {}
  export let className: string = 'login-label'
  export let variant: string | undefined = undefined

  // Store computed classes in a declared variable so TypeScript is happy.
  // We compute a base class (first token of `className`) to create a
  // predictable variant class (e.g. `login-label--heading`) even when
  // `className` contains multiple classes.
  let classes: string = className

  $: {
    const base =
      typeof className === 'string' && className.trim().length > 0 ? className.trim().split(/\s+/)[0] : 'login-label'
    classes =
      variant && typeof variant === 'string' && variant.trim().length > 0
        ? `${className} ${base}--${variant}`
        : className
  }

  let _value: string | undefined

  // Reactively translate when label/params/language changes.
  $: if (label !== undefined) {
    translateCB(label, params ?? {}, $themeStore.language, (r) => {
      _value = r
    })
  } else {
    _value = label as string | undefined
  }
</script>

<span class={classes} {...$$restProps}>
  {#if _value !== undefined}
    {_value}
  {:else}
    {label}
  {/if}
</span>

<style lang="scss">
  /* Color is intentionally login-scoped: prefer `--login-*` tokens and
     fall back to global theme tokens only if login-specific ones are absent. */
  .login-label {
    color: var(--login-label-color, var(--login-content-color, var(--theme-content-color)));
    display: inline;
    line-height: inherit;
  }
  /* Heading variant: use theme token when available; otherwise inherit color */
  .login-label--heading {
    color: var(--login-heading-color, inherit);
  }
  .login-label--link {
    color: var(--login-label-link-color, var(--login-content-color, var(--theme-content-color)));
    display: inline;
    line-height: inherit;
  }
  /* Caption / smaller labels may want a different tone. Consumers can add
     the `caption` class to request caption color; fallback still respects
     login-prefixed tokens. */
  .login-label.caption {
    color: var(--login-caption-color, var(--theme-caption-color));
  }
</style>
