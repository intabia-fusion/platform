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
  import { createEventDispatcher } from 'svelte'
  import ui, { Icon } from '@hcengineering/ui'
  import { Button, Checkbox, TextInput } from '@hcengineering/ui/kit'
  import Brand from './Brand.svelte'
  import { demoInvitation } from './demo'

  export let initialSection: 'profile' | 'workspaces' = 'profile'
  export let initialState: 'default' | 'editing' | 'loading' | 'error' | 'empty' | 'save-error' | 'invite-error' = 'default'
  export let firstName = 'Анна'
  export let lastName = 'Смирнова'
  export let email = 'anna.smirnova@intabia.io'
  export let workspace: string | undefined = undefined

  const dispatch = createEventDispatcher<{ logout: null }>()
  let section = initialSection
  let state = initialState
  let profile = { firstName, lastName, username: 'anna', bio: 'Продуктовый дизайнер', city: 'Новосибирск', country: 'Россия', public: true }
  let draft = { ...profile }
  let editing = initialState === 'editing' || initialState === 'save-error'
  let menuOpen = false
  let error = ''
  let notice = ''
  let copyStatus = ''
  let inviteVisible = initialState !== 'empty'
  let invitationCreated = false
  let inviteError = initialState === 'invite-error'
  let failSave = initialState === 'save-error'
  const defaultWorkspaces = [
    { name: 'Intabia Platform', mark: 'IP', role: 'Участник', visit: 'Сегодня, 16:42' },
    { name: 'Команда Анны', mark: 'КА', role: 'Владелец', visit: 'Сегодня, 14:18' },
    { name: 'Design Team', mark: 'DT', role: 'Участник', visit: 'Вчера' }
  ]
  let workspaces = workspace !== undefined ? [{ name: workspace, mark: workspace.slice(0, 2), role: 'Участник', visit: 'Только что' }] : initialState === 'empty' ? [] : [...defaultWorkspaces]
  let previousSection = initialSection
  let previousState = initialState
  let previousWorkspace = workspace
  let previousFirstName = firstName
  let previousLastName = lastName
  $: if (initialSection !== previousSection) {
    previousSection = initialSection
    section = initialSection
  }
  $: if (initialState !== previousState) {
    previousState = initialState
    state = initialState
    editing = initialState === 'editing' || initialState === 'save-error'
    failSave = initialState === 'save-error'
    inviteError = initialState === 'invite-error'
    inviteVisible = initialState !== 'empty'
    error = ''
    notice = ''
    workspaces = initialState === 'empty' ? [] : workspace !== undefined ? [{ name: workspace, mark: workspace.slice(0, 2), role: 'Участник', visit: 'Только что' }] : [...defaultWorkspaces]
  }
  $: if (workspace !== previousWorkspace) {
    previousWorkspace = workspace
    workspaces = workspace !== undefined ? [{ name: workspace, mark: workspace.slice(0, 2), role: 'Участник', visit: 'Только что' }] : initialState === 'empty' ? [] : [...defaultWorkspaces]
  }
  $: if (firstName !== previousFirstName) {
    previousFirstName = firstName
    profile = { ...profile, firstName }
    draft = { ...draft, firstName }
  }
  $: if (lastName !== previousLastName) {
    previousLastName = lastName
    profile = { ...profile, lastName }
    draft = { ...draft, lastName }
  }
  const token = demoInvitation.token
  $: fullName = `${profile.firstName} ${profile.lastName}`.trim()
  $: inviteLink = `${location.origin}/iframe.html?id=fusio-1620-scenario--invitation&args=inviteId:${token}&${new URLSearchParams({ invitedWorkspace: workspace ?? demoInvitation.workspace, invitedBy: fullName })}`
  $: dirty = JSON.stringify(draft) !== JSON.stringify(profile)
  $: initials = `${profile.firstName[0] ?? ''}${profile.lastName[0] ?? ''}`

  function startEditing (): void {
    draft = { ...profile }
    editing = true
    error = ''
    notice = ''
  }

  function cancel (): void {
    draft = { ...profile }
    editing = false
    error = ''
  }

  function save (): void {
    if (draft.firstName.trim() === '' || draft.lastName.trim() === '') {
      error = 'Заполните имя и фамилию.'
      return
    }
    if (failSave) {
      error = 'Не удалось сохранить профиль. Изменения сохранены в форме. Повторите попытку.'
      failSave = false
      return
    }
    profile = { ...draft, firstName: draft.firstName.trim(), lastName: draft.lastName.trim() }
    draft = { ...profile }
    editing = false
    error = ''
    notice = 'Профиль сохранён.'
  }

  function acceptInvite (): void {
    if (inviteError) {
      error = 'Не удалось принять приглашение. Повторите попытку.'
      inviteError = false
      return
    }
    workspaces = [...workspaces, { name: 'Research', mark: 'R', role: 'Участник', visit: 'Только что' }]
    inviteVisible = false
    error = ''
    notice = 'Приглашение в Research принято.'
  }

  async function copy (kind: 'link' | 'token'): Promise<void> {
    try {
      await navigator.clipboard.writeText(kind === 'link' ? inviteLink : token)
      copyStatus = kind === 'link' ? 'Ссылка скопирована.' : 'Токен скопирован.'
    } catch {
      copyStatus = 'Буфер обмена недоступен. Выделите и скопируйте значение вручную.'
    }
  }
</script>

<svelte:window on:keydown={(event) => { if (event.key === 'Escape') menuOpen = false }} />

<div class="cabinet-page">
  <div class="brand"><Brand /></div>
  <div class="cabinet">
    <aside>
      <div class="account-menu">
        <button class="account" aria-expanded={menuOpen} aria-controls="profile-account-menu" on:click={() => { menuOpen = !menuOpen }}>
          <span class="avatar">{initials}</span><span class="account-text"><strong>{fullName}</strong><small>{email}</small></span>
          <Icon icon={ui.icon.ChevronDown} size="small" />
        </button>
        {#if menuOpen}
          <div class="account-popover" id="profile-account-menu">
            <strong>{fullName}</strong><small>{email}</small>
            <button on:click={() => { section = 'profile'; menuOpen = false }}>Глобальный профиль</button>
            <button on:click={() => { section = 'workspaces'; menuOpen = false }}>Сменить пространство</button>
            <button class="logout" on:click={() => dispatch('logout', null)}>Выйти</button>
          </div>
        {/if}
      </div>
      <nav aria-label="Кабинет">
        <button class:active={section === 'profile'} aria-current={section === 'profile' ? 'page' : undefined} on:click={() => { section = 'profile' }}><Icon icon={ui.icon.Person} size="small" />Профиль</button>
        <button class:active={section === 'workspaces'} aria-current={section === 'workspaces' ? 'page' : undefined} on:click={() => { section = 'workspaces' }}><Icon icon={ui.icon.Building} size="small" />Пространства</button>
      </nav>
      <button class="signout" on:click={() => dispatch('logout', null)}><Icon icon={ui.icon.ArrowOut} size="small" />Выйти</button>
    </aside>
    <main>
      <header><div><h1>{section === 'profile' ? 'Профиль' : 'Пространства'}</h1><p>{section === 'profile' ? 'Единые данные во всех пространствах' : 'Переход между пространствами и приглашения'}</p></div>
        {#if section === 'profile' && !editing && state !== 'loading' && state !== 'error'}<Button size="medium" on:click={startEditing}>Редактировать</Button>{/if}
      </header>
      <div class="content">
        {#if state === 'loading'}
          <div class="empty" role="status">Загружаем данные...</div>
        {:else if state === 'error'}
          <div class="empty"><p role="alert">Не удалось загрузить данные.</p><Button size="medium" on:click={() => { state = 'default' }}>Повторить</Button></div>
        {:else}
          {#if error}<p class="error" role="alert">{error}</p>{/if}
          {#if notice}<p class="notice" role="status">{notice}</p>{/if}
          {#if section === 'profile'}
            <section class="public-card" aria-label="Карточка профиля"><span class="avatar large">{initials}</span><div><h2>{fullName}</h2><p>{profile.bio}</p><small>{[profile.city, profile.country].filter(Boolean).join(', ')}</small></div><span class:private={!profile.public} class="badge">{profile.public ? 'Публичный' : 'Приватный'}</span></section>
            {#if editing}
              <form on:submit|preventDefault={save}>
                <div class="edit-fields">
                  <label for="profile-first">Имя<TextInput aria-label="Имя" id="profile-first" bind:value={draft.firstName} required maxlength={100} fullWidth /></label>
                  <label for="profile-last">Фамилия<TextInput aria-label="Фамилия" id="profile-last" bind:value={draft.lastName} required maxlength={100} fullWidth /></label>
                  <label for="profile-username">Имя пользователя<TextInput aria-label="Имя пользователя" id="profile-username" value={draft.username} readonly fullWidth /></label>
                  <label for="profile-email">Email<TextInput aria-label="Email" id="profile-email" value={email} readonly fullWidth /></label>
                  <label for="profile-bio">О себе<TextInput aria-label="О себе" id="profile-bio" bind:value={draft.bio} maxlength={150} fullWidth /></label>
                  <label for="profile-city">Город<TextInput aria-label="Город" id="profile-city" bind:value={draft.city} maxlength={100} fullWidth /></label>
                  <label for="profile-country">Страна<TextInput aria-label="Страна" id="profile-country" bind:value={draft.country} maxlength={50} fullWidth /></label>
                </div>
                <Checkbox aria-label="Публичный профиль" bind:checked={draft.public}>Публичный профиль</Checkbox>
                <p class="muted">Email доступен только для чтения.</p>
                <div class="actions"><Button type="submit" kind="primary" size="medium" disabled={!dirty && !failSave && error === ''}>Сохранить</Button><Button size="medium" on:click={cancel}>Отмена</Button><small role="status">{dirty ? 'Есть несохранённые изменения' : 'Нет изменений'}</small></div>
              </form>
            {:else}
              <dl class="fields">
                {#each [['Имя', fullName], ['Имя пользователя', `@${profile.username}`], ['Email', email], ['Город', profile.city], ['Страна', profile.country]] as [label, value]}
                  <div><dt>{label}</dt><dd>{value === '' ? 'Не указано' : value}</dd></div>
                {/each}
              </dl>
            {/if}
          {:else}
            <h2 class="section-title">Ваши пространства</h2>
            {#if workspaces.length === 0}<div class="empty">У вас пока нет пространств.</div>{:else}
              <div class="workspace-list">{#each workspaces as workspace}<button class="workspace" on:click={() => { notice = `Открыто пространство "${workspace.name}".` }}><span class="mark">{workspace.mark}</span><strong>{workspace.name}</strong><span>{workspace.role}</span><small>{workspace.visit}</small><Icon icon={ui.icon.ChevronRightLarge} size="small" /></button>{/each}</div>
            {/if}
            <section class="invitations"><h2 class="section-title">Приглашения</h2>{#if inviteVisible}<div class="invitation"><div><strong>Research</strong><p>Мария Орлова приглашает вас как участника</p></div><div class="actions"><Button kind="primary" size="medium" on:click={acceptInvite}>Принять</Button><Button size="medium" on:click={() => { inviteVisible = false; error = ''; notice = 'Приглашение отклонено.' }}>Отклонить</Button></div></div>{:else}<p class="muted">Нет новых приглашений.</p>{/if}</section>
            {#if workspaces.some((item) => item.name === (workspace ?? 'Команда Анны'))}
            <section class="invitations"><h2 class="section-title">Пригласить в "{workspace ?? 'Команда Анны'}"</h2>
              {#if invitationCreated}<label for="invite-link">Ссылка приглашения</label><div class="copy-row"><TextInput aria-label="Ссылка приглашения" id="invite-link" value={inviteLink} readonly fullWidth /><Button size="medium" icon={ui.icon.Copy} on:click={() => copy('link')}>Копировать ссылку</Button></div><label for="invite-token">Токен приглашения</label><div class="copy-row"><TextInput aria-label="Токен приглашения" id="invite-token" value={token} readonly fullWidth /><Button size="medium" icon={ui.icon.Copy} on:click={() => copy('token')}>Копировать токен</Button></div><p role="status">{copyStatus}</p>{:else}<Button size="medium" on:click={() => { demoInvitation.workspace = workspace ?? 'Команда Анны'; invitationCreated = true }}>Создать приглашение</Button>{/if}
            </section>
            {/if}
          {/if}
        {/if}
      </div>
    </main>
  </div>
</div>

<style>
  .cabinet-page {
    color-scheme: light;
    --global-primary-TextColor: #24212b;
    --global-secondary-TextColor: #5c6470;
    --global-focus-BorderColor: #cf13a2;
    --input-BackgroundColor: #f5edf6;
    --input-hover-BackgroundColor: #f0e4f3;
    --input-BorderColor: #e5dbe7;
    --input-error-BorderColor: #9e342a;
    --kit-button-primary-BackgroundColor: #cf13a2;
    --kit-button-primary-hover-BackgroundColor: #b60e8e;
    --kit-button-primary-active-BackgroundColor: #9b0e7a;
    --kit-button-secondary-BackgroundColor: #f1edf4;
    --kit-button-secondary-hover-BackgroundColor: #e8dfed;
    --kit-button-secondary-active-BackgroundColor: #dfd2e5;
    --kit-button-secondary-BorderColor: #e5dbe7;
    --kit-button-subtle-LabelColor: #24212b;
    --kit-button-subtle-IconColor: #5c6470;
    --button-accent-LabelColor: #fff;
    --button-accent-IconColor: #fff;
    --button-disabled-BackgroundColor: #eee6f0;
    --button-disabled-LabelColor: #776d7e;
    --button-disabled-IconColor: #776d7e;
    --selector-BackgroundColor: #fff;
    --selector-active-BackgroundColor: #cf13a2;
    --selector-IconColor: #fff;
    min-height: 100vh; padding: 36px; box-sizing: border-box; background: #f3f1f7; color: #24212b; font-family: Inter, sans-serif; }
  .brand { max-width: 1180px; margin: 0 auto 28px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .muted, small { color: #74717d; font-size: 12px; }
  .cabinet { display: flex; max-width: 1180px; min-height: 720px; margin: auto; background: white; border: 1px solid #e8e5ec; border-radius: 12px; box-shadow: 0 12px 40px #24143412; }
  aside { display: flex; flex-direction: column; flex-shrink: 0; width: 256px; padding: 24px 16px 20px; box-sizing: border-box; background: #f8f7fa; border-radius: 12px 0 0 12px; gap: 20px; }
  button { font: inherit; cursor: pointer; border: 0; color: inherit; background: transparent; }
  button:focus-visible { outline: 2px solid #a12c93; outline-offset: 3px; }
  .account { display: flex; align-items: center; gap: 10px; padding: 0; width: 100%; text-align: left; }
  .account-text { flex: 1; min-width: 0; } .account-text strong, .account-text small { display: block; overflow-wrap: anywhere; }
  strong { font-size: 14px; font-weight: 600; } .account-text strong { margin-bottom: 5px; }
  .avatar { display: grid; place-items: center; flex-shrink: 0; width: 40px; height: 40px; border-radius: 50%; background: #eeddf1; color: #7d1f70; font-size: 14px; }
  .account-menu { position: relative; } .account-popover { position: absolute; top: 52px; left: 0; width: 245px; background: white; box-shadow: 0 6px 25px #20124026; border: 1px solid #e8e5ec; border-radius: 10px; padding: 16px; z-index: 2; display: grid; gap: 8px; box-sizing: border-box; }
  .account-popover small { overflow-wrap: anywhere; } .account-popover button { padding: 12px 0; text-align: left; border-top: 1px solid #eee; } .logout { color: #9e342a; }
  nav { display: grid; gap: 6px; } nav button, .signout { display: flex; align-items: center; justify-content: flex-start; gap: 12px; padding: 12px; text-align: left; border-radius: 6px; font-size: 14px; }
  nav .active { background: #efdcf2; color: #7d1f70; } .signout { margin-top: auto; }
  main { flex: 1; min-width: 0; } header { min-height: 88px; padding: 22px 32px; box-sizing: border-box; border-bottom: 1px solid #eeecf1; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  h1 { font-size: 24px; line-height: 30px; margin: 0; font-weight: 600; } header p { margin: 4px 0 0; color: #7f7b87; font-size: 13px; }
  .content { padding: 28px 32px; } h2 { margin: 0 0 6px; font-size: 22px; font-weight: 600; } p { font-size: 14px; line-height: 1.5; }
  .public-card { display: flex; align-items: center; gap: 20px; padding: 24px; background: #faf9fc; border: 1px solid #ece9f0; border-radius: 10px; margin-bottom: 24px; }
  .public-card p { margin: 4px 0; color: #5c6470; } .avatar.large { width: 72px; height: 72px; font-size: 24px; } .badge { margin-left: auto; align-self: flex-start; padding: 5px 10px; color: #26815c; background: #eaf5ef; font-size: 12px; border-radius: 20px; } .badge.private { color: #625b6d; background: #ece9f0; }
  .fields { margin: 0; border: 1px solid #e8e5ec; border-radius: 10px; padding: 6px 20px; } .fields > div { display: grid; grid-template-columns: 160px minmax(0,1fr); gap: 24px; padding: 15px 0; border-bottom: 1px solid #eeecf1; } .fields > div:last-child { border: 0; } dt { font-size: 13px; color: #7f7b87; } dd { margin: 0; font-size: 14px; overflow-wrap: anywhere; }
  .edit-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; } label { display: grid; gap: 8px; min-width: 0; font-size: 13px; } .actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .section-title { font-size: 15px; margin-bottom: 16px; } .workspace-list { border: 1px solid #e8e5ec; border-radius: 10px; overflow: hidden; } .workspace { display: flex; width: 100%; gap: 14px; align-items: center; padding: 16px 20px; border-bottom: 1px solid #eeecf1; text-align: left; } .workspace:last-child { border: 0; } .workspace:hover { background: #faf7fb; } .workspace strong { flex: 1; } .workspace > span:not(.mark) { width: 90px; font-size: 13px; color: #5c6470; } .workspace small { width: 112px; } .mark { display: grid; place-items: center; flex-shrink: 0; width: 36px; height: 36px; border-radius: 8px; background: #efdcf2; color: #8c267d; font-size: 13px; }
  .invitations { border: 1px solid #e8e5ec; border-radius: 10px; padding: 20px; margin-top: 24px; } .invitation { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; } .invitation p { margin: 6px 0; font-size: 13px; color: #5c6470; } .copy-row { display: flex; gap: 10px; margin: 8px 0 16px; } .copy-row :global(.text-input) { min-width: 0; }
  .empty { display: grid; gap: 20px; justify-items: start; padding: 32px; border: 1px dashed #d9d4df; border-radius: 10px; } .error { color: #9e342a; background: #fff0ee; padding: 12px; border-radius: 6px; } .notice { color: #276246; background: #edf6f0; padding: 12px; border-radius: 6px; }
  @media (max-width: 760px) { .cabinet-page { padding: 20px 12px; } .brand { flex-wrap: wrap; } .cabinet { flex-direction: column; min-height: 0; } aside { width: 100%; border-radius: 12px 12px 0 0; padding: 18px; gap: 16px; } nav { grid-template-columns: 1fr 1fr; } .signout { display: none; } header { padding: 20px; flex-wrap: wrap; } .content { padding: 20px; } .public-card { padding: 18px; gap: 14px; flex-wrap: wrap; } .public-card h2 { font-size: 20px; } .badge { margin-left: 0; } .fields > div { grid-template-columns: 1fr; gap: 6px; } .edit-fields { grid-template-columns: 1fr; } .workspace { padding: 14px; flex-wrap: wrap; gap: 10px; } .workspace strong { min-width: 150px; } .workspace small { display: none; } .copy-row { flex-direction: column; } .invitations { padding: 16px; } }
</style>
