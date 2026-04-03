import { Class, Doc } from '@hcengineering/core'
import { Resource } from '@hcengineering/platform'
import { TriggerControl } from '@hcengineering/server-core'

export type PresenterControl = Pick<
TriggerControl,
'hierarchy' | 'ctx' | 'modelDb' | 'findAll' | 'branding' | 'workspace'
>
export type Presenter<T extends Doc = any> = (doc: T, control: PresenterControl) => Promise<string | undefined>

export interface TitlePresenter<T extends Doc = any> extends Class<T> {
  presenter: Resource<Presenter<T>>
}

export interface IdentifierPresenter<T extends Doc = any> extends Class<T> {
  presenter: Resource<Presenter<T>>
}

export interface UrlPresenter<T extends Doc = any> extends Class<T> {
  presenter: Resource<Presenter<T>>
}
