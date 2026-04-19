# Accent Colors

This document describes how to use accent colors in the application.

## Overview

The theme system now supports 10 accent colors:

1. **Intabia** (`#CF13A2`) - New Intabia accent color (special: sets additional theme tokens for core theme elements)
2. **Huly** (`#5e6ad2`) - Original brand color (legacy: selecting Huly does not apply any accent overrides; the theme uses pre-accent defaults)
3. **Blue** (`#3478F6`)
4. **Purple** (`#8A4292`)
5. **Pink** (`#E45C9C`)
6. **Red** (`#CE4745`)
7. **Orange** (`#E8883A`)
8. **Yellow** (`#F6C94E`)
9. **Green** (`#78B856`)
10. **Graphite** (`#989898`)

## Usage

### Setting Accent Color

```typescript
import { getCurrentAccentColor, AccentColor } from '@hcengineering/theme'

// Get current accent color
const currentAccent = getCurrentAccentColor() // returns 'accent-blue', 'accent-purple', etc.

// Set accent color (available via context in Svelte components)
const { setAccent } = getContext('accent')
setAccent(AccentColor.Purple)
```

### Using in Svelte Components

```svelte
<script lang="ts">
  import { getContext } from 'svelte'
  import { AccentColor } from '@hcengineering/theme'

  const { currentAccent, setAccent } = getContext('accent')
</script>

<div class="accent-selector">
  {#each accentColorOptions as option}
    <button
      class:active={$currentAccent === option.value}
      on:click={() => setAccent(option.value)}
    >
      <span class="color-dot" style="background-color: {option.color}"></span>
      {option.name}
    </button>
  {/each}
</div>
```

## CSS Variables

Each accent color defines the following CSS variables:

- `--accent-color-base` - The main accent color
- `--accent-color-hover` - Hover state color
- `--accent-color-active` - Active/pressed state color
- `--accent-color-light` - Light opacity variant (10%)
- `--accent-color-lighter` - Lighter opacity variant (5%)
- `--accent-color-dark` - Dark opacity variant (80%)
- `--accent-color-border` - Border color variant (20%)
- `--accent-color-primary` - Primary color for buttons and primary actions
- `--accent-color-primary-hover` - Hover state for primary color
- `--accent-color-primary-active` - Active/pressed state for primary color
- `--accent-color-secondary` - Secondary color for secondary elements
- `--accent-color-secondary-hover` - Hover state for secondary color
- `--accent-color-secondary-active` - Active/pressed state for secondary color
- `--accent-color-tertiary` - Tertiary color for subtle elements (usually transparent)
- `--accent-color-tertiary-hover` - Hover state for tertiary color
- `--accent-color-tertiary-active` - Active/pressed state for tertiary color

## Theme Integration

Accent colors automatically apply to:

- Primary buttons (`--button-primary-BackgroundColor`, `--primary-accent-color`)
- Links (`--global-primary-LinkColor`, `--theme-link-color`)
- Active states (`--selector-active-BackgroundColor`)
- Input focus borders (`--theme-editbox-focus-border`, `--global-focus-BorderColor`)
- Input/edit focus border (`--primary-edit-border-color`) is now provided per-accent in the accent stylesheet (for Huly there are also theme-specific composite overrides `accent-light-huly`/`accent-dark-huly`).
- Accent text (`--global-accent-TextColor`)
- Status indicators and tags
- Primary accent colors (`--global-primary-accent-Color`)
- Secondary accent colors (`--global-secondary-accent-Color`)
- Tertiary accent colors (`--global-tertiary-accent-Color`)

Special cases:

- **Huly** — legacy brand color. Selecting Huly does not apply most accent overrides; however, some tokens historically differ between light and dark themes (for example `--primary-edit-border-color`). To support these cases the theme system now supports theme-aware composite accent classes and a helper function (see below).
- **Intabia** — special accent. In addition to standard accent variables, Intabia sets additional theme tokens for core elements (buttons, state colors, etc.) to provide a richer branded appearance.

Theme-aware composite classes:

- Format: `accent-{themeShort}-{accentShort}` where `{themeShort}` is `light` or `dark` and `{accentShort}` is the accent id without the `accent-` prefix (for example `accent-light-huly` or `accent-dark-huly`).
- Usage: The Theme provider applies the composite class to the document root automatically for the currently active theme and accent. This allows CSS to target theme-and-accent-specific tokens (for example `.accent-dark-huly { --primary-edit-border-color: #6499ff; }`).
- Helper: You can build the composite class programmatically using the helper exported by the theme package:

```typescript
import { getCompositeAccentClass } from '@hcengineering/theme'

const cls = getCompositeAccentClass('theme-light', 'accent-huly') // 'accent-light-huly'
```

- Previewing alternate themes: For UI previews that need to show an accent in a different theme than the current one, compute the composite class and add it to the preview container so the preview reflects the theme-specific appearance.

## Available Types

```typescript
import type { AccentColorType } from '@hcengineering/theme'
import { AccentColor } from '@hcengineering/theme'

// Usage
const myAccent: AccentColorType = AccentColor.Red
```

## Storage

Accent color preference is stored in localStorage under the key `accent` and defaults to `AccentColor.Blue`.
