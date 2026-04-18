import type { Builder } from '@intabiafusion/model'
import core from '@intabiafusion/core'
import lead from '@intabiafusion/lead'

export function definePermissions (builder: Builder): void {
  builder.createDoc(
    core.class.Permission,
    core.space.Model,
    {
      label: lead.string.ForbidCreateFunnelPermission,
      scope: 'workspace',
      txClass: core.class.TxCreateDoc,
      objectClass: lead.class.Funnel,
      forbid: true,
      description: lead.string.ForbidCreateFunnelPermissionDescription
    },
    lead.permission.ForbidCreateFunnel
  )
}
