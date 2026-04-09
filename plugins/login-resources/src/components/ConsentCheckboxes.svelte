<script lang="ts">
  import { getMetadata, translate } from '@hcengineering/platform'
  import { Html, themeStore } from '@hcengineering/ui'
  import login from '../plugin'

  export let agreedPersonalData: boolean = false
  export let agreedRules: boolean = false

  let personalDatalabel = ''
  $: void translate(
    login.string.AgreedPersonalData,
    { link: getMetadata(login.metadata.PersonalDataUrl) },
    $themeStore.language
  ).then((res) => {
    personalDatalabel = res
  })

  let rulesLabel = ''
  $: void translate(
    login.string.AgreedRules,
    { link: getMetadata(login.metadata.RulesUrl) },
    $themeStore.language
  ).then((res) => {
    rulesLabel = res
  })
</script>

<label class="check-label">
  <input type="checkbox" data-testid="checkbox-personal-data" bind:checked={agreedPersonalData} />
  <span><Html value={personalDatalabel} /></span>
</label>
<label class="check-label">
  <input type="checkbox" data-testid="checkbox-rules" bind:checked={agreedRules} />
  <span><Html value={rulesLabel} /></span>
</label>

<style lang="scss">
  .check-label {
    display: inline-flex;
    gap: 0.5rem;
    font-size: 0.95rem;
    color: var(--login-content-color, var(--theme-content-color));
    margin-bottom: 0.5rem;
  }

  /* Custom-styled checkbox so it's visible across themes (Intabia/Huly).
     Keep visuals simple and theme-aware via `--login-*` tokens (fallbacks to global tokens). */
  .check-label input[type='checkbox'] {
    -webkit-appearance: none;
    appearance: none;
    width: 1.125rem;
    height: 1.125rem;
    /* Thicker, more contrasting border to ensure visibility on light backgrounds */
    border: 2px solid var(--login-darker-color, var(--theme-darker-color, rgba(0, 0, 0, 0.2)));
    background: var(--login-button-default, var(--theme-button-default, #ffffff));
    border-radius: 0.2rem;
    display: inline-block;
    flex-shrink: 0;
    position: relative;
    box-sizing: border-box;
    vertical-align: middle;
    /* Provide native accent fallback so platform checkboxes remain visible when appearance can't be suppressed */
    accent-color: var(--login-primary-button-default, var(--primary-button-default));
  }

  .check-label input[type='checkbox']:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.06);
  }

  .check-label input[type='checkbox']:checked {
    background: var(--login-primary-button-default, var(--primary-button-default, #cf13a2));
    border-color: var(--login-primary-button-default, var(--primary-button-default));
  }

  .check-label input[type='checkbox']:checked::after {
    content: '';
    position: absolute;
    left: 0.36rem;
    top: 0.06rem;
    width: 0.26rem;
    height: 0.6rem;
    border: solid var(--login-button-text-color, var(--primary-button-color, #ffffff));
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }
</style>
