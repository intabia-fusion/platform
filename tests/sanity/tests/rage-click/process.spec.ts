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

import type { WorkspaceLoginInfo } from '@hcengineering/account'
import { createRestTxOperations } from '@hcengineering/api-client'
import core, { ClassifierKind, generateId as generateCoreId, type Class, type Doc, type Ref } from '@hcengineering/core'
import { makeRank } from '@hcengineering/rank'
import { type APIRequestContext, expect, type FileChooser, type Page } from '@playwright/test'
import { ApiEndpoint } from '../API/Api'
import { test } from '../fixtures'
import { SettingsPage } from '../model/settings-page'
import { WorkflowPage } from '../model/workflow-page'
import {
  DefaultWorkspace,
  DevUrl,
  generateId,
  LocalUrl,
  loginByToken,
  PlatformSetting,
  PlatformURI,
  PlatformUser,
  rageClick
} from '../utils'
import { enableJsonProtocol, trackTxFrames, type TxFrame } from './tx-frames'

test.use({
  storageState: PlatformSetting
})

async function openTrackerWorkflowType (page: Page, typeName: string): Promise<WorkflowPage> {
  const settings = new SettingsPage(page)
  const workflows = new WorkflowPage(page)
  await settings.openProfileMenu()
  await settings.openSettings()
  await settings.createSpaceType(typeName, 'Tracker')
  await settings.selectSpaceType(typeName, 'Tracker')
  return workflows
}

// Settings -> Types -> Create Type: lands on the new Master Tag's editor page.
async function createCardType (page: Page, typeName: string): Promise<void> {
  const settings = new SettingsPage(page)
  await settings.openProfileMenu()
  await settings.openSettings()
  await page.getByRole('button', { name: 'Types', exact: true }).click()
  await page.locator('#new-master-tag').last().click()
  const createDialog = page.locator('form[id="card:string:CreateMasterTag"]')
  await createDialog.getByPlaceholder('Name').fill(typeName)
  await createDialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(createDialog).toHaveCount(0)
}

// Settings -> Types -> new Master Tag is several seconds of UI and never the thing under test for
// the tests below that only poke at its Processes section - share one across them. The Types list
// has 100+ accumulated types on this shared stand (see the "View options" test), so a later test
// navigates back to it by URL instead of clicking it by name in that list.
let sharedCardType: Promise<{ typeName: string, url: string }> | undefined
async function openSharedCardType (page: Page): Promise<string> {
  const reuse = sharedCardType !== undefined
  sharedCardType ??= (async () => {
    const typeName = `Card Type-${generateId(5)}`
    await createCardType(page, typeName)
    return { typeName, url: page.url() }
  })()
  const { typeName, url } = await sharedCardType
  if (reuse) await (await page.goto(url))?.finished()
  return typeName
}

// Same reasoning as openSharedCardType above, for the Tracker space type the workflow/screen tests share.
let sharedTrackerType: Promise<string> | undefined
async function openSharedTrackerType (page: Page): Promise<{ typeName: string, workflows: WorkflowPage }> {
  const reuse = sharedTrackerType !== undefined
  sharedTrackerType ??= (async () => {
    const typeName = `WF Type-${generateId(5)}`
    await openTrackerWorkflowType(page, typeName)
    return typeName
  })()
  const typeName = await sharedTrackerType
  if (reuse) {
    const settings = new SettingsPage(page)
    await settings.openProfileMenu()
    await settings.openSettings()
    await settings.selectSpaceType(typeName, 'Tracker')
  }
  return { typeName, workflows: new WorkflowPage(page) }
}

// watchSentTx() used to be a local copy of this; now shared as enableJsonProtocol()/trackTxFrames()
// in ./tx-frames.ts (see its header comment for why JSON-protocol + wire counting is needed here).
async function watchSentTx (page: Page): Promise<TxFrame[]> {
  await enableJsonProtocol(page)
  return trackTxFrames(page).frames
}

function txCount (txs: TxFrame[], txClass: string, objectClass: string, since = 0): number {
  return txs.slice(since).filter((t) => t._class === txClass && t.objectClass === objectClass).length
}

// The click resolves as soon as the DOM event dispatches, not once the async handler's network
// call has actually gone out - poll for it, then hold briefly so a duplicate the guard should have
// blocked has time to show up before trusting the count. `since` excludes tx's from setup steps
// that legitimately hit the same tx/object class before the action under test runs.
async function expectSettledTxCount (
  page: Page,
  txs: TxFrame[],
  txClass: string,
  objectClass: string,
  expected: number,
  since = 0
): Promise<void> {
  await expect.poll(() => txCount(txs, txClass, objectClass, since)).toBeGreaterThanOrEqual(expected)
  await page.waitForTimeout(500)
  expect(txCount(txs, txClass, objectClass, since)).toBe(expected)
}

// FUSIO-1584: a rage click on an async button runs its action once, and the button works again after.
test.describe('Rage click: process', () => {
  test.beforeEach(async ({ page }) => {
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws`))?.finished()
  })

  test('Workflow transition Remove opens one confirmation', async ({ page }) => {
    const workflowName = `Main-${generateId(5)}`
    const { workflows } = await openSharedTrackerType(page)

    await workflows.createWorkflow(workflowName)
    await workflows.openWorkflow(workflowName)
    await workflows.addTransition('Plan', ['Backlog'], 'Todo')
    await workflows.openTransition('Plan')

    await rageClick(workflows.removeTransitionButton())
    // Without the `removing` guard, 3 rapid clicks stack 3 identical confirmation popups.
    await expect(workflows.confirmDialog()).toHaveCount(1)

    // Dismiss without confirming, then check the button still works (not stuck). Escape closes
    // the aside behind the dialog too (same popup-stack handler), so use Cancel instead.
    await workflows.confirmDialog().getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(workflows.confirmDialog()).toHaveCount(0)
    await expect(workflows.removeTransitionButton()).toBeEnabled()
    await workflows.removeTransitionButton().click()
    await expect(workflows.confirmDialog()).toHaveCount(1)

    // Confirm for real: the transition is removed exactly once.
    await workflows.confirmButton().click()
    await expect(workflows.confirmDialog()).toHaveCount(0)
    await expect(workflows.transitionRow('Plan')).toHaveCount(0)
  })

  test('Screen "+ Add Tab" creates one tab', async ({ page }) => {
    const screenName = `Screen-${generateId(5)}`
    const { workflows } = await openSharedTrackerType(page)

    await workflows.createScreen(screenName, 'Classic Issue')
    await workflows.screenRow(screenName).click()

    const addTabButton = page.getByRole('button', { name: '+ Add Tab', exact: true })
    const tabEditors = page.locator('div.hulyTableAttr-container.editor')
    // Usually 0, but under load a fresh screen can still be settling its own query; read whatever
    // it actually is rather than assume, and check deltas from there.
    const initialCount = await tabEditors.count()

    await rageClick(addTabButton)
    // Without the `addingTab` guard, 3 rapid clicks create 3 duplicate tabs.
    await expect(tabEditors).toHaveCount(initialCount + 1)

    // The button works again afterwards.
    await expect(addTabButton).toBeEnabled()
    await addTabButton.click()
    await expect(tabEditors).toHaveCount(initialCount + 2)
  })

  test('Master Tag "Processes +" creates one process', async ({ page }) => {
    const typeName = await openSharedCardType(page)

    const processesHeader = page.locator('div.hulyTableAttr-header', { hasText: 'Processes' })
    const addProcessButton = processesHeader.locator('button[data-id="btnAdd"]')
    await expect(addProcessButton).toBeVisible()

    const backToType = page.locator('button.hulyBreadcrumb-container', { hasText: typeName })
    const processRows = processesHeader.locator('xpath=..').locator('button.hulyTableAttr-content__row')
    // The shared type may already carry processes from earlier tests - count from here, not from 0.
    const initialCount = await processRows.count()

    await rageClick(addProcessButton)
    // Without the `adding` guard, 3 rapid clicks create 3 duplicate Process+State+Transition triples.
    // `add()` navigates into the created process (replacing history), so use the breadcrumb to get
    // back to the type and count what is left.
    await expect(page.getByRole('button', { name: 'Add state', exact: true })).toBeVisible()
    await backToType.click()
    await expect(processRows).toHaveCount(initialCount + 1)
    await expect(processRows.nth(initialCount)).toHaveText('New process')

    // The button works again afterwards.
    await expect(addProcessButton).toBeEnabled()
    await addProcessButton.click()
    await expect(page.getByRole('button', { name: 'Add state', exact: true })).toBeVisible()
    await backToType.click()
    await expect(processRows).toHaveCount(initialCount + 2)
  })

  test('Process "Add state" creates one state', async ({ page }) => {
    await openSharedCardType(page)

    await page.locator('div.hulyTableAttr-header', { hasText: 'Processes' }).locator('button[data-id="btnAdd"]').click()

    const statesBox = page.locator('div.hulyTableAttr-container', { hasText: 'States' }).first()
    const addStateButton = statesBox.getByRole('button', { name: 'Add state', exact: true })
    const stateRows = statesBox.locator('div.container')
    // The initial process already comes with one state ("New state") from ProcessesSection.add().
    await expect(stateRows).toHaveCount(1)

    await rageClick(addStateButton)
    // Without the `adding` guard, 3 rapid clicks create 3 duplicate states.
    await expect(stateRows).toHaveCount(2)

    // The button works again afterwards.
    await expect(addStateButton).toBeEnabled()
    await addStateButton.click()
    await expect(stateRows).toHaveCount(3)
  })

  test('Types "Import" opens one file picker', async ({ page }) => {
    const settings = new SettingsPage(page)
    await settings.openProfileMenu()
    await settings.openSettings()
    await page.getByRole('button', { name: 'Types', exact: true }).click()

    const importButton = page.locator('#new-master-tag').first()
    const choosers: FileChooser[] = []
    page.on('filechooser', (fc) => choosers.push(fc))

    await rageClick(importButton)
    // The dynamic `import()` suspends before the busy flag check matters: the flag is set
    // synchronously before that await, so 3 rapid clicks still open exactly one file picker.
    await expect.poll(() => choosers.length).toBeGreaterThan(0)
    await page.waitForTimeout(500)
    expect(choosers.length).toBe(1)

    // The button works again afterwards.
    await expect(importButton).toBeEnabled()
    await importButton.click()
    await expect.poll(() => choosers.length).toBe(2)
  })
})

// These buttons remove a doc with no confirmation popup and no local-array mutation to block a
// re-entrant call, so the DOM ends up identical whether the guard fired once or the handler ran
// several times. Count the wire-level `tx` requests instead - see watchSentTx() above.
test.describe('Rage click: process (wire tx count)', () => {
  test.use({
    storageState: PlatformSetting
  })

  test('Process State delete removes it once', async ({ page }) => {
    const txs = await watchSentTx(page)
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws`))?.finished()

    await openSharedCardType(page)
    await page.locator('div.hulyTableAttr-header', { hasText: 'Processes' }).locator('button[data-id="btnAdd"]').click()

    const statesBox = page.locator('div.hulyTableAttr-container', { hasText: 'States' }).first()
    const addStateButton = statesBox.getByRole('button', { name: 'Add state', exact: true })
    const stateRows = statesBox.locator('div.container')
    // getByRole excludes it (the delete icon is CSS `visibility: hidden` until the row is
    // hovered); a plain CSS locator still finds it, and rageClick/evaluate does not need hover.
    const deleteButton = (): ReturnType<Page['locator']> => stateRows.first().locator('button')

    // A second state so the "works again" check below has something left to delete.
    await addStateButton.click()
    await expect(stateRows).toHaveCount(2)

    await rageClick(deleteButton())
    // Without the `deleting` guard, 3 rapid clicks each call `client.remove(value)` directly (no
    // popup, no local mutation) - a real duplicate-remove race observable only on the wire.
    await expect(stateRows).toHaveCount(1)
    await expectSettledTxCount(page, txs, 'core:class:TxRemoveDoc', 'process:class:State', 1)

    // The button works again afterwards (a different state, same component). A plain `.click()`
    // needs the row hovered first - the icon is hidden until then.
    await stateRows.first().hover()
    await deleteButton().click()
    await expect(stateRows).toHaveCount(0)
    await expectSettledTxCount(page, txs, 'core:class:TxRemoveDoc', 'process:class:State', 2)
  })

  test('Transition header delete removes it once', async ({ page }) => {
    const txs = await watchSentTx(page)
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws`))?.finished()

    await openSharedCardType(page)
    await page.locator('div.hulyTableAttr-header', { hasText: 'Processes' }).locator('button[data-id="btnAdd"]').click()

    // A second state, so a second transition can be added (the first "from: null" slot is taken
    // by the transition ProcessesSection.add() already created).
    await page
      .locator('div.hulyTableAttr-container', { hasText: 'States' })
      .first()
      .getByRole('button', { name: 'Add state', exact: true })
      .click()

    const transitionsBox = page.locator('div.hulyTableAttr-container', { hasText: 'Transitions' }).first()
    await transitionsBox.getByRole('button', { name: 'Add transition', exact: true }).click()
    const addForm = page.locator('form[id="process:string:AddTransition"]')
    await addForm.getByRole('button', { name: 'From', exact: true }).click()
    await page.locator('div.selectPopup button.menu-item').first().click()
    await addForm.getByRole('button', { name: 'To', exact: true }).click()
    await page.locator('div.selectPopup button.menu-item').last().click()
    await addForm.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(addForm).toHaveCount(0)
    await expect(transitionsBox.locator('button')).toHaveCount(3) // 2 transition rows + "Add transition"

    const transitionRow = (index: number): ReturnType<Page['locator']> => transitionsBox.locator('button').nth(index)
    const headerDelete = page
      .locator('div.hulyComponent-content .header')
      .getByRole('button', { name: 'Delete', exact: true })

    await transitionRow(0).click()
    await expect(headerDelete).toBeVisible()

    await rageClick(headerDelete)
    // Without the `deleting` guard, 3 rapid clicks each call `client.remove(value)` + navigate
    // directly (no popup) - a real duplicate-remove race observable only on the wire. A
    // successful delete navigates back to the Process editor.
    await expect(transitionsBox.locator('button')).toHaveCount(2)
    await expectSettledTxCount(page, txs, 'core:class:TxRemoveDoc', 'process:class:Transition', 1)

    // The button works again afterwards (the remaining transition, same component).
    await transitionRow(0).click()
    await expect(headerDelete).toBeVisible()
    await headerDelete.click()
    await expect(transitionsBox.locator('button')).toHaveCount(1)
    await expectSettledTxCount(page, txs, 'core:class:TxRemoveDoc', 'process:class:Transition', 2)
  })

  test('Process delete removes it once', async ({ page }) => {
    const txs = await watchSentTx(page)
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws`))?.finished()

    const typeName = `Card Type-${generateId(5)}`
    await createCardType(page, typeName)

    const processesHeader = page.locator('div.hulyTableAttr-header', { hasText: 'Processes' })
    const addProcessButton = processesHeader.locator('button[data-id="btnAdd"]')
    const backToType = page.locator('button.hulyBreadcrumb-container', { hasText: typeName })
    const processRows = processesHeader.locator('xpath=..').locator('button.hulyTableAttr-content__row')
    const processHeaderDelete = page
      .locator('div.hulyComponent-content .header')
      .getByRole('button', { name: 'Delete', exact: true })

    // Two processes, so the "works again" check below has something left to delete. Wait for each
    // `add()` to fully land on the created process (its 3 sequential creates all resolved, `adding`
    // reset) before navigating back - the button briefly stays disabled mid-create otherwise.
    await addProcessButton.click()
    await expect(processHeaderDelete).toBeVisible()
    await backToType.click()
    await addProcessButton.click()
    await expect(processHeaderDelete).toBeVisible()
    await backToType.click()
    await expect(processRows).toHaveCount(2)

    await processRows.first().click()
    await expect(processHeaderDelete).toBeVisible()

    await rageClick(processHeaderDelete)
    // No running Execution on a never-run process -> handleDelete's `findOne` resolves "no
    // execution" and deleteProcess() runs directly, no popup. Without the `deleting` guard, 3
    // rapid clicks race 3 concurrent finds + 3 `client.remove` calls - observable only on the wire.
    await expect(backToType).toBeVisible()
    await expect(processRows).toHaveCount(1)
    await expectSettledTxCount(page, txs, 'core:class:TxRemoveDoc', 'process:class:Process', 1)

    // The button works again afterwards (the remaining process, same component).
    await processRows.first().click()
    await expect(processHeaderDelete).toBeVisible()
    await processHeaderDelete.click()
    await expect(processRows).toHaveCount(0)
    await expectSettledTxCount(page, txs, 'core:class:TxRemoveDoc', 'process:class:Process', 2)
  })

  // Settings -> Types -> Create Type -> Processes "+" -> opens a process with one state and one
  // transition (from: null). A second state + transition are added so each test has two of
  // whatever it deletes, to check the button works again afterwards.
  async function createProcessWithTwoTransitions (page: Page): Promise<void> {
    await openSharedCardType(page)
    await page.locator('div.hulyTableAttr-header', { hasText: 'Processes' }).locator('button[data-id="btnAdd"]').click()
    await page
      .locator('div.hulyTableAttr-container', { hasText: 'States' })
      .first()
      .getByRole('button', { name: 'Add state', exact: true })
      .click()

    const transitionsBox = page.locator('div.hulyTableAttr-container', { hasText: 'Transitions' }).first()
    await transitionsBox.getByRole('button', { name: 'Add transition', exact: true }).click()
    const addForm = page.locator('form[id="process:string:AddTransition"]')
    await addForm.getByRole('button', { name: 'From', exact: true }).click()
    await page.locator('div.selectPopup button.menu-item').first().click()
    await addForm.getByRole('button', { name: 'To', exact: true }).click()
    await page.locator('div.selectPopup button.menu-item').last().click()
    await addForm.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(addForm).toHaveCount(0)
    await expect(transitionsBox.locator('button')).toHaveCount(3) // 2 transition rows + "Add transition"
  }

  test('Transition "Trigger" aside delete removes it once', async ({ page }) => {
    const txs = await watchSentTx(page)
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws`))?.finished()

    await createProcessWithTwoTransitions(page)

    const transitionsBox = page.locator('div.hulyTableAttr-container', { hasText: 'Transitions' }).first()
    const transitionRow = (index: number): ReturnType<Page['locator']> => transitionsBox.locator('button').nth(index)
    const triggerButton = page.locator('div.hulyTableAttr-container', { hasText: 'Trigger' }).first().locator('button')
    const asideDelete = page
      .locator('div.hulyModal-container.type-aside')
      .getByRole('button', { name: 'Delete', exact: true })

    // Unlike the header delete (TransitionEditor.handleDelete), this one only closes the aside
    // (`clearSettingsStore()`) - it does not navigate the underlying Transition page away, and that
    // page goes blank once its doc is gone. The breadcrumb's 2nd item (the process) gets back.
    const backToProcess = page.locator('button.hulyBreadcrumb-container').nth(1)

    await transitionRow(0).click()
    await triggerButton.click()
    await expect(asideDelete).toBeVisible()

    await rageClick(asideDelete)
    // Without the `removing` guard, 3 rapid clicks each call `client.remove(transition)` directly
    // (no popup) - a real duplicate-remove race observable only on the wire.
    await expect(asideDelete).toHaveCount(0)
    await backToProcess.click()
    await expect(transitionsBox.locator('button')).toHaveCount(2)
    await expectSettledTxCount(page, txs, 'core:class:TxRemoveDoc', 'process:class:Transition', 1)

    // The button works again afterwards (the remaining transition, same component).
    await transitionRow(0).click()
    await triggerButton.click()
    await expect(asideDelete).toBeVisible()
    await asideDelete.click()
    await expect(asideDelete).toHaveCount(0)
    await backToProcess.click()
    await expect(transitionsBox.locator('button')).toHaveCount(1)
    await expectSettledTxCount(page, txs, 'core:class:TxRemoveDoc', 'process:class:Transition', 2)
  })

  test('Transition action delete removes it once', async ({ page }) => {
    const txs = await watchSentTx(page)
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws`))?.finished()

    await createProcessWithTwoTransitions(page)

    const transitionsBox = page.locator('div.hulyTableAttr-container', { hasText: 'Transitions' }).first()
    await transitionsBox.locator('button').nth(0).click()

    const actionsBox = page.locator('div.hulyTableAttr-container', { hasText: 'Actions' }).first()
    const addActionButton = actionsBox.getByRole('button', { name: 'Add action', exact: true })
    const actionAside = page.locator('div.hulyModal-container.type-aside')
    const asideDelete = actionAside.getByRole('button', { name: 'Delete', exact: true })
    const asideClose = actionAside.getByRole('button', { name: 'Close', exact: true })

    // Two actions on the one transition, so the "works again" check has something left to delete.
    // Adding one auto-opens its aside editor (editAction()); close it (not delete) to add the next.
    await addActionButton.click()
    await page.locator('div.selectPopup button.menu-item').first().click()
    await expect(asideDelete).toBeVisible()
    await asideClose.click()
    await expect(actionAside).toHaveCount(0)
    await addActionButton.click()
    await page.locator('div.selectPopup button.menu-item').first().click()
    await expect(asideDelete).toBeVisible()
    await asideClose.click()
    await expect(actionAside).toHaveCount(0)

    // Same shape as the Transitions list: N action rows (in order) then the "Add action" button.
    const actionButtons = actionsBox.locator('button')
    await expect(actionButtons).toHaveCount(3)

    // The two adds above already sent two `actions` updates on this Transition - only count what
    // happens from here.
    const baseline = txs.length

    await actionButtons.nth(0).click()
    await expect(asideDelete).toBeVisible()

    await rageClick(asideDelete)
    // Read the code: `remove()` synchronously splices the target step out of the shared, live
    // `doc.actions` array before its only await - a re-entrant call (even without the `removing`
    // guard) would find the step already gone (index -1) and no-op. The guard is still real
    // defense in depth: assert it stays a single `actions` update on the transition either way.
    await expect(actionButtons).toHaveCount(2) // 1 action row + "Add action"
    await expectSettledTxCount(page, txs, 'core:class:TxUpdateDoc', 'process:class:Transition', 1, baseline)

    // The button works again afterwards (the remaining action, same component).
    await actionButtons.nth(0).click()
    await expect(asideDelete).toBeVisible()
    await asideDelete.click()
    await expect(actionButtons).toHaveCount(1) // just "Add action" left
    await expectSettledTxCount(page, txs, 'core:class:TxUpdateDoc', 'process:class:Transition', 2, baseline)
  })

  test('Screen tab delete removes it once', async ({ page }) => {
    const txs = await watchSentTx(page)
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws`))?.finished()

    const screenName = `Screen-${generateId(5)}`
    const { workflows } = await openSharedTrackerType(page)
    await workflows.createScreen(screenName, 'Classic Issue')
    await workflows.screenRow(screenName).click()

    const addTabButton = page.getByRole('button', { name: '+ Add Tab', exact: true })
    const tabEditors = page.locator('div.hulyTableAttr-container.editor')
    // A fresh screen already comes with one default tab ("General"); add two more so there are
    // three with no fields (canDelete = tabs.length > 1; no fields -> the direct-delete branch, no
    // confirmation popup) - enough for the rage click and the "works again" check after it.
    await expect(tabEditors).toHaveCount(1)
    await addTabButton.click()
    await addTabButton.click()
    await expect(tabEditors).toHaveCount(3)

    const tabDelete = (): ReturnType<Page['locator']> => tabEditors.first().locator('button').first()

    await rageClick(tabDelete())
    // Without the `removingTab` guard, 3 rapid clicks each call `removeScreenTab` (-> `client.remove`)
    // directly (no fields -> no popup) - a real duplicate-remove race observable only on the wire.
    await expect(tabEditors).toHaveCount(2)
    await expectSettledTxCount(page, txs, 'core:class:TxRemoveDoc', 'workflow:class:ScreenTab', 1)

    // The button works again afterwards (a different tab, same component; still 2 > 1 so canDelete).
    await tabDelete().click()
    await expect(tabEditors).toHaveCount(1)
    await expectSettledTxCount(page, txs, 'core:class:TxRemoveDoc', 'workflow:class:ScreenTab', 2)
  })

  test('Screen field delete removes it once', async ({ page }) => {
    const txs = await watchSentTx(page)
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws`))?.finished()

    const screenName = `Screen-${generateId(5)}`
    const { workflows } = await openSharedTrackerType(page)
    await workflows.createScreen(screenName, 'Classic Issue')
    await workflows.screenRow(screenName).click()

    const tabEditor = page.locator('div.hulyTableAttr-container.editor').first()
    const addFieldButton = tabEditor.getByRole('button', { name: '+ Add Field', exact: true })
    const fieldPopupItem = (index: number): ReturnType<Page['locator']> =>
      page.locator('div.selectPopup button.menu-item, .hulyPopup-container button').nth(index)

    const fieldRows = tabEditor.locator('div.hulyTableAttr-content__row')

    // Two fields, so the "works again" check has something left to delete. Wait for each add to
    // land (the popup's available-fields list excludes it next) before opening the popup again.
    await addFieldButton.click()
    await fieldPopupItem(0).click()
    await expect(fieldRows).toHaveCount(1)
    await addFieldButton.click()
    await fieldPopupItem(0).click()
    await expect(fieldRows).toHaveCount(2)
    const fieldDelete = (): ReturnType<Page['locator']> => fieldRows.first().locator('button')

    await rageClick(fieldDelete())
    // Without the per-field `removingField` guard, 3 rapid clicks each call `removeScreenField`
    // (-> `client.remove`) directly, no popup - a real duplicate-remove race observable only on
    // the wire.
    await expect(fieldRows).toHaveCount(1)
    await expectSettledTxCount(page, txs, 'core:class:TxRemoveDoc', 'workflow:class:ScreenField', 1)

    // The button works again afterwards (the remaining field, same component).
    await fieldDelete().click()
    await expect(fieldRows).toHaveCount(0)
    await expectSettledTxCount(page, txs, 'core:class:TxRemoveDoc', 'workflow:class:ScreenField', 2)
  })
})

// Logs into the persistent sanity-ws (same account as PlatformSetting) over REST, to set up a
// Master Tag + Card + Process via client.createDoc instead of clicking through Settings/Cards -
// RunProcessPopup is the thing under test, not Card/Process creation.
async function loginToSanityWs (request: APIRequestContext): Promise<WorkspaceLoginInfo> {
  const api = new ApiEndpoint(request)
  const token = await api.loginAndGetToken(PlatformUser, '1234')
  const baseUrl = typeof DevUrl === 'string' && DevUrl.trim() !== '' ? DevUrl : LocalUrl
  const response = await request.post(baseUrl, {
    data: { method: 'selectWorkspace', params: { workspaceUrl: DefaultWorkspace } },
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  })
  const body = await response.json()
  if (body?.result?.token == null) throw new Error(`selectWorkspace failed: ${JSON.stringify(body?.error ?? body)}`)
  return body.result as WorkspaceLoginInfo
}

// A fresh Master Tag + one empty Card of that type, ready for a Process to be run on it.
async function createTypeAndCard (
  ws: WorkspaceLoginInfo,
  typeName: string,
  cardTitle: string
): Promise<{ typeId: Ref<Class<Doc>>, cardId: Ref<Doc> }> {
  const client = await createRestTxOperations(ws.endpoint, ws.workspace, ws.token as string)
  try {
    const typeId = generateCoreId() as unknown as Ref<Class<Doc>>
    await client.createDoc(
      'card:class:MasterTag' as Ref<Class<Doc>>,
      core.space.Model,
      {
        extends: 'card:class:Card' as Ref<Class<Doc>>,
        label: `embedded:embedded:${typeName}`,
        kind: ClassifierKind.CLASS,
        background: 1
      } as any,
      typeId as any
    )
    const cardId = (await client.createDoc(typeId as any, core.space.Workspace, {
      title: cardTitle,
      rank: '',
      content: '',
      parentInfo: [],
      blobs: {}
    } as any)) as unknown as Ref<Doc>
    return { typeId, cardId }
  } finally {
    await client.close()
  }
}

// A Process with one state and one `OnExecutionStart` transition (same shape ProcessesSection.add()
// creates) on the given Master Tag, with no actions - RunProcessPopup only needs it to be runnable.
async function createRunnableProcess (ws: WorkspaceLoginInfo, typeId: Ref<Class<Doc>>, name: string): Promise<void> {
  const client = await createRestTxOperations(ws.endpoint, ws.workspace, ws.token as string)
  try {
    const processId = await client.createDoc('process:class:Process' as Ref<Class<Doc>>, core.space.Model, {
      name,
      masterTag: typeId,
      context: {},
      description: ''
    } as any)
    const initStateId = generateCoreId() as any
    await client.createDoc(
      'process:class:State' as Ref<Class<Doc>>,
      core.space.Model,
      { process: processId, rank: makeRank(undefined, undefined), title: 'New state' } as any,
      initStateId
    )
    await client.createDoc('process:class:Transition' as Ref<Class<Doc>>, core.space.Model, {
      process: processId,
      from: null,
      to: initStateId,
      trigger: 'process:trigger:OnExecutionStart',
      rank: makeRank(undefined, undefined),
      actions: [],
      triggerParams: {}
    } as any)
  } finally {
    await client.close()
  }
}

test.describe('Rage click: process (executions)', () => {
  test('RunProcessPopup starts one execution', async ({ page, request }) => {
    const ws = await loginToSanityWs(request)
    const typeName = `Exec Type-${generateId(5)}`
    const processName = `Exec Process-${generateId(5)}`
    const { typeId, cardId } = await createTypeAndCard(ws, typeName, `Exec Card-${generateId(5)}`)
    await createRunnableProcess(ws, typeId, processName)

    const txs = await watchSentTx(page)
    await loginByToken(page, ws.token as string, ws)
    await page.goto(`${PlatformURI}/workbench/${ws.workspaceUrl}/card/${cardId}`)

    const runProcessButton = page.locator('[id="process:string:RunProcess"]')
    await expect(runProcessButton).toBeVisible()
    await runProcessButton.click()
    const processItem = page.locator('.antiPopup button.ap-menuItem', { hasText: processName })
    await expect(processItem).toBeVisible()

    await rageClick(processItem)
    // Without the `running` guard, 3 rapid clicks each call `createExecution` + `client.tx` - a
    // real duplicate-execution race, observable on the wire as extra TxCreateDoc(Execution).
    await expectSettledTxCount(page, txs, 'core:class:TxCreateDoc', 'process:class:Execution', 1)

    // The button works again afterwards (the popup closes on run; reopen and run once more).
    await runProcessButton.click()
    await expect(processItem).toBeVisible()
    await processItem.click()
    await expectSettledTxCount(page, txs, 'core:class:TxCreateDoc', 'process:class:Execution', 2)
  })
})

// A Tag (mixin) applied to the given Card, so its TagAttributes section renders.
async function createAndApplyTag (
  ws: WorkspaceLoginInfo,
  typeId: Ref<Class<Doc>>,
  cardId: Ref<Doc>,
  tagName: string
): Promise<void> {
  const client = await createRestTxOperations(ws.endpoint, ws.workspace, ws.token as string)
  try {
    const tagId = generateCoreId() as unknown as Ref<Class<Doc>>
    await client.createDoc(
      'card:class:Tag' as Ref<Class<Doc>>,
      core.space.Model,
      {
        extends: 'card:class:Card' as Ref<Class<Doc>>,
        label: `embedded:embedded:${tagName}`,
        kind: ClassifierKind.MIXIN,
        background: 1
      } as any,
      tagId as any
    )
    await client.createMixin(cardId as any, typeId as any, core.space.Workspace, tagId as any, {} as any)
  } finally {
    await client.close()
  }
}

// A Master Tag with the VersionableClass mixin enabled, and one Card of it marked as the latest
// version (baseId pointing at itself, same as a freshly created version-1 card would be) - the
// minimum CardVersionSelector needs to show its "New version" button.
async function createVersionableTypeAndCard (
  ws: WorkspaceLoginInfo,
  typeName: string,
  cardTitle: string
): Promise<{ typeId: Ref<Class<Doc>>, cardId: Ref<Doc> }> {
  const client = await createRestTxOperations(ws.endpoint, ws.workspace, ws.token as string)
  try {
    const typeId = generateCoreId() as unknown as Ref<Class<Doc>>
    await client.createDoc(
      'card:class:MasterTag' as Ref<Class<Doc>>,
      core.space.Model,
      {
        extends: 'card:class:Card' as Ref<Class<Doc>>,
        label: `embedded:embedded:${typeName}`,
        kind: ClassifierKind.CLASS,
        background: 1
      } as any,
      typeId as any
    )
    await client.createMixin(
      typeId as any,
      'card:class:MasterTag' as any,
      core.space.Model,
      core.mixin.VersionableClass,
      {
        excludedRelations: [],
        excludedProperties: [],
        excludeMixins: [],
        enabled: true
      } as any
    )
    const cardId = generateCoreId() as unknown as Ref<Doc>
    await client.createDoc(
      typeId as any,
      core.space.Workspace,
      {
        title: cardTitle,
        rank: '',
        content: '',
        parentInfo: [],
        blobs: {},
        baseId: cardId,
        version: 1,
        isLatest: true
      } as any,
      cardId as any
    )
    return { typeId, cardId }
  } finally {
    await client.close()
  }
}

test.describe('Rage click: process (card mixins)', () => {
  test('Card icon picker opens once', async ({ page, request }) => {
    const ws = await loginToSanityWs(request)
    const typeName = `Icon Type-${generateId(5)}`
    const { cardId } = await createTypeAndCard(ws, typeName, `Icon Card-${generateId(5)}`)

    await loginByToken(page, ws.token as string, ws)
    await page.goto(`${PlatformURI}/workbench/${ws.workspaceUrl}/card/${cardId}`)

    const header = page.locator('div.masterTag div.header').first()
    const iconButton = header.locator('div.label button')
    const popup = page.locator('div.hulyPopup-container')
    await expect(iconButton).toBeVisible()

    await rageClick(iconButton)
    // Without the `choosingIcon` guard, 3 rapid clicks each call `showPopup(IconPicker, ...)`
    // directly - a real duplicate-popup race, same shape as the workflow AsideTransitionEditor case.
    await expect(popup).toHaveCount(1)

    await page.keyboard.press('Escape')
    await expect(popup).toHaveCount(0)
    await header.hover()
    await expect(iconButton).toBeEnabled()
    await iconButton.click()
    await expect(popup).toHaveCount(1)
  })

  test('Master Tag section lock toggles once', async ({ page, request }) => {
    const ws = await loginToSanityWs(request)
    const typeName = `Lock Type-${generateId(5)}`
    const { typeId, cardId } = await createTypeAndCard(ws, typeName, `Lock Card-${generateId(5)}`)

    const txs = await watchSentTx(page)
    await loginByToken(page, ws.token as string, ws)
    await page.goto(`${PlatformURI}/workbench/${ws.workspaceUrl}/card/${cardId}`)

    const header = page.locator('div.masterTag div.header').first()
    const lockButton = header.locator('div.btns div.lock-btn button')
    await header.hover()
    await expect(lockButton).toBeVisible()

    const pushCount = (): number =>
      txs.filter(
        (t) =>
          t._class === 'core:class:TxUpdateDoc' &&
          t.objectId === cardId &&
          (t.operations as any)?.$push?.readonlySections === typeId
      ).length
    const pullCount = (): number =>
      txs.filter(
        (t) =>
          t._class === 'core:class:TxUpdateDoc' &&
          t.objectId === cardId &&
          (t.operations as any)?.$pull?.readonlySections === typeId
      ).length

    await rageClick(lockButton)
    // Without the `toggling` guard, 3 rapid clicks each call `client.update(value, {$push: ...})`
    // directly - Mongo's $push has no dedup, so without the guard the ref is pushed 2-3 times and
    // a single later unlock click leaves it still locked (the real bug this guards against).
    await expect.poll(pushCount).toBeGreaterThanOrEqual(1)
    await page.waitForTimeout(500)
    expect(pushCount()).toBe(1)

    // The button works again afterwards: now locked, the same button unlocks with $pull.
    await header.hover()
    await lockButton.click()
    await expect.poll(pullCount).toBeGreaterThanOrEqual(1)
    await page.waitForTimeout(500)
    expect(pullCount()).toBe(1)
  })

  test('Tag section lock toggles once', async ({ page, request }) => {
    const ws = await loginToSanityWs(request)
    const typeName = `TagLock Type-${generateId(5)}`
    const tagName = `TagLock Tag-${generateId(5)}`
    const { typeId, cardId } = await createTypeAndCard(ws, typeName, `TagLock Card-${generateId(5)}`)
    await createAndApplyTag(ws, typeId, cardId, tagName)

    const txs = await watchSentTx(page)
    await loginByToken(page, ws.token as string, ws)
    await page.goto(`${PlatformURI}/workbench/${ws.workspaceUrl}/card/${cardId}`)

    const header = page.locator('div.tag div.header').first()
    const lockButton = header.locator('div.btns div.lock-btn button')
    await header.hover()
    await expect(lockButton).toBeVisible()

    const pushCount = (): number =>
      txs.filter(
        (t) =>
          t._class === 'core:class:TxUpdateDoc' &&
          t.objectId === cardId &&
          (t.operations as any)?.$push?.readonlySections !== undefined
      ).length

    await rageClick(lockButton)
    // Same race as Master Tag section lock, scoped to this Tag's own `readonlySections` ref.
    await expect.poll(pushCount).toBeGreaterThanOrEqual(1)
    await page.waitForTimeout(500)
    expect(pushCount()).toBe(1)

    // The button works again afterwards (now locked -> unlock), observable via the row state.
    await header.hover()
    await lockButton.click()
    await expect
      .poll(() => txs.filter((t) => t._class === 'core:class:TxUpdateDoc' && t.objectId === cardId).length)
      .toBeGreaterThanOrEqual(2)
  })

  test('Create child card creates one card', async ({ page, request }) => {
    const ws = await loginToSanityWs(request)
    const typeName = `Child Type-${generateId(5)}`
    const cardTitle = `Child Card-${generateId(5)}`
    const { typeId, cardId } = await createTypeAndCard(ws, typeName, cardTitle)
    // The Children section only renders once the card already has at least one
    // (`checkChildrenSectionVisibility`: `(doc.children ?? 0) > 0`) - seed one directly.
    const seedClient = await createRestTxOperations(ws.endpoint, ws.workspace, ws.token as string)
    await seedClient.createDoc(typeId as any, core.space.Workspace, {
      title: 'First child',
      rank: '',
      content: '',
      blobs: {},
      parent: cardId,
      parentInfo: [{ _id: cardId, _class: typeId, title: cardTitle }]
    } as any)
    await seedClient.close()

    const txs = await watchSentTx(page)
    await loginByToken(page, ws.token as string, ws)
    await page.goto(`${PlatformURI}/workbench/${ws.workspaceUrl}/card/${cardId}`)

    const addChildButton = page.locator('#add-child-card')
    await expect(addChildButton).toBeVisible()
    const baseline = txs.length

    await rageClick(addChildButton)
    // Without the `creatingChildCard` guard, 3 rapid clicks each call `createChildCard` directly -
    // a real duplicate-doc race, same shape as CreateCardButton/ProcessesSection.add(). A
    // successful create navigates to the new child, away from the parent's own "+" button.
    await expectSettledTxCount(page, txs, 'core:class:TxCreateDoc', typeId, 1, baseline)

    // The button works again afterwards (back on the parent, same component).
    await page.goto(`${PlatformURI}/workbench/${ws.workspaceUrl}/card/${cardId}`)
    await expect(addChildButton).toBeEnabled()
    await addChildButton.click()
    await expectSettledTxCount(page, txs, 'core:class:TxCreateDoc', typeId, 2, baseline)
  })

  test('New version creates one card', async ({ page, request }) => {
    const ws = await loginToSanityWs(request)
    const typeName = `Ver Type-${generateId(5)}`
    const { typeId, cardId } = await createVersionableTypeAndCard(ws, typeName, `Ver Card-${generateId(5)}`)

    const txs = await watchSentTx(page)
    await loginByToken(page, ws.token as string, ws)
    await page.goto(`${PlatformURI}/workbench/${ws.workspaceUrl}/card/${cardId}`)

    const newVersionButton = page.getByRole('button', { name: 'New version', exact: true })
    await expect(newVersionButton).toBeVisible()

    await rageClick(newVersionButton)
    // Without the `creatingVersion` guard, 3 rapid clicks each call `createNewVersion` directly -
    // a real duplicate-doc race (orphaned duplicate versions), same shape as ProcessesSection.add().
    await expectSettledTxCount(page, txs, 'core:class:TxCreateDoc', typeId, 1)
  })

  test('View options button opens once', async ({ page, request }) => {
    const ws = await loginToSanityWs(request)
    const typeName = `View Type-${generateId(5)}`
    const client = await createRestTxOperations(ws.endpoint, ws.workspace, ws.token as string)
    const typeId = generateCoreId() as unknown as Ref<Class<Doc>>
    await client.createDoc(
      'card:class:MasterTag' as Ref<Class<Doc>>,
      core.space.Model,
      {
        extends: 'card:class:Card' as Ref<Class<Doc>>,
        label: `embedded:embedded:${typeName}`,
        kind: ClassifierKind.CLASS,
        background: 1
      } as any,
      typeId as any
    )
    // ViewOptionsButton only renders when `viewlet.viewOptions !== undefined` - the Table
    // descriptor's default is undefined (CreateView.svelte's getViewOptions()), List's is not.
    await client.createDoc('view:class:Viewlet' as Ref<Class<Doc>>, core.space.Model, {
      title: 'My View',
      attachTo: typeId,
      descriptor: 'view:viewlet:List',
      config: [{ key: '' }, 'createdBy', 'modifiedOn'],
      configOptions: {},
      viewOptions: { groupBy: ['_class'], orderBy: [], other: [] }
    } as any)
    await client.close()

    // Straight to the type's own editor page (same place ManageMasterTagsTools.handleAdd lands on
    // after creating a type) - the sidebar list has 100+ accumulated types on this shared stand,
    // and scrolling to click one by name is unreliable.
    await loginByToken(page, ws.token as string, ws)
    await (await page.goto(`${PlatformURI}/workbench/${ws.workspaceUrl}/setting/types/${typeId}`))?.finished()
    await page
      .locator('div.hulyTableAttr-header', { hasText: 'Views' })
      .locator('xpath=..')
      .locator('button.hulyTableAttr-content__row', { hasText: 'My View' })
      .click()

    const optionsButton = page.locator('[data-id="btn-viewOptions"]')
    const optionsPopup = page.locator('div.selectPopup, div.hulyPopup-container, div.popup')
    await expect(optionsButton).toBeVisible()
    const baseline = await optionsPopup.count()

    await rageClick(optionsButton)
    // Without the `pressed` guard, 3 rapid clicks each call `showPopup(ViewOptionsEditor, ...)`
    // directly - a real duplicate-popup race (two overlapping option editors at the same anchor,
    // last-closed-wins overwrite of view options - the actual described bug).
    await expect.poll(async () => await optionsPopup.count()).toBeGreaterThan(baseline)
    await page.waitForTimeout(500)
    expect(await optionsPopup.count()).toBe(baseline + 1)

    // Escape closes the whole EditView aside behind the popup too (same popup-stack handler as
    // the other asides in this file) - click the popup's own overlay instead to dismiss just it.
    await page
      .locator('.modal-overlay')
      .last()
      .click({ position: { x: 5, y: 5 } })
    await expect(optionsPopup).toHaveCount(baseline)
    await expect(optionsButton).toBeEnabled()
    await optionsButton.click()
    expect(await optionsPopup.count()).toBe(baseline + 1)
  })

  test('Create card button creates one card', async ({ page, request }) => {
    const ws = await loginToSanityWs(request)
    const typeName = `MD Type-${generateId(5)}`
    const client = await createRestTxOperations(ws.endpoint, ws.workspace, ws.token as string)
    const typeId = generateCoreId() as unknown as Ref<Class<Doc>>
    await client.createDoc(
      'card:class:MasterTag' as Ref<Class<Doc>>,
      core.space.Model,
      {
        extends: 'card:class:Card' as Ref<Class<Doc>>,
        label: `embedded:embedded:${typeName}`,
        kind: ClassifierKind.CLASS,
        background: 1
      } as any,
      typeId as any
    )
    // `card.component.CreateCardButton` is only wired up by a user-created View whose descriptor is
    // MasterDetail (CreateView.svelte's setMasterDetailConfig()) - the built-in Table/List/etc.
    // viewlets for card.class.Card never reference it.
    await client.createDoc('view:class:Viewlet' as Ref<Class<Doc>>, core.space.Model, {
      title: 'MD View',
      attachTo: typeId,
      descriptor: 'view:viewlet:MasterDetail',
      config: [{ key: '' }, 'createdBy', 'modifiedOn'],
      configOptions: {},
      masterDetailOptions: {
        views: [
          {
            class: typeId,
            view: 'view:viewlet:Tree',
            id: generateCoreId(),
            createComponent: 'card:component:CreateCardButton'
          },
          {
            class: typeId,
            view: 'view:viewlet:Document',
            id: generateCoreId(),
            createComponent: 'card:component:CreateCardButton'
          }
        ]
      }
    } as any)
    await client.close()

    const txs = await watchSentTx(page)
    await loginByToken(page, ws.token as string, ws)
    const typeUrl = `${PlatformURI}/workbench/${ws.workspaceUrl}/card/type/${typeId}`
    await (await page.goto(typeUrl))?.finished()
    await page.locator('label[data-view="view:string:MasterDetail"]').click()

    const createButton = page.locator('button[data-id="btnCreateCard"]').first()
    await expect(createButton).toBeVisible()
    const baseline = txs.length

    await rageClick(createButton)
    // Without the `creatingCard` guard, 3 rapid clicks each call `client.createDoc` directly (this
    // type has no subtypes, so `createCard` takes the direct-create branch, no popup) - a real
    // duplicate-doc race, only the last one navigated to. A successful create also navigates away
    // to the new card, which is itself evidence the button is not stuck in its loading state.
    await expectSettledTxCount(page, txs, 'core:class:TxCreateDoc', typeId, 1, baseline)
    await expect(page).toHaveURL(/\/card\/(?!type\/)/)
  })
})
