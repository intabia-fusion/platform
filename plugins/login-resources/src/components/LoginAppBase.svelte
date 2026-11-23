<!--
// Copyright © 2020, 2021 Anticrm Platform Contributors.
// Copyright © 2021, 2022 Hardcore Engineering Inc.
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
  import platform, { getMetadata } from '@hcengineering/platform'
  import { Popup, Scroller, deviceOptionsStore as deviceInfo, Button } from '@hcengineering/ui'
  import workbench from '@hcengineering/workbench'
  import { onMount } from 'svelte'
  import login from '../plugin'

  // Resolve static asset URLs at runtime to avoid requiring image module declarations
  // (prevents TypeScript / diagnostics errors when module types are missing)
  import loginBack from '../../img/login_back.png'
  import loginBack2x from '../../img/login_back_2x.png'
  import loginBackAvif from '../../img/login_back.avif'
  import loginBack2xAvif from '../../img/login_back_2x.avif'
  import loginBackWebp from '../../img/login_back.webp'
  import loginBack2xWebp from '../../img/login_back_2x.webp'
  import intabiaMark from '../../img/intabia-mark.png'
  import intabiaWordmark from '../../img/intabia-wordmark.png'
  import intabiaPlatformWordmark from '../../img/intabia-platform-wordmark.png'

  export let wide: boolean = false

  import { loginTheme, setLoginTheme, type LoginThemeName } from '../theme'
  import Label from './internal/Label.svelte'
  import { NavLink } from '@hcengineering/presentation'
  import setting from '@hcengineering/setting'

  onMount(() => {
    // Initialize login theme from platform metadata if provided
    const lTheme = getMetadata(login.metadata.LoginTheme) as LoginThemeName | undefined
    if (lTheme === 'intabia' || lTheme === 'huly') {
      setLoginTheme(lTheme)
    }
  })

  // activeTheme is used everywhere for rendering (prefers override if set)
  $: activeTheme = $loginTheme

  // themeStyle resolves to override theme vars when override is active, otherwise to store theme vars
  function onDevThemeChange (e: Event): void {
    const v = (e.target as HTMLSelectElement).value as LoginThemeName
    // set local override and apply accent class immediately (no store change)
    setLoginTheme(v)
  }
  $: isNarrow = $deviceInfo.docWidth <= 768

  const currentYear = new Date().getFullYear()
  const copyright = getMetadata(login.metadata.Copyright) as IntlString
</script>

<div
  class="w-full h-full backd"
  class:accent-intabia={activeTheme.name === 'intabia'}
  class:wide-layout={wide}
  class:paneld={$deviceInfo.docWidth <= 768}
  class:login-theme-intabia={activeTheme.name === 'intabia'}
  class:login-theme-huly={activeTheme.name === 'huly'}
>
  <div class="bg-image clear-mins p-4 back">
    {#if activeTheme.backgroundComponent}
      <div class="back-image" style:display="block">
        <svelte:component this={activeTheme.backgroundComponent} />
      </div>
    {:else}
      <picture>
        <source srcset={`${loginBackAvif}, ${loginBack2xAvif} 2x`} type="image/avif" />
        <source srcset={`${loginBackWebp}, ${loginBack2xWebp} 2x`} type="image/webp" />

        <img
          class="back-image"
          src={loginBack}
          style:display="block"
          srcset={`${loginBack} 1x, ${loginBack2x} 2x`}
          alt=""
        />
      </picture>
    {/if}

    <div class="content-block">
      {#if activeTheme.name !== 'intabia' || wide}
        <div
          style:position={isNarrow && !wide ? 'static' : 'fixed'}
          style:left={isNarrow && !wide ? undefined : '1.75rem'}
          style:top={isNarrow && !wide ? undefined : '3rem'}
          style:z-index={1001}
          class="px-4 logo"
        >
          <svelte:component this={activeTheme.logoComponent} />
          {#if activeTheme.showTitle}
            <span class="fs-title ml-2">{getMetadata(workbench.metadata.PlatformTitle)}</span>
          {/if}
        </div>
      {/if}

      {#if getMetadata(platform.metadata.DevModel)}
        <div style:position="fixed" style:left="0px" style:top="0px" style:z-index={1001} class="flex-row-center">
          <select class="select small" value={$loginTheme.name} on:change={onDevThemeChange}>
            <option value="intabia">Intabia</option>
            <option value="huly">Huly</option>
          </select>
        </div>
      {/if}

      <div class:panel-base={!wide} class="panel" class:wide>
        <Scroller padding="1rem 0" noStretch={!wide}>
          <div class="form-content" class:with-brand={activeTheme.name === 'intabia' && !wide}>
            {#if activeTheme.name === 'intabia' && !wide}
              <div class="card-brand" role="img" aria-label="Intabia Platform">
                <img src={intabiaMark} alt="" width="44" height="44" />
                <div class="card-wordmark" aria-hidden="true">
                  <span class="card-wordmark-intabia" style:mask-image="url({intabiaWordmark})" />
                  <span class="card-wordmark-platform" style:mask-image="url({intabiaPlatformWordmark})" />
                </div>
              </div>
            {/if}
            <slot name="form-content" />
          </div>
        </Scroller>
      </div>
    </div>

    <Popup />
    <div class="footer">
      <span>© {currentYear}, <Label label={copyright} /></span>
      {#if getMetadata(login.metadata.UsageUrl)}
        <NavLink href={getMetadata(login.metadata.UsageUrl)}><Label label={login.string.UsageConditions} /></NavLink>
      {/if}
      <div class="footer-actions">
        <slot name="footer-action" />
        {#if getMetadata(login.metadata.SupportUrl)}
          <Button
            kind="regular"
            borderStyle="none"
            size="small"
            label={setting.string.Support}
            on:click={() => {
              window.open(getMetadata(login.metadata.SupportUrl), '_blank')
            }}
          />
        {/if}
      </div>
    </div>
  </div>
</div>

<style lang="scss">
  @use './themes/intabia.scss';
  @use './themes/huly.scss';

  .wide {
    position: fixed !important;
    top: 10rem !important;
    left: 2rem !important;
    right: 2rem !important;
    bottom: 2rem !important;

    transform: none !important;
    /* width: calc(100% - 4rem) !important;
    height: calc(100% - 5rem) !important; */
  }

  .back-image {
    position: fixed;
    top: 32px;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: left top;
    /* Ensure the background stays behind content and doesn't capture pointer events */
    z-index: -2;
    pointer-events: none;
  }

  /* Page layout helpers */
  .backd {
    position: relative;
  }
  /* Transparent on desktop; the mobile block makes it the centering box. */
  .content-block {
    display: contents;
  }
  .bg-image {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 100%;
  }

  .fs-title {
    color: var(--login-content-color, var(--theme-content-color));
  }

  /* Centralized layout: panel sizing/positioning is identical across themes.
     Themes control visuals only (colors, gradients, images). */
  .panel-base {
    position: fixed !important;
    z-index: 1000 !important;
    display: flex;
    flex-direction: column;
    justify-content: center;
    width: 24% !important;
    width: 460px !important;
    height: auto;
    left: 50% !important;
    top: 50% !important;
    transform: translate(-50%, -50%) !important;
  }

  .panel {
    position: relative;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: auto;
    background: var(--login-panel-gradient), var(--login-panel-bg, rgba(45, 50, 160, 0.5));
    mix-blend-mode: normal;
    box-shadow: -30px 1.52px 173.87px #121437;
    backdrop-filter: blur(157.855px);
    border-radius: 1rem;
  }

  .panel::before {
    position: absolute;
    content: '';
    inset: 0;
    border: 1px solid transparent;
    background:
      var(--login-panel-gradient) padding-box,
      conic-gradient(
          from 180deg,
          rgba(255, 255, 255, 0.126) 10%,
          rgba(126, 120, 165, 0.35),
          rgba(191, 216, 253, 0.35),
          rgba(246, 247, 249, 0.224),
          rgba(219, 229, 242, 0.238) 60%,
          rgba(163, 203, 255, 0.168) 90%
        )
        border-box;
    border-radius: 1rem;
    z-index: -1;
    pointer-events: none;
  }

  /* Content wrapper inside the panel */
  .panel .form-content {
    display: flex;
    flex-direction: column;
    justify-content: center;
    /* flex-grow: 1; */
    height: 100%;
  }

  .card-brand {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 1rem 2rem 0;
    color: #000061;
  }

  .card-brand img {
    flex: none;
  }

  .card-wordmark {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .card-wordmark span {
    display: block;
    background: currentColor;
    mask-size: contain;
    mask-repeat: no-repeat;
    mask-position: left center;
  }

  .card-wordmark-intabia {
    width: 85px;
    height: 11px;
  }

  .card-wordmark-platform {
    width: 120px;
    height: 14px;
  }

  .with-brand > :global(form.container) {
    padding-top: 1.25rem !important;
  }

  /* Let the content define its own height so the page can grow around it. */
  @media (max-height: 760px), (max-width: 768px) {
    .panel:not(.wide) .form-content {
      height: auto;
    }
  }

  /* Desktop keeps a fixed, centered panel, so its Scroller handles overflow. */
  @media (min-width: 769px) {
    .panel-base {
      max-height: calc(100dvh - 2rem);
      overflow: hidden;
    }
  }

  .footer {
    position: fixed;
    left: 1.75rem;
    bottom: 1rem;
    display: flex;
    flex-direction: row;
    gap: 2rem;
    width: calc(100vw - 3.5rem);
    align-items: center;
  }

  .footer-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  /* Intabia-scoped primary button visuals */
  .login-theme-intabia .antiButton.primary {
    border-radius: var(--primary-button-border-radius, 0.5rem);
    padding: var(--primary-button-padding, 0 1.5rem);
    height: var(--primary-button-height, 3.5rem);
    font-size: var(--primary-button-font-size, 1rem);
    font-weight: var(--primary-button-font-weight, 600);
    background-color: var(--login-primary-button-default);
    color: var(--login-button-text-color, #ffffff);
  }
  .login-theme-intabia .antiButton.primary:hover {
    background-color: var(--login-primary-button-hovered);
  }
  .login-theme-intabia .antiButton.primary:active {
    background-color: var(--login-primary-button-pressed);
  }
  .login-theme-intabia .antiButton.primary:focus-visible {
    outline: 0;
    box-shadow: 0 0 0 4px var(--login-primary-button-focus-ring);
    border-color: var(--login-primary-button-focused);
  }
  .login-theme-intabia .antiButton.primary[disabled],
  .login-theme-intabia .antiButton.primary:disabled {
    background: var(--login-button-contrast-disabled);
    color: var(--login-button-contrast-disabled-color);
    cursor: not-allowed;
    opacity: 1;
    box-shadow: none;
    border-color: var(--login-button-contrast-border);
  }
  /* Localized popup label color for login theme (applies only inside login UI) */
  .login-theme-intabia .login-popup .hulyPopup-row__label {
    color: var(--login-content-color, var(--theme-content-color));
  }

  /* Huly-scoped primary button visuals (contrast) */
  .login-theme-huly .antiButton.primary {
    border-radius: var(--primary-button-border-radius, 0.5rem);
    padding: var(--primary-button-padding, 0 1.5rem);
    height: var(--primary-button-height, 3.5rem);
    font-size: var(--primary-button-font-size, 1rem);
    font-weight: var(--primary-button-font-weight, 600);
    background-color: var(--login-button-contrast-enabled, rgb(255, 255, 255));
    color: var(--login-button-contrast-color, rgb(0, 0, 0));
    border-color: var(--login-button-contrast-border, rgba(255, 255, 255, 0.2));
  }
  .login-theme-huly .antiButton.primary:hover {
    background-color: var(--login-button-contrast-hovered, #ffffff);
  }
  .login-theme-huly .antiButton.primary:active {
    background-color: var(--login-button-contrast-pressed, rgba(255, 255, 255, 0.6));
  }
  .login-theme-huly .antiButton.primary:focus-visible {
    outline: 0;
    box-shadow: 0 0 0 4px var(--login-primary-button-focus-ring);
    border-color: var(--login-primary-button-focused);
  }
  .login-theme-huly .antiButton.primary[disabled],
  .login-theme-huly .antiButton.primary:disabled {
    background: var(--login-button-contrast-disabled);
    color: var(--login-button-contrast-disabled-color);
    cursor: not-allowed;
    opacity: 1;
    box-shadow: none;
    border-color: var(--login-button-contrast-border);
  }
  /* Localized popup label color for Huly login theme (applies only inside login UI) */
  .login-theme-huly .login-popup .hulyPopup-row__label {
    color: var(--login-content-color, var(--theme-content-color));
  }

  /* Mobile fallbacks: make panel full-width and ensure panel-base padding/background
     so the login container looks correct on smaller screens and is controlled centrally. */
  @media (max-width: 768px) {
    .card-brand {
      margin: 0.5rem 1.5rem 0;
    }
    /* Full width minus margins; `wide` keeps its own fullscreen layout. */
    .panel:not(.wide),
    .panel-base {
      position: static !important;
      left: auto !important;
      top: auto !important;
      transform: none !important;
      width: calc(100% - 2rem) !important;
      min-width: 0 !important;
      max-width: calc(100% - 2rem) !important;
      margin-left: 1rem !important;
      margin-right: 1rem !important;
      /* Grow with the form; `.bg-image` scrolls the whole page instead. */
      max-height: none;
      overflow: visible;
    }

    .backd.paneld .panel-base,
    .backd .paneld .panel-base {
      width: calc(100% - 2rem) !important;
      margin-left: 1rem !important;
      margin-right: 1rem !important;
    }

    /* Inner Scroller must size to content so `.bg-image` owns the scrolling. */
    .backd:not(.wide-layout) .panel :global(.scroller-container),
    .backd:not(.wide-layout) .panel :global(.scroll) {
      height: auto;
      overflow: visible;
    }

    /* Page-level scroller; the column stacks from the top. */
    .backd:not(.wide-layout) .bg-image {
      flex-direction: column;
      justify-content: flex-start;
      align-items: stretch;
      padding: 1.5rem 0 0 !important;
      height: 100dvh;
      overflow-y: auto;
    }

    /* No auto margins: they swallow overflow and hide the footer. */
    .backd:not(.wide-layout) .panel {
      margin-top: 0 !important;
      margin-bottom: 0 !important;
      flex-shrink: 0;
    }

    /* Grows into the free space and centers a short form; on a tall form it
       shrinks to its content, leaving the footer reachable. */
    .backd:not(.wide-layout) .content-block {
      display: flex;
      flex-direction: column;
      justify-content: center;
      flex: 1 0 auto;
      min-height: 0;
    }

    /* Scrolls away with the page. */
    .backd:not(.wide-layout) .logo {
      justify-content: center;
      margin-bottom: 1.5rem;
      flex-shrink: 0;
    }

    /* Cap the 235x50 Intabia svg; Huly's 16x16 icon is already smaller. */
    .backd:not(.wide-layout) .logo :global(svg) {
      max-width: min(11rem, 55vw);
      height: auto;
    }

    /* In flow at the end of the column, so the scroll reaches it. */
    .backd:not(.wide-layout) .footer {
      position: static;
      left: auto;
      bottom: auto;
      width: 100%;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      margin-top: 1.5rem;
      /* Bottom padding lives here: a scrolling flex container's own
         padding-bottom is dropped by Chrome/Safari. */
      padding: 0 1rem 3rem;
      flex-shrink: 0;
    }

    .backd:not(.wide-layout) .footer-actions {
      margin-left: 0;
      order: -1;
      flex-direction: column;
      gap: 0.5rem;
    }
  }
</style>
