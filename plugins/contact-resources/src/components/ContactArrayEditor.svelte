<script lang="ts">
  import { Contact } from '@intabiafusion/contact'
  import { ArrOf, Doc, Ref, RefTo } from '@intabiafusion/core'
  import { IntlString } from '@intabiafusion/platform'
  import { ButtonKind } from '@intabiafusion/ui'
  import ContactList from './ContactList.svelte'

  export let label: IntlString
  export let value: Ref<Contact>[]
  export let type: ArrOf<RefTo<Doc>> | undefined
  export let onChange: (refs: Ref<Contact>[]) => void
  export let readonly = false
  export let kind: ButtonKind = 'link'

  $: _clazz = (type?.of as RefTo<Doc>)?.to
  let timer: any

  function onUpdate (evt: CustomEvent<Ref<Contact>[]>): void {
    clearTimeout(timer)
    timer = setTimeout(() => {
      onChange(evt.detail)
    }, 500)
  }
</script>

<ContactList
  items={value}
  {label}
  _class={_clazz}
  on:update={onUpdate}
  {kind}
  size={'medium'}
  justify={'left'}
  width={kind === 'list' ? undefined : '100%'}
  {readonly}
/>
