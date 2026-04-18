<script lang="ts">
  import { getClient } from '@intabiafusion/presentation'
  import { RelationSetting } from '@intabiafusion/setting-resources'
  import contact from '@intabiafusion/contact'
  import card from '../../plugin'
  import { Analytics } from '@intabiafusion/analytics'
  import { CardEvents, MasterTag } from '@intabiafusion/card'

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const _classes = [...hierarchy.getDescendants(card.class.Card), contact.class.Contact].filter((c) => {
    if (c === card.class.Card) return false
    const cl = hierarchy.getClass(c)
    if (cl._class !== card.class.MasterTag) return true
    if ((cl as MasterTag).removed === true) return false
    return true
  })

  function createHandler (): void {
    Analytics.handleEvent(CardEvents.RelationCreated)
  }
</script>

<RelationSetting {_classes} exclude={[]} on:create={createHandler} />
