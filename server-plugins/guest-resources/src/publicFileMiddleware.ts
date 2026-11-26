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
  toFindResult,
  type Class,
  type Client,
  type Doc,
  type MeasureContext,
  type Ref,
  type SessionData,
  type Tx,
  type TxCUD,
  type AttachedDoc,
  type DocumentQuery,
  type Space
} from '@hcengineering/core'
import guest, { getPublicLinkSpace, type PublicLink } from '@hcengineering/guest'
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
  private readonly syncer: PublicFileSync
  private tail: Promise<void> = Promise.resolve()
  private readonly owner = Symbol('public-file-write')

  constructor (ctx: MeasureContext, context: PipelineContext, next: Middleware | undefined, endpoint: string) {
    super(context, next)
    const client = new PublicFileAccessClient(
      endpoint,
      generateToken(systemAccountUuid, undefined, { service: 'public-file-access' })
    )
    this.syncer = new PublicFileSync(
      context.workspace.uuid,
      client,
      {
        links: async (after) =>
          (await this.find(guest.class.PublicLink, { _id: { $gt: after } } as any, 10)).map((it) => it._id),
        files: async (id) => {
          const [link] = await this.find(guest.class.PublicLink, { _id: id as Ref<PublicLink> })
          if (link?.attachedToClass === undefined || !context.hierarchy.hasClass(link.attachedToClass)) return undefined
          const [doc] = await this.find(link.attachedToClass, { _id: link.attachedTo })
          if (doc === undefined || getPublicLinkSpace(context.hierarchy, doc) !== link.space) return undefined
          const source: Pick<Client, 'findAll' | 'getHierarchy'> = {
            getHierarchy: () => context.hierarchy,
            findAll: async <T extends Doc>(clazz: Ref<Class<T>>, query: DocumentQuery<T>) =>
              toFindResult(await this.find(clazz, query))
          }
          return await collectPublicFiles(source, doc, async (snapshot) => {
            if (context.storageAdapter === undefined) throw new Error('Missing storage adapter')
            return Buffer.concat(await context.storageAdapter.read(ctx, context.workspace, snapshot)).toString()
          })
        }
      },
      (err) => {
        ctx.error('public-file synchronization failed', { error: err instanceof Error ? err.message : 'unknown' })
      }
    )
    this.syncer.start()
  }

  static create (endpoint: string): MiddlewareCreator {
    return async (ctx, context, next) => {
      if (!context.hierarchy.hasClass(guest.class.PublicLink)) {
        if (next === undefined) throw new Error('Missing middleware after public file synchronization')
        return next
      }
      return new PublicFileMiddleware(ctx, context, next, endpoint)
    }
  }

  private async find<T extends Doc>(_class: Ref<Class<T>>, query: DocumentQuery<T>, limit?: number): Promise<T[]> {
    const h = this.context.hierarchy
    if (this.context.lowLevelStorage === undefined) throw new Error('Missing low-level storage')
    const filter = h.isMixin(_class) ? { [_class]: { $exists: true } } : { _class: { $in: h.getDescendants(_class) } }
    const scoped: DocumentQuery<T> = { ...query, ...filter }
    return await this.context.lowLevelStorage.rawFindAll(
      h.getDomain(_class),
      scoped,
      limit === undefined ? undefined : { limit, sort: { _id: 1 } }
    )
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
        if (stored !== undefined) refs.add((stored as AttachedDoc).attachedTo)
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
    const previous = this.tail
    let release: () => void = () => {}
    this.tail = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    cache.set('public-file-write', this.owner)
    try {
      return await this.guardedTx(ctx, txes)
    } finally {
      cache.delete('public-file-write')
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
      if (!hasRemoval) before.set(id, await this.syncer.sourceFiles(id))
      // Write-ahead, not an after-commit callback: a crash cannot erase the fact that this link needs checking.
      await this.markPending(id, true)
    }
    const result = await this.provideTx(ctx, txes)
    // Source writes are not rolled back on a sync failure. Never acknowledge a reduction
    // early; pending markers and the durable scan repair interrupted requests after restart.
    for (const id of await this.affected(txes)) links.add(id)
    for (const id of links) {
      if (
        txes.some(
          (tx) =>
            (tx as TxCUD<Doc>).objectClass === guest.class.PublicLink &&
            (tx as TxCUD<Doc>).objectId === id &&
            tx._class !== core.class.TxRemoveDoc
        )
      ) {
        await this.markPending(id, true)
        await this.syncer.sync(id)
      } else if (hasRemoval || dirty.has(id)) {
        await this.syncer.sync(id, true)
      } else {
        const previous = before.get(id)
        if (previous !== undefined) {
          const current = await this.syncer.sourceFiles(id)
          const allowed = new Set(current)
          if (current === undefined || previous.some((file) => !allowed.has(file))) await this.syncer.sync(id, true)
        }
      }
      await this.markPending(id, false)
    }
    this.syncer.enqueue(links)
    return result
  }

  override async close (): Promise<void> {
    await this.syncer.close()
  }
}
