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

import { expect, type Locator } from '@playwright/test'
import { CommonTrackerPage } from './common-tracker-page'
import { retryIntervals, waitStable } from '../../retry'

const DROP_ZONE = '[data-id="kanban-column"], [data-id="kanban-swimlane-cell"]'

export class KanbanBoardPage extends CommonTrackerPage {
  column (state: string): Locator {
    return this.page.locator(`[data-id="kanban-column"][data-state="${state}"]`)
  }

  swimLane (laneId: string): Locator {
    return this.page.locator(`[data-id="kanban-swimlane"][data-swimlane-id="${laneId}"]`)
  }

  swimLaneHeader (laneId: string): Locator {
    return this.swimLane(laneId).locator('[data-id="kanban-swimlane-header"]')
  }

  swimLaneCell (laneId: string, state: string): Locator {
    return this.page.locator(`[data-id="kanban-swimlane-cell"][data-swimlane-id="${laneId}"][data-state="${state}"]`)
  }

  card (cardId: string): Locator {
    return this.page.locator(`[data-id="kanban-card"][data-card-id="${cardId}"]`)
  }

  async expectCardInColumn (cardId: string, state: string): Promise<void> {
    // Past the column's limit the card is simply not in the DOM, and the assertion then reports it
    // as missing - other specs leave hundreds of issues in the shared project.
    await this.revealCard(cardId)
    await expect(this.column(state).locator(`[data-id="kanban-card"][data-card-id="${cardId}"]`)).toBeVisible()
  }

  async expectCardInSwimLaneCell (cardId: string, laneId: string, state: string): Promise<void> {
    await this.revealCard(cardId)
    await expect(
      this.swimLaneCell(laneId, state).locator(`[data-id="kanban-card"][data-card-id="${cardId}"]`)
    ).toBeVisible()
  }

  async toggleSwimLane (laneId: string): Promise<void> {
    await this.swimLaneHeader(laneId).click()
  }

  async isSwimLaneCollapsed (laneId: string): Promise<boolean> {
    const v = await this.swimLaneHeader(laneId).getAttribute('data-swimlane-collapsed')
    return v === 'true'
  }

  async expectSwimLaneCollapsed (laneId: string, collapsed: boolean): Promise<void> {
    await expect(this.swimLaneHeader(laneId)).toHaveAttribute('data-swimlane-collapsed', collapsed ? 'true' : 'false')
  }

  async dragCardToColumn (cardId: string, targetState: string): Promise<void> {
    // Works in both legacy column and swim-lane modes by picking whichever drop target exists.
    const legacy = this.column(targetState)
    const target =
      (await legacy.count()) > 0
        ? legacy
        : this.page.locator(`[data-id="kanban-swimlane-cell"][data-state="${targetState}"]`).first()
    // Cards past the cell's initial limit are not rendered, and issues other specs create in the
    // same project push ours out - `scrollIntoViewIfNeeded` then waits for a node that is not there.
    await this.revealCard(cardId)
    await this.ensureVisible(this.card(cardId))
    await this.dragPointer(this.card(cardId), target)
  }

  async dragCardToSwimLaneCell (cardId: string, laneId: string, targetState: string): Promise<void> {
    await this.revealCard(cardId)
    await this.ensureVisible(this.card(cardId))
    await this.dragPointer(this.card(cardId), this.swimLaneCell(laneId, targetState))
  }

  /** Through the DOM: `scrollIntoViewIfNeeded` waits for a stable element, and the board keeps
   *  animating while other specs add issues to the same project - it then never scrolls at all. */
  private async ensureVisible (locator: Locator): Promise<void> {
    await expect(async () => {
      await locator.first().waitFor({ state: 'attached', timeout: 5000 })
      await locator.first().evaluate((el) => {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      })
    }).toPass({ intervals: retryIntervals, timeout: 15000 })
  }

  /** A point on the part of the target that is on screen and is *not* covered by a card. Blink
   *  remembers the node the last dragover reached and delivers the drop to that node; Svelte
   *  re-creates a card's content on every write another spec makes to the same project, so a point
   *  on card content leaves the drop with a detached node - no drop event, no dragend, no error.
   *  A cell's own padding survives those re-renders. A swim lane cell is also taller than the
   *  window, so its geometric centre can sit below the fold where the pointer hits nothing. */
  private async visiblePointOf (target: Locator): Promise<{ x: number, y: number }> {
    // The board keeps scrolling for a frame or two after scrollIntoView, so a box read right away
    // points where the target no longer is - and the drop then lands on the neighbouring column.
    const raw = await waitStable(async () => JSON.stringify(await target.boundingBox()), {
      stableFor: 200,
      interval: 50,
      timeout: 5000
    })
    const box = JSON.parse(raw)
    if (box === null) throw new Error('Drop target has no bounding box')
    const view = this.page.viewportSize()
    const left = Math.max(box.x, 0)
    const right = Math.min(box.x + box.width, view?.width ?? box.x + box.width)
    const top = Math.max(box.y, 0)
    const bottom = Math.min(box.y + box.height, view?.height ?? box.y + box.height)
    if (right <= left || bottom <= top) {
      throw new Error(`drop target is off screen: box ${raw}, viewport ${JSON.stringify(view)}`)
    }
    const centre = { x: (left + right) / 2, y: (top + bottom) / 2 }
    const free = await target.evaluate(
      (el, { rect, zone }) => {
        for (const y of [rect.cy, rect.top + 6, rect.bottom - 6, (rect.top + rect.cy) / 2]) {
          for (const x of [rect.left + 3, rect.right - 3, rect.left + 6, rect.right - 6, rect.cx]) {
            const node = document.elementFromPoint(x, y)
            if (node === null) continue
            if (node.closest('[data-id="kanban-card"]') !== null) continue
            if (node.closest(zone) !== el) continue
            return { x, y }
          }
        }
        return null
      },
      { rect: { left, right, top, bottom, cx: centre.x, cy: centre.y }, zone: DROP_ZONE }
    )
    return free ?? centre
  }

  /**
   * Grabs the card and leaves the button held down. Chromium raises dragstart on the first move
   * after mouse.down(), and Svelte re-renders the card whenever another spec writes to the same
   * project - the grab is then silently lost and `move()` bails out on an unset `dragCard`, which
   * turns the whole drop into a no-op. Release and grab again instead; Escape closes the issue
   * panel that the release opens as a click.
   */
  private async grabCard (source: Locator): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      await source.hover()
      const box = await source.boundingBox()
      await this.page.mouse.down()
      if (box === null) return
      await this.page.mouse.move(box.x + box.width / 2 + 8, box.y + box.height / 2 + 8)
      try {
        await expect(source).toHaveClass(/dragged/, { timeout: 2000 })
        return
      } catch (err) {
        await this.page.mouse.up()
        await this.page.keyboard.press('Escape')
        if (attempt === 2) throw err
      }
    }
  }

  /**
   * dragTo() moves to the target in one hop, and a single dragover is often not enough for the
   * board to register the drop target - the drag then ends with no status change and no error.
   * Walk the pointer across in steps and jiggle on the target so dragover fires repeatedly.
   */
  private async dragPointer (source: Locator, target: Locator): Promise<void> {
    // Bounded wait for the drop target: a card can page out of a column while other tests keep
    // modifying issues, and then evaluate/boundingBox below block until the whole test times out,
    // leaving the caller's retry loop no turn at all.
    await target.waitFor({ state: 'attached', timeout: 5000 })
    let released = false
    await this.grabCard(source)
    try {
      // The board scrolls horizontally and does not fit five columns, so bring the target into view
      // only after the card is grabbed: hovering the source scrolls it back and a box measured
      // before that points outside the viewport. Scroll through the DOM - scrollIntoViewIfNeeded
      // waits for the element to be stable, and the board animates for as long as a card is held.
      await target.evaluate((el) => {
        el.scrollIntoView({ block: 'center', inline: 'nearest' })
      })
      // Lane and state together: with swim lanes on, every lane has a cell per status, so a drop
      // that lands one lane off matches by data-state alone and passes every check below.
      const wanted = await target.evaluate((el, zone) => {
        const cell = el.closest(zone)
        return cell === null
          ? null
          : `${cell.getAttribute('data-swimlane-id') ?? ''}|${cell.getAttribute('data-state') ?? ''}`
      }, DROP_ZONE)
      // A drop that never reaches the board is the whole flake: no error, no status change. The
      // browser fires it only after a dragover on the cell, so the release below waits for one.
      await this.page.evaluate((zone) => {
        const w = window as any
        w.__dropSeen = null
        w.__dragOverCell = null
        w.__dragOvers = 0
        w.__dragEnded = false
        w.__dragOverTs = 0
        w.__dragOverHandler = (e: Event): void => {
          const cell = (e.target as HTMLElement)?.closest?.(zone)
          w.__dragOvers++
          w.__dragOverTs = Date.now()
          w.__dragOverCell =
            cell == null
              ? 'outside'
              : `${cell.getAttribute('data-swimlane-id') ?? ''}|${cell.getAttribute('data-state') ?? ''}`
        }
        document.addEventListener('dragover', w.__dragOverHandler, true)
        // Bubble phase, so it reads what the board's own handlers left behind: Chromium ignores a
        // drop whose last dragover was not prevented or resolved to dropEffect "none".
        w.__dragOverAfterHandler = (e: Event): void => {
          const dt = (e as DragEvent).dataTransfer
          w.__dragOverAfter = `prevented=${String(e.defaultPrevented)} drop=${String(
            dt?.dropEffect
          )} allowed=${String(dt?.effectAllowed)} on ${String((e.target as HTMLElement)?.className ?? '')}`.slice(
            0,
            200
          )
        }
        document.addEventListener('dragover', w.__dragOverAfterHandler, false)
        // A drag the browser has already ended cannot deliver a drop however long we nudge.
        document.addEventListener(
          'dragend',
          () => {
            w.__dragEnded = true
          },
          { capture: true, once: true }
        )
        document.addEventListener(
          'drop',
          (e) => {
            const cell = (e.target as HTMLElement)?.closest?.(zone)
            w.__dropSeen =
              cell == null
                ? 'outside'
                : `${cell.getAttribute('data-swimlane-id') ?? ''}|${cell.getAttribute('data-state') ?? ''}`
          },
          { capture: true, once: true }
        )
      }, DROP_ZONE)

      // The board rearranges once the card is taken out of its own cell, so the target moves under
      // the pointer after it was measured. Measure, move, check what is really there - and redo the
      // whole thing while the card is still held rather than failing the caller's attempt.
      let x = 0
      let y = 0
      let under: string | null = null
      for (let attempt = 0; attempt < 4; attempt++) {
        const point = await this.visiblePointOf(target)
        x = point.x
        y = point.y
        await this.page.mouse.move(x, y, { steps: 10 })
        // The column becomes the drop target only once its dragover ran, and dragover only fires on
        // movement - so pause, then move again, and release while that last one is still fresh.
        await this.page.waitForTimeout(150)
        await this.page.mouse.move(x + 2, y + 2)
        await this.page.mouse.move(x, y)
        under = await this.page.evaluate(
          ({ px, py, zone }) => {
            const cell = document.elementFromPoint(px, py)?.closest(zone)
            return cell == null
              ? null
              : `${cell.getAttribute('data-swimlane-id') ?? ''}|${cell.getAttribute('data-state') ?? ''}`
          },
          { px: x, py: y, zone: DROP_ZONE }
        )
        if (wanted === null || under === wanted) break
      }
      if (wanted !== null && under !== wanted) {
        throw new Error(`drop point (${x}, ${y}) is over cell "${under ?? 'nothing'}", not "${wanted}"`)
      }
      // A column the card's task type does not allow swallows the drop without a word.
      if (await target.evaluate((el) => el.closest('.drop-disabled') !== null)) {
        throw new Error(`cell "${String(wanted)}" is disabled for this card - its task type does not allow the status`)
      }
      // The browser turns a synthesized mousemove into dragover a tick later, and a release that
      // overtakes it ends the drag with no drop at all. Nudge until the cell has really seen one.
      // `__dragOverCell` is sticky, so a dragover from before the last board re-render satisfied
      // this loop even when the browser had already dropped the drag: count the events instead and
      // demand one raised by *these* nudges.
      const before = await this.page.evaluate(() => (window as any).__dragOvers as number)
      let fresh = false
      for (let attempt = 0; attempt < (wanted === null ? 0 : 20); attempt++) {
        const state = await this.page.evaluate(() => {
          const w = window as any
          return { cell: w.__dragOverCell, ended: w.__dragEnded, overs: w.__dragOvers as number }
        })
        if (state.ended === true) break
        if (state.cell === wanted && state.overs > before) {
          fresh = true
          break
        }
        await this.page.mouse.move(x + (attempt % 2 === 0 ? 2 : -2), y)
        await this.page.mouse.move(x, y)
        await this.page.waitForTimeout(50)
      }
      // No dragover at all for a whole second of nudging means the browser is not dragging any
      // more - releasing would only burn the 3s drop poll and the caller's reload.
      if (wanted !== null && !fresh) {
        const live = await this.page.evaluate(() => {
          const w = window as any
          return { overs: w.__dragOvers as number, ended: w.__dragEnded as boolean }
        })
        if (live.overs === before) {
          throw new Error(
            `drag session died before the release: no dragover in 20 nudges over cell "${String(wanted)}" ` +
              `(${String(live.overs)} in total, dragend ${String(live.ended)}, ` +
              `source still in DOM: ${String((await source.count()) > 0)})`
          )
        }
      }
      await this.page.mouse.up()
      released = true
      // The browser delivers the drop a tick after the release, so reading straight away reports
      // "landed on null" for a drop that did arrive.
      await expect
        .poll(async () => await this.page.evaluate(() => (window as any).__dropSeen), { timeout: 3000 })
        .toBe(wanted)
        .catch(() => {})
      const after = await this.page.evaluate(() => {
        const w = window as any
        document.removeEventListener('dragover', w.__dragOverHandler, true)
        document.removeEventListener('dragover', w.__dragOverAfterHandler, false)
        return {
          seen: w.__dropSeen,
          cell: w.__dragOverCell,
          overs: w.__dragOvers,
          ended: w.__dragEnded,
          sinceOver: w.__dragOverTs === 0 ? -1 : Date.now() - w.__dragOverTs,
          lastOver: w.__dragOverAfter
        }
      })
      if (after.seen !== wanted) {
        // A lost drop leaves the board mid-drag: the card keeps its `dragged` class and every later
        // mouse.down starts no drag at all. Escape clears that in ms, a reload costs seconds.
        await this.page.keyboard.press('Escape')
        if ((await this.page.locator('[data-id="kanban-card"].dragged').count()) > 0) {
          await this.page.reload()
        }
        throw new Error(
          `drop was not delivered to cell "${String(wanted)}" (landed on "${String(after.seen)}", ` +
            `last dragover "${String(after.cell)}" of ${String(after.overs)}, ${String(after.sinceOver)}ms ago, ` +
            `dragend ${String(after.ended)}; last dragover state: ${String(after.lastOver)})`
        )
      }
    } finally {
      if (!released) await this.page.mouse.up()
    }
  }

  async dragCardToCard (cardId: string, targetCardId: string): Promise<void> {
    const source = this.card(cardId)
    const target = this.card(targetCardId)
    // Both cards can be beyond the loaded page of their column - the target no less than the source.
    await this.revealCard(cardId)
    await this.revealCard(targetCardId)
    await this.ensureVisible(source)
    await this.dragPointer(source, target)
  }

  async getScrollTop (): Promise<number> {
    return await this.page.evaluate(() => {
      const el = document.querySelector('.kanban-container .scroll, .kanban-content')
      return el != null ? (el as HTMLElement).scrollTop : window.scrollY
    })
  }

  // The Board button's tooltip opens to the right, straight over btn-viewOptions, and stays up
  // while the pointer rests on Board after the board was opened by a click. Park the pointer first.
  async openViewOptions (): Promise<void> {
    await this.page.mouse.move(0, 0)
    await this.page.locator('button[data-id="btn-viewOptions"]').click()
  }

  async setSwimLane (
    option: 'None' | 'Assignee' | 'Priority' | 'Component' | 'Milestone' | 'Parent' | 'Project'
  ): Promise<void> {
    await this.openViewOptions()
    const swimRow = this.page.locator('.antiCard-menu__item', { hasText: 'Swim lane' })
    await swimRow.waitFor({ state: 'visible', timeout: 5000 })
    await swimRow.locator('button').click()
    const menuItem = this.page.locator('.menu-item').filter({ hasText: new RegExp(`^\\s*${option}\\s*$`) })
    await menuItem.first().click()
    // Close any remaining popups (sub-menu + view-options card).
    await this.page.keyboard.press('Escape')
    await this.page.keyboard.press('Escape')
    if (option === 'None') {
      await this.page.locator('[data-id="kanban-column"]').first().waitFor({ state: 'visible', timeout: 10000 })
    } else {
      await this.page.locator('[data-id="kanban-swimlane"]').first().waitFor({ state: 'visible', timeout: 10000 })
      // Lanes from the previous grouping stay in the DOM while the board
      // re-renders, so a bare visibility wait returns stale lane ids. Wait for
      // the id list to stop changing before the caller reads it.
      let previous = ''
      await expect
        .poll(
          async () => {
            const ids = (
              await this.page
                .locator('[data-id="kanban-swimlane"]')
                .evaluateAll((els) => els.map((el) => el.getAttribute('data-swimlane-id') ?? ''))
            ).join(',')
            const stable = ids !== '' && ids === previous
            previous = ids
            return stable
          },
          { timeout: 10000, intervals: retryIntervals }
        )
        .toBe(true)
    }
  }

  async expectSwimLaneVisible (laneId: string): Promise<void> {
    await expect(this.swimLane(laneId)).toBeVisible()
  }

  // Click "Show more" in any cell on the board until the requested card is in DOM.
  // Cards beyond the initial limit (3 in swimlane mode) are not rendered until
  // the user expands the cell. Tests that rely on a freshly-created card in a
  // populated lane must reveal it before asserting visibility.
  async revealCard (cardId: string, attempts: number = 30): Promise<void> {
    for (let i = 0; i < attempts; i++) {
      if ((await this.card(cardId).count()) > 0) return
      // A drag that ended without a drop leaves the board's optimistic copy of the card nowhere:
      // it is gone from the DOM and no transaction is coming to bring it back. Reload once.
      if (i === Math.floor(attempts / 2)) {
        await this.page.reload()
        await this.page.locator('[data-id="kanban-card"]').first().waitFor({ state: 'attached', timeout: 15000 })
        continue
      }
      // Every Show more on the board per pass, not one: the card can sit behind any column's limit
      // and other specs leave hundreds of issues in the shared project, so round-robin spent two
      // thirds of its clicks on columns that did not hold the card.
      const buttons = this.page.locator('button[data-id="btn-kanban-show-more"]')
      const count = await buttons.count()
      if (count === 0) {
        // No more "Show more" buttons left. Wait briefly for live-query to land
        // and check again.
        await this.page.waitForTimeout(300)
        continue
      }
      for (let b = 0; b < count; b++) {
        await buttons
          .nth(b)
          .click({ timeout: 2000 })
          .catch(() => {})
      }
      await this.page.waitForTimeout(150)
    }
    // Silence here costs the caller its whole budget on a card that is not on the board at all.
    const cards = await this.page.locator('[data-id="kanban-card"]').count()
    const lanes = await this.page.locator('[data-id="kanban-swimlane"]').count()
    throw new Error(`card ${cardId} never rendered: ${cards} cards on the board, ${lanes} swim lanes`)
  }

  // Click every "Show more" button on the board until no truncated cells remain.
  // Use this in tests that read all cards in a cell via DOM — initialLimit can
  // truncate the list and produce stale assertions.
  async expandAllCells (maxClicks: number = 50): Promise<void> {
    for (let i = 0; i < maxClicks; i++) {
      const buttons = this.page.locator('button[data-id="btn-kanban-show-more"]')
      const count = await buttons.count()
      if (count === 0) return
      await buttons
        .first()
        .click()
        .catch(() => {})
      await this.page.waitForTimeout(120)
    }
  }

  async swimLanes (): Promise<string[]> {
    return await this.page
      .locator('[data-id="kanban-swimlane"]')
      .evaluateAll((nodes) =>
        nodes.map((n) => (n as HTMLElement).getAttribute('data-swimlane-id') ?? '').filter((v) => v !== '')
      )
  }
}
