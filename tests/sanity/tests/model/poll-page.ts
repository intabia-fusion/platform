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

import { expect, type Locator, type Page } from '@playwright/test'

export type PollSetting = 'Anonymous voting' | 'Multiple choice' | 'No revoting' | 'Quiz mode'

export interface PollForm {
  question: string
  options: string[]
  settings?: PollSetting[]
  // The index of the correct option of a quiz.
  correct?: number
}

/** The poll form, its draft in the message input and the poll in the chat. */
export class PollPage {
  constructor (readonly page: Page) {}

  // Live elements only: a switched channel fades out inert over the next one.
  readonly pollButton = (): Locator => this.page.locator('button:has(use[href$="#poll-outline"]):not([inert] *)')
  readonly form = (): Locator => this.page.getByRole('dialog', { name: /^(Create|Edit) Poll$/ })
  readonly questionInput = (): Locator => this.form().getByPlaceholder('Ask a question...')
  readonly optionInput = (index: number): Locator => this.form().getByRole('textbox', { name: `Option ${index + 1}` })
  readonly setting = (name: PollSetting): Locator => this.form().getByRole('switch', { name })
  readonly correctAnswer = (option: string): Locator =>
    this.form().getByRole('radio', { name: `Correct answer: ${option}` })

  readonly createButton = (): Locator => this.form().getByRole('button', { name: /^(Create|Save)$/ })
  readonly closeQuestion = (): Locator =>
    this.page.getByRole('dialog').filter({ hasText: "Are you sure you want to close? The poll won't be saved." })

  readonly draft = (question: string): Locator =>
    this.page.locator('.tile:not([inert] *)').filter({ hasText: question })

  readonly sendButton = (): Locator => this.page.locator('button:has(g#Send):not([inert] *)')

  readonly poll = (question: string, root?: Locator): Locator =>
    (root ?? this.page.locator(':not([inert] *)')).getByRole('region', { name: question })

  readonly option = (question: string, label: string): Locator =>
    this.poll(question).locator('.poll-option').filter({ hasText: label })

  readonly optionControl = (question: string, label: string): Locator =>
    this.poll(question)
      .getByRole('radio', { name: label })
      .or(this.poll(question).getByRole('checkbox', { name: label }))

  readonly percent = (question: string, label: string): Locator =>
    this.option(question, label).locator('.poll-option__percentage')

  readonly footer = (question: string): Locator => this.poll(question).locator('.poll-footer')
  readonly avatars = (question: string): Locator => this.poll(question).locator('.poll-avatars')
  // The context menu draws its entries as buttons, not menuitems.
  readonly menuItem = (label: 'Retract vote' | 'Show results'): Locator =>
    this.page.locator('.popup').getByRole('button', { name: label, exact: true })

  readonly results = (): Locator => this.page.getByRole('dialog', { name: 'Poll results' })

  async openForm (): Promise<void> {
    await this.pollButton().click()
    await expect(this.questionInput()).toBeFocused()
  }

  async fill (form: PollForm): Promise<void> {
    await this.questionInput().fill(form.question)
    for (const [i, option] of form.options.entries()) {
      await this.optionInput(i).fill(option)
    }
    for (const setting of form.settings ?? []) {
      await this.setting(setting).check()
    }
    if (form.correct !== undefined) {
      await this.correctAnswer(form.options[form.correct]).check()
    }
  }

  /** Fills the form, puts the draft into the message input and sends it. */
  async sendPoll (form: PollForm): Promise<void> {
    await this.openForm()
    await this.fill(form)
    await this.createButton().click()
    await expect(this.form()).toBeHidden()
    await expect(this.draft(form.question)).toBeVisible()
    await this.sendButton().click()
    await expect(this.draft(form.question)).toBeHidden()
    await expect(this.poll(form.question)).toBeVisible()
  }

  async voteFor (question: string, ...labels: string[]): Promise<void> {
    // A click, not check(): a single vote replaces the control with the results at once.
    for (const label of labels) {
      await this.optionControl(question, label).click()
    }
    if (labels.length > 1) {
      await this.footer(question).getByRole('button', { name: 'Vote' }).click()
    }
  }

  async openMenu (question: string): Promise<void> {
    await this.poll(question).click({ button: 'right' })
  }

  async retract (question: string): Promise<void> {
    await this.openMenu(question)
    await this.menuItem('Retract vote').click()
  }

  async checkVoted (question: string, voted: boolean): Promise<void> {
    if (voted) {
      await expect(this.poll(question).locator('.poll-option__result').first()).toBeVisible()
    } else {
      await expect(this.poll(question).locator('.poll-option__answer').first()).toBeVisible()
    }
  }

  async checkPercent (question: string, label: string, percent: number): Promise<void> {
    await expect(this.percent(question, label)).toHaveText(`${percent}%`)
  }

  async checkVotes (question: string, count: number): Promise<void> {
    await expect(this.footer(question)).toContainText(count === 1 ? '1 vote' : `${count} votes`)
  }
}
