/* eslint-disable @typescript-eslint/unbound-method */
import core, {
  type Blob,
  generateId,
  MeasureMetricsContext,
  TxOperations,
  type Doc,
  type MeasureContext,
  type PersonUuid,
  type Ref,
  type Tx,
  type WorkspaceDataId,
  type WorkspaceInfoWithStatus,
  type WorkspaceUuid
} from '@hcengineering/core'
import { WorkspaceManager } from '../manager'

import { createPlatformQueue, parseQueueConfig } from '@hcengineering/kafka'
import {
  createDummyStorageAdapter,
  QueueTopic,
  workspaceEvents,
  wrapPipeline,
  type FulltextListener,
  type IndexedDoc,
  type QueueWorkspaceMessage,
  type StorageAdapter
} from '@hcengineering/server-core'
import { decodeToken, generateToken } from '@hcengineering/server-token'
import { randomUUID } from 'crypto'
import { createDoc, test, type TestDocument } from './minmodel'

import { dbConfig, dbUrl, elasticIndexName, kafkaBroker, model, prepare, preparePipeline, startServices } from './utils'

prepare()
jest.mock('franc-min', () => ({ franc: () => 'en' }), { virtual: true })

jest.setTimeout(30000)

class TestWorkspaceManager extends WorkspaceManager {
  public async getWorkspaceInfo (ctx: MeasureContext, token?: string): Promise<WorkspaceInfoWithStatus | undefined> {
    const decodedToken = decodeToken(token ?? '')
    return {
      uuid: decodedToken.workspace,
      url: decodedToken.workspace,
      region: 'test',
      name: 'test',
      dataId: decodedToken.workspace as unknown as WorkspaceDataId,
      mode: 'active',
      processingProgress: 0,
      processingAttemps: 0,
      backupInfo: {
        dataSize: 0,
        blobsSize: 0,
        backupSize: 0,
        lastBackup: 0,
        backups: 0
      },
      versionMajor: 0,
      versionMinor: 6,
      versionPatch: 0,
      lastVisit: 0,
      createdOn: 0,
      createdBy: decodedToken.account
    }
  }

  async getTransactorAPIEndpoint (token: string): Promise<string | undefined> {
    return undefined
  }
}
/** The dummy storage serving `blobs`. */
function blobStorage (blobs: Map<string, { contentType: string, content: string }>): StorageAdapter {
  const storage = createDummyStorageAdapter()
  storage.stat = async (ctx, wsIds, name) => {
    const blob = blobs.get(name)
    if (blob === undefined) return undefined
    return {
      _id: name as Ref<Blob>,
      _class: core.class.Blob,
      space: core.space.Configuration,
      modifiedBy: core.account.System,
      modifiedOn: 0,
      provider: '',
      contentType: blob.contentType,
      etag: name,
      version: null,
      size: blob.content.length
    }
  }
  storage.read = async (ctx, wsIds, name) => {
    const blob = blobs.get(name)
    if (blob === undefined) throw new Error(`no blob ${name}`)
    return [Buffer.from(blob.content)]
  }
  return storage
}

class TestQueue {
  genId = generateId()
  blobs = new Map<string, { contentType: string, content: string }>()
  config = parseQueueConfig(`${kafkaBroker};-testing-` + this.genId, 'fulltext-test-' + this.genId, '')
  fulltextListener: FulltextListener | undefined
  queue = createPlatformQueue(this.config)
  mgr!: TestWorkspaceManager
  constructor (readonly ctx: MeasureContext) {}
  async start (): Promise<void> {
    await this.queue.createTopics(1)

    this.mgr = new TestWorkspaceManager(this.ctx, model, {
      queue: this.queue,
      accountsUrl: 'http://localhost:3003',
      elasticIndexName,
      serverSecret: 'secret',
      dbURL: dbUrl,
      hulylakeUrl: 'http://localhost:8096',
      config: dbConfig,
      externalStorage: blobStorage(this.blobs),
      listener: {
        onIndexing: async (doc: IndexedDoc) => {
          return await this.fulltextListener?.onIndexing?.(doc)
        },
        onClean: async (doc: Ref<Doc>[]) => {
          return await this.fulltextListener?.onClean?.(doc)
        }
      }
    })
    await this.mgr.startIndexer()
    await this.mgr.waitConsumersReady()
  }

  async close (): Promise<void> {
    await this.mgr.shutdown(true)
    // Each harness creates its own postfixed topics. Redpanda in tests caps total partitions, so
    // leftovers from previous runs eventually block topic creation and starve the consumer.
    await this.queue.deleteTopics()
    await this.queue.shutdown()
  }

  async expectIndexingDoc (pattern: string, op: () => Promise<void>, timeoutMs: number = 10000): Promise<IndexedDoc> {
    const waitPromise = new Promise<IndexedDoc>((resolve, reject) => {
      const to = setTimeout(() => {
        reject(new Error(`Timeout waiting for document with pattern "${pattern}" to be indexed`))
      }, timeoutMs)
      this.fulltextListener = {
        onIndexing: async (doc) => {
          if ((doc.fulltextSummary ?? '').includes(pattern) || (doc.fulltextExtra ?? '').includes(pattern)) {
            clearTimeout(to)
            resolve(doc)
          }
        }
      }
    })

    await op()
    return await waitPromise
  }
}

describe('full-text-indexing', () => {
  const toolCtx = new MeasureMetricsContext('tool', {})

  // One queue for the whole file: start/close costs ~15s of kafka group join and disconnect,
  // while every test is already isolated by its own random workspace.
  let queue: TestQueue

  // Containers plus the first kafka group join do not fit the file's 30s budget.
  beforeAll(async () => {
    await startServices()
    queue = new TestQueue(toolCtx)
    await queue.start()
  }, 300000)

  afterAll(async () => {
    await queue.close()
  })

  it('check-file-indexing', async () => {
    const txProducer = queue.queue.getProducer<Tx>(toolCtx, QueueTopic.Tx)
    const personId = randomUUID().toString() as PersonUuid
    const wsId: WorkspaceUuid = randomUUID().toString() as WorkspaceUuid
    const token = generateToken(personId, wsId)
    const indexer = await queue.mgr.withIndexer(toolCtx, wsId, token, true, async () => {})
    expect(indexer).toBeDefined()

    const dataId = generateId()

    await queue.expectIndexingDoc(dataId, async () => {
      await txProducer.send(toolCtx, wsId, [
        createDoc(test.class.TestDocument, {
          title: 'first doc',
          description: dataId
        })
      ])
    })
  })

  it('indexes the contentField text into fulltextSummary and the rest into fulltextExtra', async () => {
    const txProducer = queue.queue.getProducer<Tx>(toolCtx, QueueTopic.Tx)
    const personId = randomUUID().toString() as PersonUuid
    const wsId: WorkspaceUuid = randomUUID().toString() as WorkspaceUuid
    const token = generateToken(personId, wsId)
    await queue.mgr.withIndexer(toolCtx, wsId, token, true, async () => {})

    const titleId = generateId()
    const descriptionId = generateId()
    const bodyId = generateId()
    const fileId = generateId()

    // A collaborative document and a text file
    const body = generateId()
    queue.blobs.set(body, {
      contentType: 'application/json',
      content: JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: bodyId }] }]
      })
    })
    const file = generateId()
    queue.blobs.set(file, { contentType: 'text/plain', content: fileId })

    const doc = await queue.expectIndexingDoc(descriptionId, async () => {
      await txProducer.send(toolCtx, wsId, [
        createDoc(test.class.TestDocument, {
          title: titleId,
          description: descriptionId,
          body: body as Ref<Blob>,
          file: file as Ref<Blob>
        })
      ])
    })
    expect(doc.fulltextSummary).toContain(descriptionId)
    for (const id of [titleId, bodyId, fileId]) {
      expect(doc.fulltextSummary).not.toContain(id)
      expect(doc.fulltextExtra).toContain(id)
    }
    expect(doc.fulltextExtra).not.toContain(descriptionId)
  })

  it('indexes all text of a class without contentField into fulltextExtra', async () => {
    const txProducer = queue.queue.getProducer<Tx>(toolCtx, QueueTopic.Tx)
    const personId = randomUUID().toString() as PersonUuid
    const wsId: WorkspaceUuid = randomUUID().toString() as WorkspaceUuid
    const token = generateToken(personId, wsId)
    await queue.mgr.withIndexer(toolCtx, wsId, token, true, async () => {})

    const textId = generateId()

    const doc = await queue.expectIndexingDoc(textId, async () => {
      await txProducer.send(toolCtx, wsId, [createDoc(test.class.TestNote, { text: textId })])
    })
    expect(doc.fulltextExtra).toContain(textId)
    expect(doc.fulltextSummary).toBe('')
  })

  it('check-full-pipeline', async () => {
    const { pipeline, wsIds } = await preparePipeline(toolCtx, queue.queue)

    try {
      const pipelineClient = wrapPipeline(toolCtx, pipeline, wsIds, true)

      const dataId = generateId()

      const ops = new TxOperations(pipelineClient, core.account.System)

      let id: Ref<TestDocument>
      await queue.expectIndexingDoc(dataId, async () => {
        id = await ops.createDoc(test.class.TestDocument, core.space.Workspace, {
          title: 'first doc',
          description: dataId
        })
      })

      const newData = generateId()
      await queue.expectIndexingDoc(newData, async () => {
        await ops.updateDoc<TestDocument>(test.class.TestDocument, core.space.Workspace, id, {
          description: newData
        })
      })
    } finally {
      await pipeline.close()
    }
  })
  it('test-reindex', async () => {
    const { pipeline, wsIds } = await preparePipeline(toolCtx, queue.queue, false) // Do not use broadcast
    const wsProcessor = queue.queue.getProducer<QueueWorkspaceMessage>(toolCtx, QueueTopic.Workspace)
    try {
      const pipelineClient = wrapPipeline(toolCtx, pipeline, wsIds)

      const dataId = generateId()

      const ops = new TxOperations(pipelineClient, core.account.System)

      for (let i = 0; i < 1000; i++) {
        await ops.createDoc(test.class.TestDocument, core.space.Workspace, {
          title: 'first doc:' + i,
          description: dataId + i
        })
      }
      let indexOps = 0
      const reindexAllP = new Promise<void>((resolve) => {
        queue.fulltextListener = {
          onIndexing: async (doc) => {
            indexOps++
            if (indexOps === 1000) {
              resolve()
            }
          }
        }
      })

      await wsProcessor.send(toolCtx, wsIds.uuid, [workspaceEvents.fullReindex()])

      // Wait for reindex
      await reindexAllP
    } finally {
      await wsProcessor.close()
      await pipeline.close()
    }
  }, 180000)
})
