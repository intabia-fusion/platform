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

import { Client } from '@elastic/elasticsearch'
import { Class, Doc, MeasureMetricsContext, PersonId, Ref, Space, WorkspaceUuid } from '@hcengineering/core'
import { getMetadata, setMetadata } from '@hcengineering/platform'
import serverCore, { type FullTextAdapter, type IndexedDoc } from '@hcengineering/server-core'
import { elasticUrl } from '@hcengineering/test-containers'

import { createElasticAdapter } from '../adapter'

describe('Elastic Adapter', () => {
  let adapter: FullTextAdapter
  let url: string
  const ctx = new MeasureMetricsContext('-', {})
  const ws1 = 'ws1' as WorkspaceUuid

  // Starting the container is well past the 5s a hook gets by default.
  beforeAll(async () => {
    url = await elasticUrl()
  }, 300000)

  beforeEach(async () => {
    adapter = await createElasticAdapter(url)
  })

  afterEach(async () => {
    await adapter.close()
  })

  it('should init', () => {
    expect(adapter).toBeTruthy()
  })

  it('should create document', async () => {
    const doc: IndexedDoc = {
      id: 'doc1' as Ref<Doc>,
      _class: ['class1' as Ref<Class<Doc>>],
      modifiedBy: 'andrey' as PersonId,
      modifiedOn: 0,
      space: 'space1' as Ref<Space>,
      content0: 'hey there!'
    }
    await adapter.index(ctx, ws1, doc)
    const hits = await adapter.search(ctx, ws1, ['class1' as Ref<Class<Doc>>], {}, 1)
    console.log(hits)
  })

  it('should find document with raw search', async () => {
    const result = await adapter.searchString(
      ctx,
      ws1,
      {
        query: 'hey'
      },
      {}
    )
    console.log(result)
  })
})

// Here, not in its own file: each test file starts an Elastic container
describe('Elastic mapping upgrade', () => {
  const ctx = new MeasureMetricsContext('-', {})
  const template = 'mapping_template_test'
  const target = 'mapping_upgrade_test'
  let client: Client

  beforeAll(async () => {
    client = new Client({ node: await elasticUrl() })
  }, 300000)

  afterAll(async () => {
    // Elastic 8 refuses a wildcard delete
    const names = Object.keys(await client.indices.get({ index: [`${template}_*`, `${target}_*`] }))
    if (names.length > 0) {
      await client.indices.delete({ index: names })
    }
    await client.close()
  })

  it('adds a property missing from an existing index without dropping its documents', async () => {
    const indexName = getMetadata(serverCore.metadata.ElasticIndexName)
    try {
      // The current mapping and analyzers
      setMetadata(serverCore.metadata.ElasticIndexName, template)
      const templateAdapter = await createElasticAdapter(await elasticUrl())
      expect(await templateAdapter.initMapping(ctx)).toBe(true)
      await templateAdapter.close()

      const existing = await client.indices.get({ index: `${template}_*` })
      const [templateName, templateIndex] = Object.entries(existing)[0]
      const targetName = target + templateName.slice(template.length)

      // An index from before fulltextExtra
      const { fulltextExtra, ...properties } = templateIndex.mappings?.properties ?? {}
      expect(fulltextExtra).toBeDefined()
      await client.indices.create({
        index: targetName,
        settings: { analysis: templateIndex.settings?.index?.analysis },
        mappings: { properties }
      })
      await client.index({
        index: targetName,
        id: 'legacy',
        document: { id: 'legacy', fulltextSummary: 'indexed before the upgrade' },
        refresh: true
      })

      setMetadata(serverCore.metadata.ElasticIndexName, target)
      const adapter = await createElasticAdapter(await elasticUrl())
      expect(await adapter.initMapping(ctx)).toBe(true)
      await adapter.close()

      const { count } = await client.count({ index: targetName })
      expect(count).toBe(1)

      const mapping = await client.indices.getMapping({ index: targetName })
      expect(mapping[targetName].mappings.properties?.fulltextExtra).toMatchObject({
        type: 'text',
        analyzer: 'rebuilt_english'
      })
    } finally {
      setMetadata(serverCore.metadata.ElasticIndexName, indexName as string)
    }
  })
})
