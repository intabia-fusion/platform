import type { Builder } from '@intabiafusion/model'
import core from '@intabiafusion/core'
import tracker from '@intabiafusion/tracker'

export function definePermissions (builder: Builder): void {
  builder.createDoc(
    core.class.Permission,
    core.space.Model,
    {
      label: tracker.string.ForbidCreateProjectPermission,
      txClass: core.class.TxCreateDoc,
      objectClass: tracker.class.Project,
      forbid: true,
      scope: 'workspace',
      description: tracker.string.ForbidCreateProjectPermissionDescription
    },
    tracker.permission.ForbidCreateProject
  )
}
