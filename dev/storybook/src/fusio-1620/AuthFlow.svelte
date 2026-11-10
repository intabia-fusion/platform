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
  import { createEventDispatcher, onMount, tick } from 'svelte'
  import { Button, Checkbox, CodeInput, TextInput } from '@hcengineering/ui/kit'
  import BallRight from '../../../../plugins/login-resources/src/components/icons/BallRight.svelte'
  import BallLeft from '../../../../plugins/login-resources/src/components/icons/BallLeft.svelte'
  import Brand from './Brand.svelte'
  import { demoInvitation } from './demo'

  export let initialStep: 'email' | 'otp' | 'workspace' | 'name' | 'done' = 'email'
  export let initialState: 'default' | 'invalid' | 'expired' | 'rate-limit' | 'locked' | 'sending' | 'resend' = 'default'
  export let returning = false
  export let initialEmail = ''
  export let initialInvitation = ''
  export let invitedWorkspace = demoInvitation.workspace
  export let invitedBy = demoInvitation.invitedBy

  const dispatch = createEventDispatcher<{
    complete: { email: string, firstName: string, lastName: string, workspace: string }
  }>()
  let step = initialStep
  let email = initialEmail
  let code = ''
  let workspace = ''
  let workspaceName = ''
  let firstName = ''
  let lastName = ''
  let personalData = false
  let rules = false
  let highlightConsents = false
  let error = ''
  let busy = false
  let misses = 0
  let now = Date.now()
  let retryOn = 0
  let expiresOn = 0
  let lockedUntil = 0
  let rateUntil = 0
  let activeEmail = ''
  const limits = new Map<string, { retryOn: number, expiresOn: number, lockedUntil: number, rateUntil: number, misses: number }>()
  let requestTimer: ReturnType<typeof setTimeout>
  let root: HTMLElement

  $: invited = initialInvitation !== ''
  $: invalidInvitation = invited && initialInvitation.trim() !== demoInvitation.token
  $: reset(initialStep, initialState, initialEmail, initialInvitation, invitedWorkspace)
  $: wait = Math.max(0, Math.ceil((Math.max(retryOn, lockedUntil) - now) / 1000))
  $: blocked = lockedUntil > now || rateUntil > now
  $: formattedWait = wait >= 60 ? `${Math.floor(wait / 60)} мин ${wait % 60} с` : `${wait} с`
  $: titles = {
    email: 'Начнем с почты',
    otp: 'Введите код',
    workspace: 'Создайте пространство',
    name: 'Как вас зовут?',
    done: 'Все готово'
  }

  function reset (nextStep: typeof initialStep, state: typeof initialState, nextEmail: string, nextInvitation: string, nextWorkspace: string): void {
    clearTimeout(requestTimer)
    limits.clear()
    now = Date.now()
    step = nextInvitation !== '' && nextStep === 'workspace' ? 'name' : nextStep
    workspace = nextInvitation.trim() === demoInvitation.token ? nextWorkspace : ''
    email = nextEmail !== '' ? nextEmail : (nextStep === 'email' ? '' : 'anna.smirnova@intabia.io')
    activeEmail = email.trim().toLowerCase()
    code = ''
    error = state === 'invalid' ? (nextStep === 'email' ? 'Проверьте адрес электронной почты.' : 'Неверный код. Попробуйте еще раз.') : ''
    if (state === 'expired') error = 'Срок действия кода истек. Запросите новый код.'
    if (state === 'rate-limit') error = 'Слишком много запросов. Повторите после окончания ожидания.'
    if (state === 'locked') error = 'Слишком много неверных кодов. Следующая попытка доступна через час.'
    retryOn = nextStep === 'otp' && state !== 'resend' ? now + 60000 : 0
    if (state === 'rate-limit') retryOn = now + 60000
    rateUntil = state === 'rate-limit' ? now + 60000 : 0
    lockedUntil = state === 'locked' ? now + 3600000 : 0
    expiresOn = state === 'expired' ? now - 1 : now + 60000
    busy = state === 'sending'
    misses = state === 'locked' ? 5 : 0
  }

  function changeEmail (value: string): void {
    const key = value.trim().toLowerCase()
    if (key === activeEmail) return
    limits.set(activeEmail, { retryOn, expiresOn, lockedUntil, rateUntil, misses })
    const saved = limits.get(key)
    retryOn = saved?.retryOn ?? 0
    expiresOn = saved?.expiresOn ?? 0
    lockedUntil = saved?.lockedUntil ?? 0
    rateUntil = saved?.rateUntil ?? 0
    misses = saved?.misses ?? 0
    activeEmail = key
    error = ''
  }

  async function focusStep (): Promise<void> {
    await tick()
    root?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus()
  }

  function sendCode (): void {
    if (busy || wait > 0 || invalidInvitation) return
    highlightConsents = true
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      error = 'Введите корректный адрес электронной почты.'
      return
    }
    if (!personalData || !rules) {
      error = 'Для продолжения подтвердите оба обязательных согласия.'
      return
    }
    issueCode()
  }

  function issueCode (): void {
    if (busy || wait > 0 || invalidInvitation) return
    busy = true
    error = ''
    requestTimer = setTimeout(() => {
      busy = false
      now = Date.now()
      retryOn = now + 60000
      expiresOn = now + 60000
      code = ''
      step = 'otp'
      void focusStep()
    }, 650)
  }

  function complete (): void {
    if (invalidInvitation) return
    step = 'done'
    if (returning) {
      firstName = 'Анна'
      lastName = 'Смирнова'
    }
    dispatch('complete', { email: email.trim(), firstName, lastName, workspace })
  }

  function verify (): void {
    now = Date.now()
    if (busy || blocked || invalidInvitation) return
    if (now >= expiresOn) {
      error = 'Срок действия кода истек. Запросите новый код.'
      return
    }
    if (code !== '482913') {
      misses += 1
      if (misses >= 5) {
        lockedUntil = now + 3600000
        error = 'Слишком много неверных кодов. Повторите после окончания блокировки.'
      } else error = `Неверный код. Осталось попыток: ${5 - misses}.`
      return
    }
    error = ''
    if (returning) complete()
    else {
      step = invited ? 'name' : 'workspace'
      void focusStep()
    }
  }

  function selectWorkspace (): void {
    if (invited || invalidInvitation) return
    if (workspaceName.trim() === '') {
      error = 'Введите название пространства.'
      return
    }
    workspace = workspaceName.trim()
    step = 'name'
    error = ''
    void focusStep()
  }

  function saveName (): void {
    if (firstName.trim() === '' || lastName.trim() === '') {
      error = 'Введите имя и фамилию.'
      return
    }
    firstName = firstName.trim()
    lastName = lastName.trim()
    complete()
  }

  onMount(() => {
    const timer = setInterval(() => { now = Date.now() }, 250)
    void focusStep()
    return () => {
      clearInterval(timer)
      clearTimeout(requestTimer)
    }
  })
</script>

<main class="auth-page" bind:this={root}>
  <div class="ball right" aria-hidden="true"><BallRight /></div>
  <div class="ball left" aria-hidden="true"><BallLeft /></div>
  <section class="auth-card" aria-labelledby="auth-title">
    <Brand />
    {#if invited && !invalidInvitation}
      <p class="invitation-context" data-testid="invitation-context">{invitedBy} приглашает вас в пространство <strong>{invitedWorkspace}</strong></p>
    {/if}
    {#if step === 'otp' && !invalidInvitation}
      <div class="otp-recipient">
        <p>Код отправлен на</p>
        <div class="recipient-row">
          <strong>{email !== '' ? email : 'anna.smirnova@intabia.io'}</strong>
          <Button kind="ghost" size="small" disabled={busy} on:click={() => { step = 'email'; error = ''; void focusStep() }}>Изменить почту</Button>
        </div>
      </div>
    {/if}
    <h1 id="auth-title">{titles[step]}</h1>
    {#if invalidInvitation}
      <p class="error" role="alert">Приглашение не найдено или больше не действует. Попросите отправителя прислать новую ссылку.</p>
    {:else if step === 'email'}
      <p>Пришлем одноразовый код на вашу почту.</p>
      <form on:submit|preventDefault={sendCode} novalidate>
        <div class="field">
          <label for="auth-email">Электронная почта</label>
          <TextInput id="auth-email" aria-label="Электронная почта" type="email" autocomplete="email" size="extra-large" fullWidth bind:value={email} on:input={(event) => { changeEmail(event.detail) }} error={error !== ''} disabled={busy} />
        </div>
        <div class="consents">
          <Checkbox aria-label="Согласие на обработку персональных данных" bind:checked={personalData} error={highlightConsents && !personalData} disabled={busy}>
            Я даю <a href="https://localhost:8080/legal/agreement" target="_blank" rel="noopener noreferrer">Согласие на обработку персональных данных</a>
          </Checkbox>
          <Checkbox aria-label="Согласие с договором, соглашением и политикой конфиденциальности" bind:checked={rules} error={highlightConsents && !rules} disabled={busy}>
            Я согласен с <a href="https://localhost:8080/legal/license" target="_blank" rel="noopener noreferrer">Лицензионным договором</a>,
            <a href="https://localhost:8080/legal/user-agreement" target="_blank" rel="noopener noreferrer">Пользовательским соглашением</a>,
            <a href="https://localhost:8080/legal/confidential" target="_blank" rel="noopener noreferrer">Политикой конфиденциальности</a>
          </Checkbox>
        </div>
        <Button type="submit" kind="primary" size="extra-large" loading={busy} disabled={wait > 0}>Получить код</Button>
      </form>
    {:else if step === 'otp'}
      <form on:submit|preventDefault={verify}>
        <CodeInput size="large" separator={false} bind:value={code} error={error !== ''} disabled={blocked || busy} aria-label="Код из письма" />
        <Button type="submit" kind="primary" size="extra-large" disabled={code.length !== 6 || blocked || busy}>Подтвердить</Button>
        <Button kind="ghost" loading={busy} disabled={wait > 0} on:click={issueCode}>Отправить код повторно</Button>
      </form>
    {:else if step === 'workspace'}
      <p>В пространстве вы сможете работать вместе и приглашать коллег. Обычно его называют по названию компании.</p>
      <form on:submit|preventDefault={selectWorkspace}>
        <div class="field">
          <label for="auth-workspace">Название пространства</label>
          <TextInput id="auth-workspace" aria-label="Название пространства" placeholder={getEmbeddedLabel('Например, название компании')} size="extra-large" fullWidth bind:value={workspaceName} />
        </div>
        <Button type="submit" kind="primary" size="extra-large">Создать пространство</Button>
      </form>
    {:else if step === 'name'}
      <p>Имя и фамилия сохранятся в глобальном профиле и будут видны во всех пространствах.</p>
      <form on:submit|preventDefault={saveName}>
        <div class="field">
          <label for="auth-first-name">Имя</label>
          <TextInput id="auth-first-name" aria-label="Имя" autocomplete="given-name" size="extra-large" fullWidth bind:value={firstName} />
        </div>
        <div class="field">
          <label for="auth-last-name">Фамилия</label>
          <TextInput id="auth-last-name" aria-label="Фамилия" autocomplete="family-name" size="extra-large" fullWidth bind:value={lastName} />
        </div>
        <Button type="submit" kind="primary" size="extra-large">Открыть пространство</Button>
      </form>
    {:else}
      <p role="status">{returning ? 'Вход выполнен. Ваши пространства доступны в личном кабинете.' : `Добро пожаловать${firstName !== '' ? `, ${firstName}` : ''}! Ваше пространство готово.`}</p>
    {/if}
    {#if error !== '' && !invalidInvitation}<p class="error" role="alert">{error}</p>{/if}
    {#if !invalidInvitation && wait > 0 && (step === 'email' || step === 'otp')}
      <p class="timer" role="timer">{lockedUntil > now || rateUntil > now ? 'Следующая попытка' : 'Повторная отправка'} через {formattedWait}</p>
    {/if}
  </section>
  <footer>© 2026 Intabia Fusion</footer>
</main>

<style lang="scss">
  .auth-page {
    position: relative;
    isolation: isolate;
    display: flex;
    min-height: 100vh;
    box-sizing: border-box;
    align-items: center;
    justify-content: center;
    padding: 48px 20px 72px;
    overflow: hidden;
    background: radial-gradient(ellipse at 60% 100%, #42113f, transparent 60%), linear-gradient(160deg, #0b0123, #250932 70%, #100118);
    color: #201240;
    --global-primary-TextColor: #201240;
    --global-secondary-TextColor: #5c6470;
    --global-focus-BorderColor: #cf13a2;
    --input-BackgroundColor: #f6f6f8;
    --input-hover-BackgroundColor: #f0f0f3;
    --input-BorderColor: #dedee5;
    --input-error-BorderColor: #b1213c;
    --kit-button-primary-BackgroundColor: #cf13a2;
    --kit-button-primary-hover-BackgroundColor: #b60e8e;
    --kit-button-primary-active-BackgroundColor: #9b0e7a;
    --button-accent-LabelColor: #fff;
    --button-accent-IconColor: #fff;
    --button-disabled-BackgroundColor: #eee6f0;
    --button-disabled-LabelColor: #776d7e;
    --selector-active-BackgroundColor: #cf13a2;
    --selector-IconColor: #fff;
  }
  .auth-card {
    display: flex;
    flex-direction: column;
    gap: 20px;
    z-index: 1;
    width: 460px;
    box-sizing: border-box;
    padding: 32px;
    border-radius: 20px;
    background: #fff;
    box-shadow: 0 24px 90px #0005;
  }
  h1 { margin: 8px 0 0; color: #000061; font-size: 28px; line-height: 36px; font-weight: 700; }
  p { margin: 0; color: #5c6470; font-size: 14px; line-height: 21px; overflow-wrap: anywhere; }
  strong { display: block; font-weight: 500; color: #201240; }
  form { display: flex; flex-direction: column; gap: 20px; }
  .field { display: flex; flex-direction: column; gap: 8px; }
  label { font-size: 13px; font-weight: 500; }
  .consents { display: flex; flex-direction: column; gap: 12px; }
  a { color: inherit; text-decoration: underline; }
  .error { color: #b1213c; }
  .timer { font-variant-numeric: tabular-nums; font-size: 13px; }
  .ball { position: absolute; pointer-events: none; z-index: -1; }
  .right { right: 8%; top: 12%; }
  .left { left: 8%; bottom: 5%; }
  footer { position: absolute; bottom: 24px; color: #e6dce8; font-size: 12px; }
  .otp-recipient { display: flex; flex-direction: column; gap: 4px; }
  .recipient-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .recipient-row strong { min-width: 0; overflow-wrap: anywhere; font-size: 14px; }
  .auth-card :global(.code-input) { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; width: 100%; }
  .auth-card :global(.code-input__cell) { width: 100%; height: 68px; border-radius: 12px; font-size: 28px; }
  .auth-card :global(.text-input__input),
  .auth-card :global(.code-input__cell) { caret-color: #201240; }
  .auth-card :global(.text-input--error .text-input__field:has(.text-input__input:focus)),
  .auth-card :global(.code-input--error .code-input__cell:focus) { outline: none; }
  .auth-card :global(.text-input--error .text-input__field:has(.text-input__input:focus-visible)),
  .auth-card :global(.code-input--error .code-input__cell:focus-visible) {
    box-shadow: inset 0 0 0 2px var(--input-error-BorderColor);
  }
  .consents :global(.checkbox__label) { font-size: 12px; line-height: 18px; }
  @media (max-width: 480px) {
    .auth-page { padding: 24px 16px 64px; }
    .auth-card { width: 100%; padding: 24px; gap: 18px; }
    h1 { font-size: 25px; line-height: 32px; }
    .auth-card :global(.code-input) { gap: 6px; }
    .auth-card :global(.code-input__cell) { height: 60px; }
    .right { right: -150px; }
    .left { left: -160px; }
  }
</style>
