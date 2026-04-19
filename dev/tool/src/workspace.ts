//
// Copyright © 2020, 2021 Anticrm Platform Contributors.
// Copyright © 2021 Hardcore Engineering Inc.
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

import {
  type BackupClient,
  type Class,
  type Client as CoreClient,
  type Doc,
  type Ref,
  type WorkspaceUuid
} from '@hcengineering/core'
import { connect } from '@hcengineering/server-tool'

function setByPath (obj: Record<string, any>, path: string[], value: any): Record<string, any> {
  let current = obj
  for (let i = 0; i < path.length - 1; i++) {
    current = current[path[i]] = current[path[i]] ?? {}
  }
  current[path[path.length - 1]] = value
  return obj
}

export async function updateField (
  workspaceId: WorkspaceUuid,
  transactorUrl: string,
  cmd: { objectId: string, objectClass: string, type: string, attribute: string, value: string, domain: string }
): Promise<void> {
  const connection = (await connect(transactorUrl, workspaceId, undefined, {
    mode: 'backup'
  })) as unknown as CoreClient & BackupClient

  try {
    const doc = await connection.findOne(cmd.objectClass as Ref<Class<Doc>>, { _id: cmd.objectId as Ref<Doc> })
    if (doc === undefined) {
      console.error('Document not found')
      process.exit(1)
    }
    let valueToPut: string | number | boolean = cmd.value
    if (cmd.type === 'number') valueToPut = parseFloat(valueToPut)
    if (cmd.type === 'boolean') valueToPut = cmd.value === 'true'
    setByPath(doc, cmd.attribute.split('.'), valueToPut)

    await connection.upload(connection.getHierarchy().getDomain(doc?._class), [doc])
  } finally {
    await connection.close()
  }
}
