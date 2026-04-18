import type { Builder } from '@intabiafusion/model'
import core from '@intabiafusion/core'
import document from '@intabiafusion/document'

export function definePermissions (builder: Builder): void {
  builder.createDoc(
    core.class.Permission,
    core.space.Model,
    {
      label: document.string.ForbidCreateTeamspacePermission,
      scope: 'workspace',
      txClass: core.class.TxCreateDoc,
      objectClass: document.class.Teamspace,
      forbid: true,
      description: document.string.ForbidCreateTeamspacePermissionDescription
    },
    document.permission.ForbidCreateTeamspace
  )
}
