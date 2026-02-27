//
// Copyright © 2022 Hardcore Engineering Inc.
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
//

import contact from '@hcengineering/contact'
import core, {
  concatLink,
  Doc,
  Tx,
  TxCreateDoc,
  TxCUD,
  TxProcessor,
  TxRemoveDoc,
  TxUpdateDoc
} from '@hcengineering/core'
import { getMetadata } from '@hcengineering/platform'
import recruit, { Applicant, recruitId, Vacancy } from '@hcengineering/recruit'
import serverCore, { TriggerControl } from '@hcengineering/server-core'
import { workbenchId } from '@hcengineering/workbench'

function getSequenceId (doc: Vacancy | Applicant, control: TriggerControl): string {
  const hierarchy = control.hierarchy
  let clazz = hierarchy.getClass(doc._class)
  let label = clazz.shortLabel
  while (label === undefined && clazz.extends !== undefined) {
    clazz = hierarchy.getClass(clazz.extends)
    label = clazz.shortLabel
  }

  return label !== undefined ? `${label}-${doc.number}` : doc.number.toString()
}

/**
 * @public
 */
export async function vacancyUrlPresenter (doc: Doc, control: TriggerControl): Promise<string> {
  const vacancy = doc as Vacancy
  const front = control.branding?.front ?? getMetadata(serverCore.metadata.FrontUrl) ?? ''
  const path = `${workbenchId}/${control.workspace.url}/${recruitId}/${getSequenceId(vacancy, control)}`
  return concatLink(front, path)
}

/**
 * @public
 */
export async function vacancyIdentifierPresenter (doc: Doc, control: TriggerControl): Promise<string> {
  const vacancy = doc as Vacancy
  return getSequenceId(vacancy, control)
}

/**
 * @public
 */
export async function applicationUrlPresenter (doc: Doc, control: TriggerControl): Promise<string> {
  const applicant = doc as Applicant

  const front = control.branding?.front ?? getMetadata(serverCore.metadata.FrontUrl) ?? ''
  const id = getSequenceId(applicant, control)
  const path = `${workbenchId}/${control.workspace.url}/${recruitId}/${id}`
  return concatLink(front, path)
}

export async function applicationIdentifierPresenter (doc: Doc, control: TriggerControl): Promise<string> {
  const applicant = doc as Applicant
  return getSequenceId(applicant, control)
}

/**
 * @public
 */
export async function OnRecruitUpdate (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const result: Tx[] = []
  for (const tx of txes) {
    const actualTx = tx as TxCUD<Doc>
    if (!control.hierarchy.isDerived(actualTx.objectClass, recruit.class.Vacancy)) {
      continue
    }

    if (actualTx._class === core.class.TxCreateDoc) {
      handleVacancyCreate(control, actualTx, result)
    } else if (actualTx._class === core.class.TxUpdateDoc) {
      await handleVacancyUpdate(control, actualTx, result)
    } else if (actualTx._class === core.class.TxRemoveDoc) {
      handleVacancyRemove(control, actualTx, result)
    }
  }
  return result
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default async () => ({
  function: {
    VacancyUrlPresenter: vacancyUrlPresenter,
    VacancyIdentifierPresenter: vacancyIdentifierPresenter,
    ApplicationUrlPresenter: applicationUrlPresenter,
    ApplicationIdentifierPresenter: applicationIdentifierPresenter,
    LinkIdProvider: getSequenceId
  },
  trigger: {
    OnRecruitUpdate
  }
})
async function handleVacancyUpdate (control: TriggerControl, cud: TxCUD<Doc>, res: Tx[]): Promise<void> {
  const updateTx = cud as TxUpdateDoc<Vacancy>
  if (updateTx.operations.company !== undefined) {
    // It could be null or new value
    const txes = (
      await control.findAll(control.ctx, core.class.TxCUD, {
        objectId: updateTx.objectId
      })
    ).filter((it) => it._id !== updateTx._id)
    const vacancy = TxProcessor.buildDoc2Doc<Vacancy>(txes)
    if (vacancy?.company != null) {
      // We have old value
      res.push(
        control.txFactory.createTxMixin(
          vacancy.company,
          contact.class.Organization,
          contact.space.Contacts,
          recruit.mixin.VacancyList,
          {
            $inc: { vacancies: -1 }
          }
        )
      )
    }
    if (updateTx.operations.company !== null) {
      res.push(
        control.txFactory.createTxMixin(
          updateTx.operations.company,
          contact.class.Organization,
          contact.space.Contacts,
          recruit.mixin.VacancyList,
          {
            $inc: { vacancies: 1 }
          }
        )
      )
    }
  }
}

function handleVacancyRemove (control: TriggerControl, cud: TxCUD<Doc>, res: Tx[]): void {
  const removeTx = cud as TxRemoveDoc<Vacancy>
  // It could be null or new value
  const vacancy = control.removedMap.get(removeTx.objectId) as Vacancy
  if (vacancy === undefined) {
    return
  }
  if (vacancy.company != null) {
    // We have old value
    res.push(
      control.txFactory.createTxMixin(
        vacancy.company,
        contact.class.Organization,
        contact.space.Contacts,
        recruit.mixin.VacancyList,
        {
          $inc: { vacancies: -1 }
        }
      )
    )
  }
}

function handleVacancyCreate (control: TriggerControl, cud: TxCUD<Doc>, res: Tx[]): void {
  const createTx = cud as TxCreateDoc<Vacancy>
  const vacancy = TxProcessor.createDoc2Doc(createTx)
  if (vacancy.company !== undefined) {
    res.push(
      control.txFactory.createTxMixin(
        vacancy.company,
        contact.class.Organization,
        contact.space.Contacts,
        recruit.mixin.VacancyList,
        {
          $inc: { vacancies: 1 }
        }
      )
    )
  }
}
