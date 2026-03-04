import { Class, Doc, Ref, TxCUD } from '@hcengineering/core'
import { Resource } from '@hcengineering/platform'
import { TriggerControl } from '@hcengineering/server-core'

export interface DocObjectCache {
  docs: Map<Ref<Doc>, Doc | null>
  transactions: Map<Ref<Doc>, TxCUD<Doc>[]>
}

export type Presenter<T extends Doc = any> = (doc: T, control: TriggerControl) => Promise<string>

export interface TitlePresenter<T extends Doc = any> extends Class<T> {
  presenter: Resource<Presenter<T>>
}

export interface IdentifierPresenter<T extends Doc = any> extends Class<T> {
  presenter: Resource<Presenter<T>>
}

export interface UrlPresenter<T extends Doc = any> extends Class<T> {
  presenter: Resource<Presenter<T>>
}
