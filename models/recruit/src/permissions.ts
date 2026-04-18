import type { Builder } from '@intabiafusion/model'
import core from '@intabiafusion/core'
import recruit from '@intabiafusion/recruit'

export function definePermissions (builder: Builder): void {
  builder.createDoc(
    core.class.Permission,
    core.space.Model,
    {
      label: recruit.string.ForbidCreateVacancyPermission,
      scope: 'workspace',
      txClass: core.class.TxCreateDoc,
      objectClass: recruit.class.Vacancy,
      forbid: true,
      description: recruit.string.ForbidCreateVacancyPermissionDescription
    },
    recruit.permission.ForbidCreateVacancy
  )
}
