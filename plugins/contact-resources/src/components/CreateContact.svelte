<script lang="ts">
  import { Doc, Ref } from '@intabiafusion/core'
  import { Asset, getResource } from '@intabiafusion/platform'
  import { getClient } from '@intabiafusion/presentation'
  import { Action, closePopup, Menu, showPopup } from '@intabiafusion/ui'
  import view from '@intabiafusion/view'
  import contact from '../plugin'

  const client = getClient()

  const actions: Action[] = []
  const hierarchy = client.getHierarchy()

  client
    .getHierarchy()
    .getDescendants(contact.class.Contact)
    .map(async (v) => {
      const cl = hierarchy.getClass(v)
      if (hierarchy.hasMixin(cl, view.mixin.ObjectFactory)) {
        const { component, create } = hierarchy.as(cl, view.mixin.ObjectFactory)

        if (component) {
          actions.push({
            icon: cl.icon as Asset,
            label: cl.label,
            action: async () => {
              closePopup()
              showPopup(component, { shouldSaveDraft: true }, 'top')
            }
          })
        } else if (create) {
          const action = await getResource(create)
          actions.push({
            icon: cl.icon as Asset,
            label: cl.label,
            action: async () => {
              await action()
            }
          })
        }
      }
    })
</script>

<Menu {actions} on:changeContent />
