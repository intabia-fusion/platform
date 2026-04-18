<script lang="ts">
  import contact from '@intabiafusion/contact'
  import { Class, Doc, Ref } from '@intabiafusion/core'
  import { getClient } from '@intabiafusion/presentation'
  import { CreateRelation } from '@intabiafusion/setting-resources'
  import card from '../../plugin'
  import { MasterTag } from '@intabiafusion/card'

  export let aClass: Ref<Class<Doc>> | undefined = undefined

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const _classes = [...hierarchy.getDescendants(card.class.Card), contact.class.Contact].filter((c) => {
    if (c === card.class.Card) return false
    const cl = hierarchy.getClass(c)
    if (cl._class !== card.class.MasterTag) return true
    if ((cl as MasterTag).removed === true) return false
    return true
  })
</script>

<CreateRelation {aClass} {_classes} exclude={[]} on:close />
