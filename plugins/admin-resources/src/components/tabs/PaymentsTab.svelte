<!--
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
-->
<script lang="ts">
  import { Label, Loading, Button, SearchEdit, TabList, themeStore, type TabItem } from '@hcengineering/ui'
  import ui from '@hcengineering/ui'
  import { copyTextToClipboard } from '@hcengineering/presentation'
  import type { PaymentOperation, SubscriptionInfo } from '@hcengineering/account-client'
  import adminRes from '../../plugin'
  import { formatPaymentAmount } from '../../subscriptionMetrics'
  import {
    buildPaymentTransactions,
    overduePaymentSubscriptions,
    paymentTotals,
    paymentOperationDetails,
    paymentRaw,
    type PaymentTransaction
  } from '../../paymentLedger'
  import { getPaymentOperations, getAllSubscriptions, listWorkspacesPaged } from '../../utils'

  export let refreshTick: number = 0

  const DAY = 24 * 3600 * 1000
  const PAGE = 25
  const BATCH = 500
  const tabs: TabItem[] = [
    { id: 'payments', labelIntl: adminRes.string.Payments },
    { id: 'attention', labelIntl: adminRes.string.PaymentAttention },
    { id: 'journal', labelIntl: adminRes.string.PaymentJournal }
  ]
  const periods = [
    { days: 7, label: adminRes.string.Period7d },
    { days: 30, label: adminRes.string.Period30d },
    { days: 90, label: adminRes.string.Period90d },
    { days: 365, label: adminRes.string.Period365d }
  ]
  const states = {
    paid: adminRes.string.PaymentPaid,
    refunded: adminRes.string.PaymentRefunded,
    partially_refunded: adminRes.string.PaymentPartiallyRefunded,
    failed: adminRes.string.PaymentFailed,
    pending: adminRes.string.PaymentPending,
    authorized: adminRes.string.PaymentAuthorized,
    reversed: adminRes.string.PaymentReversed,
    unknown: adminRes.string.PaymentUnknown
  }
  let tab = 'payments'
  let periodDays = 30
  let search = ''
  let providerFilter = ''
  let providers: string[] = []
  let operationFilter = ''
  let statusFilter = ''
  let page = 0
  let expanded = new Set<string>()
  let operations: PaymentOperation[] = []
  let financialOperations: PaymentOperation[] = []
  let subscriptions: SubscriptionInfo[] = []
  let wsNames = new Map<string, string>()
  let loading = true
  let ledgerAvailable = false
  let financialAvailable = false
  let contactsAvailable = false
  let namesAvailable = false
  let from = Date.now() - periodDays * DAY
  let to = Date.now()
  let version = 0

  async function loadLedger (start: number, end: number, request: number): Promise<PaymentOperation[] | null> {
    const result: PaymentOperation[] = []
    while (true) {
      if (request !== version) return null
      const batch = await getPaymentOperations({ from: start, to: end, limit: BATCH, offset: result.length })
      if (batch == null) return null
      result.push(...batch)
      if (batch.length < BATCH) return result
    }
  }

  async function loadFinancialHistory (
    ledger: PaymentOperation[],
    subs: SubscriptionInfo[],
    end: number,
    request: number
  ): Promise<PaymentOperation[] | null> {
    const result = new Map(ledger.map((operation) => [operation.id, operation]))
    const payments = buildPaymentTransactions(ledger, subs).filter(
      (transaction) => transaction.paymentId != null && !['trial', 'free', 'manual'].includes(transaction.provider)
    )
    for (const payment of payments) {
      let offset = 0
      while (true) {
        if (request !== version) return null
        const batch = await getPaymentOperations({
          provider: payment.provider,
          paymentId: payment.paymentId,
          to: end,
          limit: BATCH,
          offset
        })
        if (batch == null) return null
        for (const operation of batch) result.set(operation.id, operation)
        offset += batch.length
        if (batch.length < BATCH) break
      }
    }
    return Array.from(result.values())
  }

  async function loadNames (request: number): Promise<Map<string, string> | null> {
    const result = new Map<string, string>()
    let skip = 0
    while (true) {
      if (request !== version) return null
      const batch = await listWorkspacesPaged({ skip, limit: 1000, sort: 'name', order: 'asc' })
      if (batch == null) return null
      for (const workspace of batch.workspaces) {
        result.set(workspace.uuid, workspace.name ?? workspace.url ?? workspace.uuid)
      }
      skip += batch.workspaces.length
      if (skip >= batch.total) return result
      if (batch.workspaces.length === 0) return null
    }
  }

  async function load (_tick: number, days: number): Promise<void> {
    const request = ++version
    loading = true
    financialAvailable = false
    const end = Date.now()
    const start = end - days * DAY
    try {
      const [ledger, subs, names] = await Promise.all([
        loadLedger(start, end, request),
        getAllSubscriptions(),
        loadNames(request)
      ])
      if (request !== version) return
      operations = ledger ?? []
      subscriptions = subs ?? []
      wsNames = names ?? new Map()
      ledgerAvailable = ledger != null
      contactsAvailable = subs != null
      namesAvailable = names != null
      from = start
      to = end
      expanded = new Set()
      const history = ledger != null ? await loadFinancialHistory(ledger, subs ?? [], end, request) : null
      if (request !== version) return
      financialOperations = history ?? []
      financialAvailable = history != null
    } finally {
      if (request === version) loading = false
    }
  }
  $: void load(refreshTick, periodDays)

  function wsLabel (uuid: string | undefined): string {
    if (uuid == null) return '-'
    return wsNames.get(uuid) ?? uuid
  }
  function money (amount: number | string | undefined, provider: string): string {
    return formatPaymentAmount(amount, provider, $themeStore.language ?? 'en')
  }
  function fmtDate (ms: number | string | undefined): string {
    const value = Number(ms)
    return ms != null && Number.isFinite(value) ? new Date(value).toLocaleString($themeStore.language ?? 'en') : '-'
  }

  // Plan + seats for a ledger row: only from the record itself — resolving via the subscription
  // would show its CURRENT plan/seats on historical rows, which is a lie.
  function planOf (op: PaymentOperation): string {
    const raw = paymentRaw(op)
    const plan = raw.plan
    const seats = raw.seats
    if (plan == null) return '-'
    return seats != null ? `${plan} ×${seats}` : String(plan)
  }

  function matches (values: Array<string | number | undefined>, query: string): boolean {
    const normalized = query.trim().toLowerCase()
    return (
      normalized === '' ||
      values.some((value) =>
        String(value ?? '')
          .toLowerCase()
          .includes(normalized)
      )
    )
  }
  $: subById = new Map(subscriptions.map((subscription) => [subscription.id, subscription]))
  $: payerByAccount = new Map(
    subscriptions
      .filter((subscription) => subscription.payerEmail != null)
      .map((subscription) => [subscription.accountUuid as string, subscription.payerEmail as string])
  )
  function payerOf (transaction: PaymentTransaction): string {
    const subscriptionPayer =
      transaction.subscriptionId != null ? subById.get(transaction.subscriptionId)?.payerEmail : undefined
    const accountUuid = transaction.operations.find((operation) => operation.accountUuid != null)?.accountUuid
    return subscriptionPayer ?? (accountUuid != null ? payerByAccount.get(accountUuid) : undefined) ?? '-'
  }
  function operationPayer (operation: PaymentOperation): string {
    return (
      (operation.subscriptionId != null ? subById.get(operation.subscriptionId)?.payerEmail : undefined) ??
      (operation.accountUuid != null ? payerByAccount.get(operation.accountUuid) : undefined) ??
      '-'
    )
  }
  function requestedAmount (transaction: PaymentTransaction): number | undefined {
    return (
      transaction.operations.find((operation) => operation.operation === 'init_charge')?.amount ??
      transaction.operations.find((operation) => operation.operation === 'charge_recurrent')?.amount
    )
  }
  function toggle (key: string): void {
    const next = new Set(expanded)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    expanded = next
  }
  function resetPage (_filters: string[], _operations: PaymentOperation[]): void {
    page = 0
  }
  $: resetPage([tab, search, providerFilter, operationFilter, statusFilter], operations)
  $: transactions = buildPaymentTransactions(financialOperations, subscriptions, { from, to })
  $: overdueSubscriptions = overduePaymentSubscriptions(subscriptions)
  $: {
    let values = transactions.map((transaction) => transaction.provider)
    if (tab === 'journal') values = operations.map((operation) => operation.provider)
    if (tab === 'attention') {
      values = [
        ...transactions
          .filter((transaction) => ['failed', 'pending', 'authorized', 'unknown'].includes(transaction.state))
          .map((transaction) => transaction.provider),
        ...overdueSubscriptions.map((subscription) => subscription.provider)
      ]
    }
    providers = Array.from(new Set(values))
      .filter((provider) => provider !== '')
      .sort()
  }
  $: if (providerFilter !== '' && !providers.includes(providerFilter)) providerFilter = ''
  $: shownTransactions = transactions
    .filter((transaction) => providerFilter === '' || transaction.provider === providerFilter)
    .filter((transaction) =>
      matches(
        [
          transaction.paymentId,
          transaction.orderId,
          transaction.workspaceUuid,
          wsLabel(transaction.workspaceUuid),
          transaction.plan,
          payerOf(transaction),
          transaction.provider,
          transaction.state,
          ...transaction.operations.map((operation) => JSON.stringify(operation.raw))
        ],
        search
      )
    )
  $: totals = paymentTotals(shownTransactions)
  $: tbankTotals = totals.find((total) => total.provider === 'tbank')
  $: financeAvailable = providerFilter === '' || providerFilter === 'tbank'
  $: confirmedCount = totals.reduce((count, total) => count + total.count, 0)
  $: journal = operations
    .filter((operation) => providerFilter === '' || operation.provider === providerFilter)
    .filter((operation) => operationFilter === '' || operation.operation === operationFilter)
    .filter((operation) => statusFilter === '' || operation.status === statusFilter)
    .filter((operation) =>
      matches(
        [
          operation.paymentId,
          operation.orderId,
          operation.workspaceUuid,
          wsLabel(operation.workspaceUuid),
          planOf(operation),
          operation.accountUuid,
          operationPayer(operation),
          operation.operation,
          operation.provider,
          operation.actor,
          operation.status,
          JSON.stringify(operation.raw)
        ],
        search
      )
    )
    .slice()
    .sort((a, b) => Number(b.createdOn ?? 0) - Number(a.createdOn ?? 0))
  $: operationOptions = Array.from(new Set(operations.map((operation) => operation.operation))).sort()
  $: statusOptions = Array.from(
    new Set(operations.map((operation) => operation.status ?? '').filter((status) => status !== ''))
  ).sort()
  $: attentionPayments = shownTransactions.filter((transaction) =>
    ['failed', 'pending', 'authorized', 'unknown'].includes(transaction.state)
  )
  $: attentionSubscriptions = overdueSubscriptions
    .filter((subscription) => providerFilter === '' || subscription.provider === providerFilter)
    .filter((subscription) =>
      matches(
        [
          subscription.workspaceUuid,
          wsLabel(subscription.workspaceUuid),
          subscription.payerEmail,
          subscription.plan,
          subscription.provider,
          subscription.status
        ],
        search
      )
    )
    .sort((a, b) => Number(a.periodEnd ?? 0) - Number(b.periodEnd ?? 0))
  $: attention = [
    ...attentionPayments.map((transaction) => ({ kind: 'payment' as const, transaction })),
    ...attentionSubscriptions.map((subscription) => ({ kind: 'subscription' as const, subscription }))
  ]
  $: rowCount = tab === 'journal' ? journal.length : tab === 'attention' ? attention.length : shownTransactions.length
  $: pageCount = Math.max(1, Math.ceil(rowCount / PAGE))
  $: page = Math.min(page, pageCount - 1)
  $: transactionPage = (tab === 'attention' ? attentionPayments : shownTransactions).slice(
    page * PAGE,
    (page + 1) * PAGE
  )
  $: attentionPage = attention.slice(page * PAGE, (page + 1) * PAGE)
  $: journalPage = journal.slice(page * PAGE, (page + 1) * PAGE)
  $: tablePage =
    tab === 'attention'
      ? attentionPage
      : transactionPage.map((transaction) => ({ kind: 'payment' as const, transaction }))
</script>

<div class="payments-panel">
  <div class="toolbar">
    {#each periods as period}
      <Button
        label={period.label}
        kind={periodDays === period.days ? 'primary' : 'regular'}
        size="small"
        on:click={() => (periodDays = period.days)}
      />
    {/each}
    <SearchEdit bind:value={search} width="17rem" />
    <label class="filter"
      ><Label label={adminRes.string.Provider} />
      <select bind:value={providerFilter}>
        <option value=""><Label label={adminRes.string.PaymentAllProviders} /></option>
        {#each providers as provider}<option value={provider}>{provider}</option>{/each}
      </select>
    </label>
  </div>
  <div class="scope"><Label label={adminRes.string.PaymentSelectedPeriod} /> {fmtDate(from)} - {fmtDate(to)}</div>
  <TabList
    items={tabs}
    selected={tab}
    on:select={(event) => {
      if (event.detail !== undefined) tab = event.detail.id
    }}
  />

  {#if loading}
    <Loading />
  {:else}
    {#if !contactsAvailable || !namesAvailable}<div class="error">
        <Label label={adminRes.string.PaymentContextError} />
      </div>{/if}
    {#if tab === 'journal' ? !ledgerAvailable : !financialAvailable}<div class="error">
        <Label label={adminRes.string.LoadError} />
      </div>{/if}
    {#if tab === 'payments' && financialAvailable}
      <div class="kpis">
        {#each [{ label: adminRes.string.PaymentReceived, amount: !financeAvailable ? null : tbankTotals == null ? 0 : tbankTotals.received }, { label: adminRes.string.PaymentRefunds, amount: !financeAvailable ? null : tbankTotals == null ? 0 : tbankTotals.refunded }, { label: adminRes.string.PaymentNet, amount: !financeAvailable ? null : tbankTotals == null ? 0 : tbankTotals.net }] as metric}
          <div class="kpi">
            <div class="scope"><Label label={metric.label} /></div>
            <strong>{metric.amount == null ? '-' : money(metric.amount, 'tbank')}</strong>
          </div>
        {/each}
        <div class="kpi">
          <div class="scope"><Label label={adminRes.string.PaymentConfirmedCount} /></div>
          <strong>{confirmedCount}</strong>
        </div>
      </div>
      <div class="scope"><Label label={adminRes.string.PaymentTotalsScope} /></div>
    {/if}
    {#if tab === 'journal'}
      <div class="toolbar">
        <label class="filter"
          ><Label label={adminRes.string.Operation} /><select bind:value={operationFilter}>
            <option value=""><Label label={adminRes.string.AllOperations} /></option>
            {#each operationOptions as operation}<option value={operation}>{operation}</option>{/each}
          </select></label
        >
        <label class="filter"
          ><Label label={adminRes.string.Status} /><select bind:value={statusFilter}>
            <option value=""><Label label={adminRes.string.AllSubscriptionStatuses} /></option>
            {#each statusOptions as status}<option value={status}>{status}</option>{/each}
          </select></label
        >
      </div>
      <div class="scope"><Label label={adminRes.string.PaymentJournalScope} /></div>
    {:else if tab === 'attention'}
      <div class="scope"><Label label={adminRes.string.PaymentAttentionScope} /></div>
    {/if}
    <div class="scope"><Label label={adminRes.string.PaymentRowMoneyScope} /></div>

    {#if tab === 'journal' ? ledgerAvailable : financialAvailable || (tab === 'attention' && contactsAvailable)}
      {#if rowCount === 0}
        <div class="empty">
          <Label label={adminRes.string.NoOperations} />
          {#if tab === 'payments' && periodDays !== 365}<Button
              label={adminRes.string.PaymentShowYear}
              kind="regular"
              size="small"
              on:click={() => (periodDays = 365)}
            />{/if}
        </div>
      {:else}
        <div class="table-scroll">
          {#if tab === 'journal'}
            <table>
              <thead
                ><tr>
                  <th><Label label={adminRes.string.Date} /></th><th><Label label={adminRes.string.Workspace} /></th>
                  <th><Label label={adminRes.string.Operation} /></th><th><Label label={adminRes.string.Status} /></th>
                  <th><Label label={adminRes.string.Actor} /></th><th><Label label={adminRes.string.Plan} /></th>
                  <th class="number"><Label label={adminRes.string.Amount} /></th><th
                    ><Label label={adminRes.string.Provider} /></th
                  >
                  <th>payment_id</th><th><Label label={adminRes.string.Details} /></th>
                </tr></thead
              ><tbody>
                {#each journalPage as operation}
                  {@const diagnostic = paymentOperationDetails(operation)}
                  <tr
                    ><td>{fmtDate(operation.createdOn)}</td><td title={operation.workspaceUuid}
                      >{wsLabel(operation.workspaceUuid)}</td
                    >
                    <td>{operation.operation}</td><td>{operation.status ?? '-'}</td><td>{operation.actor ?? '-'}</td>
                    <td>{planOf(operation)}</td><td class="number">{money(operation.amount, operation.provider)}</td>
                    <td>{operation.provider}</td><td class="mono">{operation.paymentId ?? '-'}</td>
                    <td>
                      {#if diagnostic.code != null || diagnostic.message != null || diagnostic.details != null}
                        <div class="event-reason">
                          {#if diagnostic.code != null}<div>
                              <Label label={adminRes.string.PaymentErrorCode} />: {diagnostic.code}
                            </div>{/if}
                          {#if diagnostic.message != null}<div>{diagnostic.message}</div>{/if}
                          {#if diagnostic.details != null && diagnostic.details !== diagnostic.message}<div>
                              {diagnostic.details}
                            </div>{/if}
                        </div>
                      {/if}
                      <details>
                        <summary><Label label={adminRes.string.PaymentRaw} /></summary>
                        <pre>{JSON.stringify(operation, null, 2)}</pre>
                      </details></td
                    >
                  </tr>
                {/each}
              </tbody>
            </table>
          {:else}
            <table>
              <thead
                ><tr>
                  <th><Label label={adminRes.string.Date} /></th><th><Label label={adminRes.string.Workspace} /></th>
                  <th><Label label={adminRes.string.Payer} /></th>
                  <th><Label label={adminRes.string.Status} /></th><th class="number"
                    ><Label label={adminRes.string.PaymentRequested} /></th
                  >
                  <th class="number"><Label label={adminRes.string.PaymentReceived} /></th>
                  <th class="number"><Label label={adminRes.string.PaymentRefunds} /></th><th
                    ><Label label={adminRes.string.Provider} /></th
                  >
                  {#if tab === 'attention'}<th><Label label={adminRes.string.PaymentFailureReason} /></th>{/if}
                  <th><Label label={adminRes.string.Details} /></th>
                </tr></thead
              ><tbody>
                {#each tablePage as row}
                  {#if row.kind === 'subscription'}
                    {@const subscription = row.subscription}
                    {@const diagnostic = paymentOperationDetails({
                      provider: subscription.provider,
                      operation: 'charge_recurrent',
                      raw: {
                        errorCode: subscription.providerData?.lastChargeErrorCode,
                        message: subscription.providerData?.lastChargeError
                      }
                    })}
                    <tr class="attention"
                      ><td>{fmtDate(subscription.periodEnd)}</td><td title={subscription.workspaceUuid}
                        >{wsLabel(subscription.workspaceUuid)}</td
                      >
                      <td>{subscription.payerEmail ?? '-'}</td><td
                        ><Label
                          label={subscription.status === 'past_due'
                            ? adminRes.string.PaymentOverdue
                            : adminRes.string.PaymentRestricted}
                        /></td
                      >
                      <td class="number">{money(subscription.amount, subscription.provider)}</td><td class="number"
                        >-</td
                      ><td class="number">-</td><td>{subscription.provider}</td>
                      {#if tab === 'attention'}
                        <td class="reason" title={diagnostic.message}>
                          {diagnostic.code ?? ''}
                          {diagnostic.message ?? ''}
                          {#if diagnostic.message == null && diagnostic.code == null}
                            <Label label={adminRes.string.PaymentReasonUnavailable} />
                          {/if}
                        </td>
                      {/if}
                      <td
                        ><details>
                          <summary><Label label={adminRes.string.Details} /></summary>
                          <div><Label label={adminRes.string.Plan} />: {subscription.plan}</div>
                          {#if diagnostic.message != null}
                            <div class="event-reason">{diagnostic.message}</div>
                          {/if}
                          <div>
                            <Label label={adminRes.string.PricePerPeriod} />: {money(
                              subscription.amount,
                              subscription.provider
                            )}
                          </div>
                          <div>
                            <Label label={adminRes.string.Attempt} />: {subscription.providerData?.retryAttempt ?? '-'}
                          </div>
                          <div><Label label={adminRes.string.PeriodEnd} />: {fmtDate(subscription.periodEnd)}</div>
                        </details></td
                      >
                    </tr>
                  {:else}
                    {@const transaction = row.transaction}
                    <tr class:attention={['failed', 'pending', 'authorized', 'unknown'].includes(transaction.state)}>
                      <td>{fmtDate(transaction.updatedOn)}</td><td title={transaction.workspaceUuid}
                        >{wsLabel(transaction.workspaceUuid)}</td
                      >
                      <td>{payerOf(transaction)}</td><td><Label label={states[transaction.state]} /></td>
                      <td class="number">{money(requestedAmount(transaction), transaction.provider)}</td>
                      <td class="number"
                        >{transaction.paidAmount == null
                          ? '-'
                          : money(transaction.paidAmount, transaction.provider)}</td
                      >
                      <td class="number"
                        >{transaction.refundedAmount == null
                          ? '-'
                          : money(transaction.refundedAmount, transaction.provider)}</td
                      >
                      <td>{transaction.provider}</td>
                      {#if tab === 'attention'}
                        <td
                          class="reason"
                          title={[transaction.diagnostics.message, transaction.diagnostics.details]
                            .filter(Boolean)
                            .join(' - ')}
                        >
                          {transaction.diagnostics.code ?? ''}
                          {transaction.diagnostics.message ?? transaction.diagnostics.details ?? ''}
                          {#if transaction.diagnostics.code == null && transaction.diagnostics.message == null && transaction.diagnostics.details == null}
                            <Label label={adminRes.string.PaymentReasonUnavailable} />
                          {/if}
                        </td>
                      {/if}
                      <td
                        ><Button
                          label={adminRes.string.Details}
                          kind="link"
                          size="x-small"
                          height="22px"
                          on:click={() => {
                            toggle(transaction.key)
                          }}
                        /></td
                      >
                    </tr>
                    {#if expanded.has(transaction.key)}
                      <tr class="expanded"
                        ><td colspan={tab === 'attention' ? 10 : 9}>
                          <div class="identifiers">
                            {#each [{ label: 'PaymentId', value: transaction.paymentId }, { label: 'OrderId', value: transaction.orderId }, { label: 'CustomerId', value: transaction.customerId }, { label: 'CustomerKey', value: transaction.customerKey }] as identifier}
                              <div class="identifier">
                                <span>{identifier.label}: <span class="mono">{identifier.value ?? '-'}</span></span>
                                {#if identifier.value != null}
                                  <Button
                                    icon={ui.icon.Copy}
                                    size="x-small"
                                    kind="ghost"
                                    showTooltip={{ label: adminRes.string.CopyPaymentIdentifier }}
                                    on:click={() => copyTextToClipboard(String(identifier.value))}
                                  />
                                {/if}
                              </div>
                            {/each}
                            <div><Label label={adminRes.string.Plan} />: {transaction.plan ?? '-'}</div>
                          </div>
                          <table>
                            <thead
                              ><tr
                                ><th><Label label={adminRes.string.Date} /></th><th
                                  ><Label label={adminRes.string.Operation} /></th
                                >
                                <th><Label label={adminRes.string.Status} /></th><th
                                  ><Label label={adminRes.string.Actor} /></th
                                >
                                <th><Label label={adminRes.string.Plan} /></th><th class="number"
                                  ><Label label={adminRes.string.Amount} /></th
                                ><th><Label label={adminRes.string.Details} /></th>
                              </tr></thead
                            ><tbody>
                              {#each transaction.operations as operation}
                                {@const diagnostic = paymentOperationDetails(operation)}
                                <tr
                                  ><td>{fmtDate(operation.createdOn)}</td><td>{operation.operation}</td><td
                                    >{operation.status ?? '-'}</td
                                  >
                                  <td>{operation.actor ?? '-'}</td><td>{planOf(operation)}</td><td class="number"
                                    >{money(operation.amount, operation.provider)}</td
                                  >
                                  <td>
                                    {#if diagnostic.code != null || diagnostic.message != null || diagnostic.details != null}
                                      <div class="event-reason">
                                        {#if diagnostic.code != null}<div>
                                            <Label label={adminRes.string.PaymentErrorCode} />: {diagnostic.code}
                                          </div>{/if}
                                        {#if diagnostic.message != null}<div>{diagnostic.message}</div>{/if}
                                        {#if diagnostic.details != null && diagnostic.details !== diagnostic.message}<div
                                          >
                                            {diagnostic.details}
                                          </div>{/if}
                                      </div>
                                    {/if}
                                    <details>
                                      <summary><Label label={adminRes.string.PaymentRaw} /></summary>
                                      <pre>{JSON.stringify(operation, null, 2)}</pre>
                                    </details></td
                                  >
                                </tr>
                              {/each}
                            </tbody>
                          </table>
                        </td></tr
                      >
                    {/if}
                  {/if}
                {/each}
              </tbody>
            </table>
          {/if}
        </div>
        <div class="pagination">
          <span><Label label={adminRes.string.Total} />: {rowCount}</span>
          <Button
            label={adminRes.string.Previous}
            size="small"
            kind="regular"
            disabled={page === 0}
            on:click={() => (page -= 1)}
          />
          <span>{page + 1} / {pageCount}</span>
          <Button
            label={adminRes.string.Next}
            size="small"
            kind="regular"
            disabled={page + 1 >= pageCount}
            on:click={() => (page += 1)}
          />
        </div>
      {/if}
    {/if}
  {/if}
</div>

<style lang="scss">
  .payments-panel {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 0.5rem 0;
  }
  .toolbar,
  .filter,
  .pagination {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .filter,
  .scope,
  .pagination {
    font-size: 0.75rem;
  }
  .scope {
    color: var(--theme-dark-color);
    line-height: 1.35;
  }
  .identifiers {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 1rem;
    margin-bottom: 0.375rem;
  }
  .identifier {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .reason {
    max-width: 18rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .event-reason {
    max-width: 32rem;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .error {
    color: var(--theme-error-color);
    font-size: 0.8125rem;
  }
  select {
    min-height: 1.5rem;
    max-width: 13rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.25rem;
    background: var(--theme-bg-color);
    color: var(--theme-content-color);
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.5rem;
  }
  .kpi {
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.5rem;
    padding: 0.5rem 0.75rem;
  }
  .kpi strong {
    display: block;
    font-size: 1.125rem;
    margin-top: 0.25rem;
    font-variant-numeric: tabular-nums;
  }
  .table-scroll {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;
  }
  th,
  td {
    height: 27px;
    padding: 0.125rem 0.375rem;
    text-align: left;
    border-bottom: 1px solid var(--theme-divider-color);
    white-space: nowrap;
  }
  th {
    color: var(--theme-dark-color);
    font-weight: 500;
  }
  .number {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .mono {
    font-family: monospace;
    font-size: 0.6875rem;
  }
  .attention td:first-child {
    border-left: 2px solid var(--theme-error-color);
  }
  .expanded > td {
    padding: 0.5rem 1rem;
    background: var(--theme-comp-header-color);
  }
  summary {
    cursor: pointer;
  }
  pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-width: 55rem;
    max-height: 20rem;
    overflow: auto;
    font-size: 0.6875rem;
  }
  .pagination {
    justify-content: flex-end;
  }
  .empty {
    padding: 1rem 0;
    color: var(--theme-dark-color);
  }
  @media (max-width: 700px) {
    .kpis {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
