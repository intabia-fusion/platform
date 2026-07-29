//
// Copyright © 2026 TraceX SAS.
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

import type { Class, Client, Doc, Hierarchy, Ref } from '@hcengineering/core'
import { MarkupNodeType, type MarkupNode } from '@hcengineering/text'
import { markdownToMarkup } from '@hcengineering/text-markdown'
import type { AttributeModel } from '@hcengineering/view'
import type { CopyRelationshipTableAsMarkdownProps, RelationshipCellModel } from '../types'
import { buildRelationshipTableMarkdown } from '../markdown/tableBuilder'

jest.mock('../formatter', () => ({
  formatValue: jest.fn(
    async (_attribute: AttributeModel, doc: Doc): Promise<string> =>
      (doc as Doc & { title?: string }).title ?? String(doc._id)
  )
}))

jest.mock('../model', () => ({
  generateHeaders: jest.fn(
    async (model: AttributeModel[]): Promise<string[]> => model.map((attribute) => String(attribute.label))
  )
}))

jest.mock('../data', () => ({
  isRelationshipTable: jest.fn(),
  rebuildRelationshipTableViewModel: jest.fn()
}))

jest.mock('../markdown/link', () => ({
  createMarkdownLink: jest.fn(async (_hierarchy: Hierarchy, doc: Doc, value: string): Promise<string> => {
    return `[${value}](https://example.com/${String(doc._id)})`
  })
}))

jest.mock('@hcengineering/view-resources', () => ({
  buildConfigAssociation: jest.fn(),
  buildConfigLookup: jest.fn(),
  buildModel: jest.fn(),
  getAttributeValue: jest.fn()
}))

jest.mock('@hcengineering/theme', () => ({
  getCurrentLanguage: jest.fn(() => 'en')
}))

function createDoc (id: string, title: string): Doc {
  return {
    _id: id as Ref<Doc>,
    _class: 'test:class:Doc' as Ref<Class<Doc>>,
    title
  } as unknown as Doc
}

function createAttribute (key: string, label: string): AttributeModel {
  return {
    key,
    label
  } as unknown as AttributeModel
}

function createCell (attribute: AttributeModel, rowSpan: number, object: Doc | undefined): RelationshipCellModel {
  return {
    attribute,
    rowSpan,
    object,
    parentObject: undefined
  }
}

function getTable (markup: MarkupNode): MarkupNode {
  const table = markup.content?.find((node) => node.type === MarkupNodeType.table)
  expect(table).toBeDefined()
  return table as MarkupNode
}

describe('buildRelationshipTableMarkdown', () => {
  const hierarchy: Hierarchy = {} as any
  const client: Client = {} as any
  const cardClass = 'test:class:Doc' as Ref<Class<Doc>>

  it('preserves row spans through the markdown round trip', async () => {
    const requirementAttribute = createAttribute('', 'Requirement')
    const testAttribute = createAttribute('$associations.tests_b', 'Test case')
    const requirement = createDoc('req-1', 'REQ-1')
    const firstTest = createDoc('test-1', 'First test')
    const secondTest = createDoc('test-2', 'Second test')

    const props: CopyRelationshipTableAsMarkdownProps = {
      viewModel: [
        {
          cells: [createCell(requirementAttribute, 2, requirement), createCell(testAttribute, 1, firstTest)]
        },
        {
          cells: [createCell(testAttribute, 1, secondTest)]
        }
      ],
      model: [requirementAttribute, testAttribute],
      objects: [requirement],
      cardClass
    }

    const markdown = await buildRelationshipTableMarkdown(props, hierarchy, 'en', client)
    const table = getTable(markdownToMarkup(markdown))
    const rows = table.content ?? []

    expect(markdown).toContain('<td rowspan="2">')
    expect(markdown).toContain('<a href="https://example.com/req-1">REQ-1</a>')
    expect(rows).toHaveLength(3)
    expect(rows[1].content).toHaveLength(2)
    expect(rows[1].content?.[0].attrs?.rowspan).toBe(2)
    expect(rows[2].content).toHaveLength(1)
  })

  it('keeps empty cells and inline markdown content valid', async () => {
    const requirementAttribute = createAttribute('', 'Requirement')
    const testAttribute = createAttribute('description', 'Description')
    const requirement = createDoc('req-1', 'REQ-1')
    const test = createDoc('test-1', 'First | test\ncontinued')

    const props: CopyRelationshipTableAsMarkdownProps = {
      viewModel: [
        {
          cells: [createCell(requirementAttribute, 1, requirement), createCell(testAttribute, 1, test)]
        },
        {
          cells: [createCell(requirementAttribute, 1, undefined), createCell(testAttribute, 1, undefined)]
        }
      ],
      model: [requirementAttribute, testAttribute],
      objects: [requirement],
      cardClass
    }

    const markdown = await buildRelationshipTableMarkdown(props, hierarchy, 'en', client)
    const table = getTable(markdownToMarkup(markdown))
    const rows = table.content ?? []

    // No merged cells: a plain pipe table, the escaped pipe stays inside the cell
    expect(markdown.startsWith('| Requirement | Description |')).toBe(true)
    expect(JSON.stringify(rows[1])).toContain('First | test')
    expect(rows).toHaveLength(3)
    expect(rows[2].content).toHaveLength(2)
    expect(rows[2].content?.every((cell) => cell.content?.[0].type === MarkupNodeType.paragraph)).toBe(true)
  })
})
