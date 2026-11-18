//
// Copyright © 2026 Intabia Fusion.
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

import type { Ref } from '@hcengineering/core'
import type { Folder } from '@hcengineering/drive'

import { folderPathRefs } from '../folderPath'

const rootFolder = 'folder:root' as Ref<Folder>
const parentFolder = 'folder:parent' as Ref<Folder>
const childFolder = 'folder:child' as Ref<Folder>

describe('folderPathRefs', () => {
  it('turns the stored nearest-first path into a root-first breadcrumb', () => {
    // A file in A/B stores [B, A]; the breadcrumb has to read A/B
    expect(folderPathRefs([childFolder, parentFolder, rootFolder])).toEqual([
      rootFolder,
      parentFolder,
      childFolder
    ])
  })

  it('does not mutate the stored path', () => {
    const stored = [childFolder, parentFolder]
    folderPathRefs(stored)
    expect(stored).toEqual([childFolder, parentFolder])
  })

  it('keeps a single parent ref as is', () => {
    expect(folderPathRefs(parentFolder)).toEqual([parentFolder])
  })

  it('renders nothing for an absent value', () => {
    expect(folderPathRefs(undefined)).toEqual([])
  })
})
