import { expect, test } from '../fixtures'
import { ChannelPage } from '../model/channel-page'
import { ChunterPage } from '../model/chunter-page'
import { EmployeeDetailsPage } from '../model/contacts/employee-details-page'
import { generateId, PlatformSetting, PlatformURI } from '../utils'

test.use({
  storageState: PlatformSetting
})

test.describe('Chat links and directs', () => {
  const mentionName = 'Dirak Kainin'
  let chunterPage: ChunterPage
  let channelPage: ChannelPage
  let employeeDetailsPage: EmployeeDetailsPage
  let channelName: string

  test.beforeEach(async ({ page }) => {
    chunterPage = new ChunterPage(page)
    channelPage = new ChannelPage(page)
    employeeDetailsPage = new EmployeeDetailsPage(page)
    channelName = `links-${generateId(8)}`

    await (await page.goto(`${PlatformURI}/workbench/sanity-ws/chunter`))?.finished()
  })

  async function createChannel (name: string): Promise<void> {
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(name, false)
    await channelPage.checkIfChannelDefaultExist(true, name)
  }

  test('Channel url carries its name, and the old one still opens', async ({ page }) => {
    await createChannel(channelName)
    await channelPage.clickChannel(channelName)
    await expect(page).toHaveURL(new RegExp(`/chunter/${channelName}-[0-9a-f]{24}$`))

    await channelPage.clickChannel('random')
    await expect(page).toHaveURL(/\/chunter\/chunter-space-Random$/)

    await page.goto(`${PlatformURI}/workbench/sanity-ws/chunter/chunter%3Aspace%3AGeneral%7Cchunter%3Aclass%3AChannel`)
    await expect(channelPage.openedChannelHeader('general')).toBeVisible()
  })

  test('Copy link of a channel from the navigator', async ({ page }) => {
    await createChannel(channelName)
    await channelPage.makeActionWithChannelInMenu(channelName, 'Copy link')
    const link = await channelPage.getClipboardCopyMessage()
    expect(link).toMatch(new RegExp(`/workbench/sanity-ws/chunter/${channelName}-[0-9a-f]{24}$`))

    await page.goto(link)
    await expect(channelPage.openedChannelHeader(channelName)).toBeVisible()
  })

  test('Mention of a channel leads to the channel', async ({ page }) => {
    const target = `${channelName}-target`
    await createChannel(target)
    await createChannel(channelName)
    await channelPage.clickChannel(channelName)

    await channelPage.sendMention(target)
    const mention = channelPage.textMessage(target, true).getByRole('link', { name: target })
    await mention.click()
    await expect(page).toHaveURL(new RegExp(`/chunter/${target}-[0-9a-f]{24}$`))
    await expect(channelPage.openedChannelHeader(target)).toBeVisible()
  })

  test('Mention of an employee opens the direct, its header opens the card', async ({ page }) => {
    await createChannel(channelName)
    await channelPage.clickChannel(channelName)

    await channelPage.sendMention(mentionName)
    await channelPage
      .textMessage(`@${mentionName}`, true)
      .getByRole('link', { name: `@${mentionName}` })
      .click()
    await expect(page).toHaveURL(/\/chunter\/[a-z0-9-]+-[0-9a-f]{24}$/)
    await expect(channelPage.openedChannelHeader(mentionName)).toBeVisible()

    await page.locator('[data-id="btnDirectViewProfile"]').click()
    await employeeDetailsPage.checkEmployee({
      firstName: mentionName.split(' ')[1],
      lastName: mentionName.split(' ')[0]
    })
  })
})
