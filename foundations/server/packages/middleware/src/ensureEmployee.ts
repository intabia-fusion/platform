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
import {
  type Client,
  type DomainParams,
  type DomainResult,
  type MeasureContext,
  type OperationDomain,
  type SessionData,
  TxFactory
} from '@hcengineering/core'
import { BaseMiddleware, type LimitsProvider, type Middleware, type PipelineContext } from '@hcengineering/server-core'
import contact, { ensureEmployee, ensureEmployeeDomain } from '@hcengineering/contact'
import platform, { PlatformError, Severity, Status } from '@hcengineering/platform'
import { LIMITS_PROVIDER_VAR } from './planLimits'

export const employeeBootstrap = Symbol('employeeBootstrap')
export type EmployeeBootstrapContext = MeasureContext<SessionData> & { [employeeBootstrap]?: 'domain' | 'tx' }

export class EnsureEmployeeMiddleware extends BaseMiddleware implements Middleware {
  static async create (
    _ctx: MeasureContext,
    context: PipelineContext,
    next: Middleware | undefined
  ): Promise<EnsureEmployeeMiddleware> {
    return new EnsureEmployeeMiddleware(context, next)
  }

  async domainRequest (
    ctx: MeasureContext<SessionData>,
    domain: OperationDomain,
    params: DomainParams
  ): Promise<DomainResult> {
    if (domain === ensureEmployeeDomain) {
      const account = ctx.contextData?.account
      if (account == null) {
        return { domain, value: null }
      }
      const readOnly = ctx.contextData.readOnly === true || ctx.contextData.apiKey !== undefined
      const bootstrap = (ctx as EmployeeBootstrapContext)[employeeBootstrap] === 'domain'
      const head = this.context.head
      const provider = this.context.contextVars[LIMITS_PROVIDER_VAR] as LimitsProvider | undefined
      if (head === undefined || (bootstrap && provider === undefined)) {
        throw new Error('Employee bootstrap is unavailable')
      }
      const client: Pick<Client, 'findOne' | 'findAll' | 'tx'> = {
        findAll: async (_class, query, options) => await head.findAll(ctx, _class, query, options),
        findOne: async (_class, query, options) =>
          (await head.findAll(ctx, _class, query, { ...options, limit: 1 }))[0],
        tx: async (...txes) => {
          if (readOnly) throw new PlatformError(new Status(Severity.ERROR, platform.status.Forbidden, {}))
          if (!bootstrap) return await head.tx(ctx, txes)
          return await ctx.with('employee-bootstrap-tx', {}, async (child) => {
            const scoped = child as EmployeeBootstrapContext
            scoped[employeeBootstrap] = 'tx'
            return await head.tx(scoped, txes)
          })
        }
      }
      if (bootstrap) {
        const existing = await client.findOne(contact.mixin.Employee, { personUuid: account.uuid, active: true })
        if (existing !== undefined) {
          const existingSpace = await client.findOne(contact.class.PersonSpace, { person: existing._id })
          if (existingSpace !== undefined) {
            return { domain, value: { employee: existing._id, personSpace: existingSpace._id } }
          }
        }
      }
      const employee = await ensureEmployee(
        ctx,
        account,
        client,
        account.fullSocialIds,
        async () => {
          try {
            return await provider?.getPerson(account.uuid, this.context.workspace.uuid)
          } catch (err) {
            if (bootstrap) throw err
            return undefined
          }
        },
        {
          throwOnForbidden: bootstrap
        }
      )
      if (employee == null) {
        if (bootstrap) throw new Error('Employee bootstrap failed')
        return { domain, value: null }
      }
      if (bootstrap) {
        const activeEmployee = await client.findOne(contact.mixin.Employee, {
          _id: employee,
          personUuid: account.uuid,
          active: true
        })
        if (activeEmployee === undefined) throw new Error('Employee bootstrap failed')
      }
      let space = await client.findOne(contact.class.PersonSpace, { person: employee })
      if (space === undefined && bootstrap) {
        const factory = new TxFactory(account.primarySocialId)
        const mixin = factory.createTxMixin(
          employee,
          contact.class.Person,
          contact.space.Contacts,
          contact.mixin.Employee,
          {
            active: true
          }
        )
        const tx = factory.createTxApplyIf(
          contact.space.Contacts,
          `ensure-person-space-${account.uuid}`,
          [],
          [{ _class: contact.class.PersonSpace, query: { person: employee } }],
          [mixin],
          'ensureEmployee'
        )
        await client.tx(tx)
        space = await client.findOne(contact.class.PersonSpace, { person: employee })
      }
      if (space === undefined && bootstrap) throw new Error('Employee person space was not created')
      return { domain, value: { employee, personSpace: space?._id } }
    }
    return await this.provideDomainRequest(ctx, domain, params)
  }
}
