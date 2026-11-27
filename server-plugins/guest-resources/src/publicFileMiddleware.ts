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

import { Buffer } from 'buffer'
import core, {
  TxProcessor,
  TxFactory,
  generateId,
  toFindResult,
  type Class,
  type Doc,
  type MeasureContext,
  type Ref,
  type SessionData,
  type Tx,
  type TxCUD,
  type TxUpdateDoc,
  type AttachedDoc,
  type DocumentQuery,
  type Domain,
  type FindOptions,
  type Space
} from '@hcengineering/core'
import guest, { getPublicLinkSpace, type PublicLink, type PublicFileSyncJob } from '@hcengineering/guest'
import { PublicFileAccessClient } from '@hcengineering/datalake'
import {
  BaseMiddleware,
  type Middleware,
  type MiddlewareCreator,
  type PipelineContext,
  type TxMiddlewareResult
} from '@hcengineering/server-core'
import { generateToken } from '@hcengineering/server-token'
import { systemAccountUuid } from '@hcengineering/core'
import { collectPublicFiles } from './publicFiles'
import { PublicFileSync } from './publicFileSync'

/** Enabled by the pipeline when the primary STORAGE_CONFIG backend is Datalake. */
export class PublicFileMiddleware extends BaseMiddleware {
  private readonly client: PublicFileAccessClient
  private readonly syncer: PublicFileSync
  private tail: Promise<void> = Promise.resolve()
  private readonly owner = Symbol('public-file-write')

  constructor (
    ctx: MeasureContext,
    context: PipelineContext,
    next: Middleware | undefined,
    endpoint: string,
    startWorker: boolean = true
  ) {
    super(context, next)
    this.client = new PublicFileAccessClient(
      endpoint,
      generateToken(systemAccountUuid, undefined, { service: 'public-file-access' })
    )
    this.syncer = new PublicFileSync(
      context.workspace.uuid,
      this.client,
      {
        // Reserve a turn for the indexed read. Sustained writes can queue
        // behind it, and network work in Datalake runs after releasing the turn.
        pending: async () =>
          await this.withWriteTurn(
            async () =>
              await this.workStorage.rawFindAll<PublicFileSyncJob>(
                this.workDomain,
                { _class: guest.class.PublicFileSyncJob, readyAt: { $lte: Date.now() } },
                { limit: 10, sort: { readyAt: 1, _id: 1 } }
              )
          ),
        finish: async (id, generation, retryAt) => {
          const filter = { _id: id, generation }
          if (retryAt === undefined) await this.workStorage.rawDeleteMany<PublicFileSyncJob>(this.workDomain, filter)
          else await this.workStorage.rawUpdate<PublicFileSyncJob>(this.workDomain, filter, { readyAt: retryAt })
        },
        files: async (id) => await this.sourceFiles(ctx, id)
      },
      (err) => {
        ctx.error('public-file synchronization failed', { error: err instanceof Error ? err.message : 'unknown' })
      }
    )
    if (startWorker) this.syncer.start()
  }

  /** A restore writes documents directly. Reconcile only the restored workspace before publishing Restored. */
  static async reconcileAfterRestore (ctx: MeasureContext, context: PipelineContext, endpoint: string): Promise<void> {
    if (!context.hierarchy.hasClass(guest.class.PublicLink)) return
    const middleware = new PublicFileMiddleware(ctx, context, undefined, endpoint, false)
    const pageSize = 10
    let after = ''
    while (true) {
      const links = await middleware.find(guest.class.PublicLink, { _id: { $gt: after } } as any, {
        limit: pageSize,
        sort: { _id: 1 }
      })
      for (const link of links) {
        const canResolve = link.attachedToClass !== undefined && context.hierarchy.hasClass(link.attachedToClass)
        const revoked = canResolve
          ? await middleware.syncer.sync(link._id)
          : (await middleware.client.state(context.workspace.uuid, link._id)).revoked
        if (revoked) {
          // The restore is offline. Drop the restored source before the same token can open the document again.
          await middleware.workStorage.rawDeleteMany<PublicLink>(context.hierarchy.getDomain(guest.class.PublicLink), {
            _id: link._id
          })
        }
      }
      if (links.length < pageSize) break
      after = links[links.length - 1]._id
    }
    after = ''
    while (true) {
      // Include registered ids absent from the restored PublicLink domain.
      const ids = await middleware.client.activeLinks(context.workspace.uuid, after)
      for (const id of ids) {
        const [link] = await middleware.find(guest.class.PublicLink, { _id: id as Ref<PublicLink> })
        if (link === undefined) {
          await middleware.syncer.sync(id)
        } else if (link.attachedToClass === undefined || !context.hierarchy.hasClass(link.attachedToClass)) {
          // Older backups can contain links that the workspace upgrade will
          // file into the correct space. Close access until then and keep the id.
          const state = await middleware.client.state(context.workspace.uuid, id)
          if (!state.revoked && state.blobs.length > 0) {
            await middleware.client.replace(context.workspace.uuid, id, state.revision + 1, [])
          }
        }
      }
      if (ids.length < pageSize) break
      after = ids[ids.length - 1]
    }
  }

  private async sourceDocument (link: PublicLink | undefined): Promise<Doc | undefined> {
    const h = this.context.hierarchy
    if (link?.attachedToClass === undefined || !h.hasClass(link.attachedToClass)) return undefined
    const [doc] = await this.find(link.attachedToClass, { _id: link.attachedTo })
    return doc !== undefined && getPublicLinkSpace(h, doc) === link.space ? doc : undefined
  }

  private async sourceFiles (ctx: MeasureContext, id: string): Promise<string[] | undefined> {
    const context = this.context
    const [link] = await this.find(guest.class.PublicLink, { _id: id as Ref<PublicLink> })
    const doc = await this.sourceDocument(link)
    if (doc === undefined) return undefined
    return await collectPublicFiles(
      {
        getHierarchy: () => context.hierarchy,
        findAll: async <T extends Doc>(clazz: Ref<Class<T>>, query: DocumentQuery<T>) =>
          toFindResult(await this.find(clazz, query))
      },
      doc,
      async (snapshot) => {
        if (context.storageAdapter === undefined) throw new Error('Missing storage adapter')
        return Buffer.concat(await context.storageAdapter.read(ctx, context.workspace, snapshot)).toString()
      }
    )
  }

  static create (endpoint: string): MiddlewareCreator {
    return async (ctx, context, next) => {
      if (!context.hierarchy.hasClass(guest.class.PublicFileSyncJob)) {
        if (next === undefined) throw new Error('Missing middleware after public file synchronization')
        return next
      }
      return new PublicFileMiddleware(ctx, context, next, endpoint)
    }
  }

  private get workStorage (): NonNullable<PipelineContext['lowLevelStorage']> {
    if (this.context.lowLevelStorage === undefined) throw new Error('Missing low-level storage')
    return this.context.lowLevelStorage
  }

  private get workDomain (): Domain {
    return this.context.hierarchy.getDomain(guest.class.PublicFileSyncJob)
  }

  private async queueLinks (ctx: MeasureContext, ids: Set<string>, readyAt: number): Promise<string | undefined> {
    if (ids.size === 0) return undefined
    const generation = generateId()
    const jobs: PublicFileSyncJob[] = [...ids].map((id) => ({
      _id: id as Ref<PublicFileSyncJob>,
      _class: guest.class.PublicFileSyncJob,
      space: core.space.Configuration,
      modifiedOn: Date.now(),
      readyAt,
      modifiedBy: core.account.System,
      generation
    }))
    await this.workStorage.upload(ctx, this.workDomain, jobs)
    return generation
  }

  private async find<T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ): Promise<T[]> {
    const h = this.context.hierarchy
    const filter = h.isMixin(_class) ? { [_class]: { $exists: true } } : { _class: { $in: h.getDescendants(_class) } }
    const scoped: DocumentQuery<T> = { ...query, ...filter }
    return await this.workStorage.rawFindAll(h.getDomain(_class), scoped, options)
  }

  private async affected (txes: Tx[]): Promise<Set<string>> {
    const ids = new Set<string>()
    for (const outer of txes) {
      const tx = outer as TxCUD<Doc>
      if (!TxProcessor.isExtendsCUD(tx._class)) continue
      if (tx.objectClass === guest.class.PublicLink) ids.add(tx.objectId)
      const h = this.context.hierarchy
      const refs = new Set([tx.objectId])
      if (this.context.lowLevelStorage === undefined) throw new Error('Missing low-level storage')
      // Inspect the stored class; objectClass may name a base/sibling class in the same domain.
      const [stored] = await this.context.lowLevelStorage.rawFindAll<Doc>(h.getDomain(tx.objectClass), {
        _id: tx.objectId
      })
      const actual = stored?._class ?? tx.objectClass
      const carriesFiles = [...h.getAllAttributes(actual)].some(
        ([, attr]) =>
          attr.type._class === core.class.TypeBlob ||
          (attr.type._class === core.class.RefTo && (attr.type as any).to === core.class.Blob)
      )
      if (carriesFiles && h.isDerived(actual, core.class.AttachedDoc)) {
        if (stored !== undefined) {
          const child = stored as AttachedDoc
          refs.add(child.attachedTo)
          if (tx._class === core.class.TxUpdateDoc) {
            const updated = { ...child }
            TxProcessor.applyUpdate(updated, (tx as TxUpdateDoc<AttachedDoc>).operations)
            refs.add(updated.attachedTo)
          }
        }
        if (tx._class === core.class.TxCreateDoc) {
          refs.add((TxProcessor.createDoc2Doc(tx as any) as AttachedDoc).attachedTo)
        }
      }
      const contactChanged = ['contact:class:Person', 'contact:class:SocialIdentity'].some(
        (clazz) => h.hasClass(clazz as Ref<Class<Doc>>) && h.isDerived(actual, clazz as Ref<Class<Doc>>)
      )
      const links = contactChanged
        ? await this.contactLinks(actual, tx.objectId)
        : [
            ...(await this.find(guest.class.PublicLink, { attachedTo: { $in: [...refs] } })),
            ...(await this.find(guest.class.PublicLink, { space: tx.objectId as Ref<Space> }))
          ]
      for (const link of links) ids.add(link._id)
    }
    return ids
  }

  private async contactLinks (actual: Ref<Class<Doc>>, id: Ref<Doc>): Promise<PublicLink[]> {
    const h = this.context.hierarchy
    const person = 'contact:class:Person' as Ref<Class<Doc>>
    const identity = 'contact:class:SocialIdentity' as Ref<Class<Doc>>
    const personChanged = h.hasClass(person) && h.isDerived(actual, person)
    const socialIds = new Set<string>(personChanged ? [] : [id])
    if (personChanged && h.hasClass(identity)) {
      for (const social of await this.find(identity, { attachedTo: id } as any)) socialIds.add(social._id)
    }
    const links = await this.find(guest.class.PublicLink, {})
    const classes = new Map<Ref<Class<Doc>>, PublicLink[]>()
    for (const link of links) {
      if (link.attachedToClass === undefined || !h.hasClass(link.attachedToClass)) continue
      const group = classes.get(link.attachedToClass) ?? []
      group.push(link)
      classes.set(link.attachedToClass, group)
    }
    const result: PublicLink[] = []
    for (const [clazz, group] of classes) {
      const targets = new Set<string>()
      for (const doc of await this.find(clazz, { _id: { $in: group.map((link) => link.attachedTo) } })) {
        let affected =
          (doc.createdBy !== undefined && socialIds.has(doc.createdBy)) ||
          (doc.modifiedBy !== undefined && socialIds.has(doc.modifiedBy))
        if (personChanged) {
          for (const [name, attr] of h.getAllAttributes(doc._class)) {
            const type = attr.type._class === core.class.ArrOf ? (attr.type as any).of : attr.type
            if (type._class !== core.class.RefTo || !h.isDerived(type.to, person)) continue
            const value = (doc as unknown as Record<string, unknown>)[name]
            if (value === id || (Array.isArray(value) && value.includes(id))) affected = true
          }
        }
        if (affected) targets.add(doc._id)
      }
      result.push(...group.filter((link) => targets.has(link.attachedTo)))
    }
    return result
  }

  override async tx (ctx: MeasureContext<SessionData>, txes: Tx[]): Promise<TxMiddlewareResult> {
    const cache = ctx.contextData.contextCache
    if (cache.get('public-file-write') === this.owner) return await this.guardedTx(ctx, txes)
    return await this.withWriteTurn(async () => {
      cache.set('public-file-write', this.owner)
      try {
        return await this.guardedTx(ctx, txes)
      } finally {
        cache.delete('public-file-write')
      }
    })
  }

  private async withWriteTurn<T>(run: () => Promise<T>): Promise<T> {
    const previous = this.tail
    let release: () => void = () => {}
    this.tail = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      return await run()
    } finally {
      release()
    }
  }

  private async markPending (id: string, pending: boolean): Promise<void> {
    await this.context.lowLevelStorage?.rawUpdate(
      this.context.hierarchy.getDomain(guest.class.PublicLink),
      { _id: id as Ref<PublicLink> },
      { publicFileSyncPending: pending } as any
    )
  }

  private async guardedTx (ctx: MeasureContext<SessionData>, txes: Tx[]): Promise<TxMiddlewareResult> {
    // Only raw server writes may control this marker. A browser cannot acknowledge its own permissions.
    for (const tx of txes as Array<
      TxCUD<Doc> & { attributes?: Record<string, unknown>, operations?: Record<string, unknown> }
    >) {
      const fields = [...Object.keys(tx.attributes ?? {}), ...Object.keys(tx.operations ?? {})]
      for (const [op, value] of Object.entries(tx.operations ?? {})) {
        if (!op.startsWith('$') || value === null || typeof value !== 'object') continue
        fields.push(...Object.keys(value))
        if (op === '$rename' || (op === '$unset' && Array.isArray(value))) {
          fields.push(...Object.values(value).filter((field): field is string => typeof field === 'string'))
        }
      }
      if (fields.some((field) => field.split('.')[0] === 'publicFileSyncPending')) {
        throw new Error('Public file synchronization state is server-owned')
      }
    }
    const links = await this.affected(txes)
    const hasRemoval = txes.some((tx) => tx._class === core.class.TxRemoveDoc)
    const before = new Map<string, string[] | undefined>()
    const dirty = new Set<string>()
    for (const id of links) {
      const [link] = await this.find(guest.class.PublicLink, { _id: id as Ref<PublicLink> })
      if ((link as PublicLink & { publicFileSyncPending?: boolean })?.publicFileSyncPending === true) dirty.add(id)
      // Fence a failed move before another move can make the old link match
      // again. Even a mixed batch with a deletion needs this check.
      if (dirty.has(id) && (await this.sourceDocument(link)) === undefined) await this.syncer.sync(id, true)
      if (!hasRemoval) before.set(id, await this.syncer.sourceFiles(id))
      // Write-ahead, not an after-commit callback: a crash cannot erase the fact that this link needs checking.
      await this.markPending(id, true)
    }
    // Give a different pipeline time to observe a completed write. If this
    // pipeline stops before releasing its intents, they become eligible anyway.
    const generation = await this.queueLinks(ctx, links, Date.now() + 60000)
    let result: TxMiddlewareResult
    try {
      result = await this.provideTx(ctx, txes)
    } finally {
      if (generation !== undefined) {
        await this.workStorage.rawUpdate<PublicFileSyncJob>(this.workDomain, { generation }, { readyAt: Date.now() })
        this.syncer.wake()
      }
    }
    // Source writes are not rolled back on a sync failure. Never acknowledge a reduction
    // early; pending markers and the durable queue repair interrupted requests after restart.
    const discovered = await this.affected(txes)
    for (const id of links) discovered.delete(id)
    if ((await this.queueLinks(ctx, discovered, Date.now())) !== undefined) this.syncer.wake()
    for (const id of discovered) links.add(id)
    for (const id of links) {
      let revoked = false
      if (
        txes.some(
          (tx) =>
            (tx as TxCUD<Doc>).objectClass === guest.class.PublicLink &&
            (tx as TxCUD<Doc>).objectId === id &&
            tx._class !== core.class.TxRemoveDoc
        )
      ) {
        await this.markPending(id, true)
        revoked = await this.syncer.sync(id)
      } else if (hasRemoval || dirty.has(id)) {
        revoked = await this.syncer.sync(id, true)
      } else {
        const previous = before.get(id)
        if (previous !== undefined) {
          const current = await this.syncer.sourceFiles(id)
          const allowed = new Set(current)
          if (current === undefined || previous.some((file) => !allowed.has(file))) {
            revoked = await this.syncer.sync(id, true)
          }
        }
      }
      if (revoked) {
        const [link] = await this.find(guest.class.PublicLink, { _id: id as Ref<PublicLink> })
        if (link !== undefined) {
          const derived = this.context.derived ?? this.nextTx
          if (derived === undefined) throw new Error('Missing pipeline for retiring public link')
          const remove = new TxFactory(core.account.System, true).createTxRemoveDoc(link._class, link.space, link._id)
          await derived.tx(ctx, [remove])
        }
      } else await this.markPending(id, false)
    }
    return result
  }

  override async close (): Promise<void> {
    await this.syncer.close()
  }
}
