//
// Copyright © 2025 Hardcore Engineering Inc.
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
  AttachedData,
  AttachedDoc,
  Data,
  DocumentUpdate,
  FindResult,
  SearchOptions,
  SearchQuery,
  SearchResult,
  Space,
  Timestamp,
  Tx,
  TxResult,
  type Account,
  type Class,
  type Doc,
  type DocumentQuery,
  type DomainParams,
  type DomainRequestOptions,
  type DomainResult,
  type FindOptions,
  type Hierarchy,
  type ModelDb,
  type OperationDomain,
  type PersonId,
  type PersonUuid,
  type Ref,
  type SocialIdType,
  type WithLookup
} from '@hcengineering/core'

/**
 * A list of client operations to perform on.
 */
export interface ClientOperations {
  //
  /// Low level operations
  //
  /**
   * Find some documents based on class.
   *
   * core.class.Doc is not allowed to be used.
   *
   * Will also return a model document, by request to server.
   */
  findAll: <T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => Promise<FindResult<T>>

  /**
   * A juice to find one document, will use findAll with limit=1
   */
  findOne: <T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => Promise<WithLookup<T> | undefined>

  /**
   * Perform any of supported transactions on transactor.
   */
  tx: (tx: Tx) => Promise<TxResult>

  // High level operations
  // Server will use token account for modifiedBy if not specified.

  /**
   * Construct a new document, not attached one.
   * use addCollection to create attached document, it requires few extra params.
   */
  createDoc: <T extends Doc>(
    _class: Ref<Class<T>>,
    space: Ref<Space>,
    attributes: Data<T>,
    id?: Ref<T>,
    modifiedOn?: Timestamp,
    modifiedBy?: PersonId
  ) => Promise<Ref<T>>

  /**
   * Construct a new attached document.
   */
  addCollection: <T extends Doc, P extends AttachedDoc>(
    _class: Ref<Class<P>>,
    space: Ref<Space>,
    attachedTo: Ref<T>,
    attachedToClass: Ref<Class<T>>,
    collection: Extract<keyof T, string> | string,
    attributes: AttachedData<P>,
    id?: Ref<P>,
    modifiedOn?: Timestamp,
    modifiedBy?: PersonId
  ) => Promise<Ref<P>>

  /**
   * Update a document or collection document.
   */
  update: <T extends Doc>(
    doc: T,
    update: DocumentUpdate<T>,
    retrieve?: boolean,
    modifiedOn?: Timestamp,
    modifiedBy?: PersonId
  ) => Promise<TxResult>

  /**
   * Remove a document or collection document.
   *
   * For documents be aware all collection documents attached will be removed as well.
   */
  remove: <T extends Doc>(doc: T, modifiedOn?: Timestamp, modifiedBy?: PersonId) => Promise<TxResult>
}

export interface RestClient extends ClientOperations {
  getAccount: () => Promise<Account>
  getModel: () => Promise<{ hierarchy: Hierarchy, model: ModelDb }>
  ensurePerson: (
    socialType: SocialIdType,
    socialValue: string,
    firstName: string,
    lastName: string
  ) => Promise<{ uuid: PersonUuid, socialId: PersonId, localPerson: string }>

  /**
   * Perform a document request, not matching any transactions.
   */
  domainRequest: <T>(
    domain: OperationDomain,
    params: DomainParams,
    options?: DomainRequestOptions
  ) => Promise<DomainResult<T>>

  /**
   * Perform a full text search request.
   */
  searchFulltext: (query: SearchQuery, options: SearchOptions) => Promise<SearchResult>
}
