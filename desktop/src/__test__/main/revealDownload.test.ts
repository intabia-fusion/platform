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

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { BrowserWindow, dialog, shell } from 'electron'

import { openDownload, rememberDownload, revealDownload } from '../../main/revealDownload'

jest.mock('electron', () => ({
  BrowserWindow: jest.fn(),
  dialog: {
    showMessageBox: jest.fn()
  },
  shell: {
    showItemInFolder: jest.fn(),
    openPath: jest.fn()
  }
}))

// The shell and dialog are objects with methods: taking one out of them drops its `this`, which is what
// `unbound-method` guards against. The mocked module is read as a plain record of jest mocks instead.
const mockedShell = shell as unknown as { showItemInFolder: jest.Mock, openPath: jest.Mock }
const mockedDialog = dialog as unknown as { showMessageBox: jest.Mock }

const confirmTexts = {
  title: 'Open file',
  message: 'This file can run a program. Open it?',
  open: 'Open',
  cancel: 'Cancel'
}

/**
 * The reveal path branches on the OS: a Linux box without a session bus opens the folder instead of selecting the
 * file. Every case states the platform it stands for, so the suite gives the same result on a developer's Windows
 * machine and on the Linux runner, where `process.platform` is `linux` and no DBus session bus is set.
 */
function usePlatform (platform: NodeJS.Platform, sessionBus?: string): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  if (sessionBus === undefined) delete process.env.DBUS_SESSION_BUS_ADDRESS
  else process.env.DBUS_SESSION_BUS_ADDRESS = sessionBus
}

const originalPlatform = process.platform
const originalSessionBus = process.env.DBUS_SESSION_BUS_ADDRESS

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
  if (originalSessionBus === undefined) delete process.env.DBUS_SESSION_BUS_ADDRESS
  else process.env.DBUS_SESSION_BUS_ADDRESS = originalSessionBus
})

// The module remembers completed downloads for the whole file, so every case names its own.
describe('revealDownload', () => {
  let folder: string
  let file: string

  beforeEach(() => {
    jest.resetAllMocks()
    usePlatform('win32')
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'reveal-'))
    file = path.join(folder, 'report.pdf')
    fs.writeFileSync(file, 'content')
  })

  afterEach(() => {
    fs.rmSync(folder, { recursive: true, force: true })
  })

  it('selects the finished download in the file manager', async () => {
    rememberDownload('reveal-win', file)
    expect(await revealDownload('reveal-win')).toBe('ok')
    expect(mockedShell.showItemInFolder).toHaveBeenCalledWith(file)
    expect(mockedShell.openPath).not.toHaveBeenCalled()
  })

  it('selects the finished download in the file manager on macOS', async () => {
    usePlatform('darwin')
    rememberDownload('reveal-mac', file)
    expect(await revealDownload('reveal-mac')).toBe('ok')
    expect(mockedShell.showItemInFolder).toHaveBeenCalledWith(file)
  })

  it('reports a thrown file manager error', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockedShell.showItemInFolder.mockImplementation(() => {
      throw new Error('File manager failed')
    })
    rememberDownload('reveal-thrown', file)

    expect(await revealDownload('reveal-thrown')).toBe('failed')
    error.mockRestore()
  })

  // The id is all the renderer has: a file it never downloaded is out of reach even when it exists.
  it('refuses an id this session never completed', async () => {
    expect(await revealDownload('reveal-never-downloaded')).toBe('unknown')
    expect(mockedShell.showItemInFolder).not.toHaveBeenCalled()
    expect(mockedShell.openPath).not.toHaveBeenCalled()
  })

  it('refuses a path used as an id', async () => {
    expect(await revealDownload(file)).toBe('unknown')
    expect(mockedShell.showItemInFolder).not.toHaveBeenCalled()
    expect(mockedShell.openPath).not.toHaveBeenCalled()
  })

  it('refuses an id that is not a string', async () => {
    expect(await revealDownload(undefined)).toBe('unknown')
    expect(await revealDownload({ key: 'reveal-win' })).toBe('unknown')
    expect(mockedShell.showItemInFolder).not.toHaveBeenCalled()
  })

  it('reports a file deleted after the download', async () => {
    rememberDownload('reveal-gone', path.join(folder, 'gone.pdf'))
    expect(await revealDownload('reveal-gone')).toBe('missing')
    expect(mockedShell.showItemInFolder).not.toHaveBeenCalled()
    expect(mockedShell.openPath).not.toHaveBeenCalled()
  })

  it('forgets nothing for an empty id or path', async () => {
    rememberDownload('', file)
    rememberDownload('reveal-empty-path', '')
    expect(await revealDownload('reveal-empty-path')).toBe('unknown')
    expect(mockedShell.showItemInFolder).not.toHaveBeenCalled()
  })

  describe('on Linux', () => {
    it('selects the file when a session bus is available', async () => {
      usePlatform('linux', 'unix:path=/run/user/1000/bus')
      rememberDownload('reveal-linux-bus', file)
      expect(await revealDownload('reveal-linux-bus')).toBe('ok')
      expect(mockedShell.showItemInFolder).toHaveBeenCalledWith(file)
      expect(mockedShell.openPath).not.toHaveBeenCalled()
    })

    it('waits for the folder to open before reporting success', async () => {
      usePlatform('linux')
      let finish!: (error: string) => void
      mockedShell.openPath.mockReturnValue(
        new Promise<string>((resolve) => {
          finish = resolve
        })
      )
      rememberDownload('reveal-linux-pending', file)
      const settled = jest.fn()
      const result = revealDownload('reveal-linux-pending').then(settled)

      await Promise.resolve()
      expect(settled).not.toHaveBeenCalled()
      finish('')
      await result
      expect(settled).toHaveBeenCalledWith('ok')
    })

    it('reports a folder open error', async () => {
      usePlatform('linux')
      const error = jest.spyOn(console, 'error').mockImplementation(() => {})
      mockedShell.openPath.mockResolvedValue('Failed to open folder')
      rememberDownload('reveal-linux-error', file)

      expect(await revealDownload('reveal-linux-error')).toBe('failed')
      expect(mockedShell.showItemInFolder).not.toHaveBeenCalled()
      error.mockRestore()
    })

    it('reports a rejected folder open', async () => {
      usePlatform('linux')
      const error = jest.spyOn(console, 'error').mockImplementation(() => {})
      mockedShell.openPath.mockRejectedValue(new Error('Folder open failed'))
      rememberDownload('reveal-linux-rejected', file)

      expect(await revealDownload('reveal-linux-rejected')).toBe('failed')
      error.mockRestore()
    })

    // FileManager1.ShowItems cannot be reached without a session bus and reports nothing, so the folder is opened.
    it('opens the folder when there is no session bus', async () => {
      usePlatform('linux')
      mockedShell.openPath.mockResolvedValue('')
      rememberDownload('reveal-linux-no-bus', file)
      expect(await revealDownload('reveal-linux-no-bus')).toBe('ok')
      expect(mockedShell.openPath).toHaveBeenCalledWith(folder)
      expect(mockedShell.showItemInFolder).not.toHaveBeenCalled()
    })
  })
})

describe('openDownload', () => {
  let folder: string
  let file: string

  beforeEach(() => {
    jest.resetAllMocks()
    usePlatform('win32')
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'open-'))
    file = path.join(folder, 'report.pdf')
    fs.writeFileSync(file, 'content')
  })

  afterEach(() => {
    fs.rmSync(folder, { recursive: true, force: true })
  })

  it('opens a safe type without asking', async () => {
    mockedShell.openPath.mockResolvedValue('')
    rememberDownload('open-safe', file)
    expect(await openDownload('open-safe', confirmTexts)).toBe('ok')
    expect(mockedDialog.showMessageBox).not.toHaveBeenCalled()
    expect(mockedShell.openPath).toHaveBeenCalledWith(file)
  })

  // The type decides, not the renderer: an executable goes through the OS dialog even when a call asks directly.
  it('asks before opening an executable and opens it after a confirmation', async () => {
    const exe = path.join(folder, 'setup.exe')
    fs.writeFileSync(exe, 'MZ')
    mockedDialog.showMessageBox.mockResolvedValue({ response: 0, checkboxChecked: false })
    mockedShell.openPath.mockResolvedValue('')
    rememberDownload('open-exe-confirmed', exe)

    expect(await openDownload('open-exe-confirmed', confirmTexts)).toBe('ok')
    expect(mockedDialog.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
        message: confirmTexts.message,
        detail: 'setup.exe',
        buttons: [confirmTexts.open, confirmTexts.cancel],
        defaultId: 1,
        cancelId: 1
      })
    )
    expect(mockedShell.openPath).toHaveBeenCalledWith(exe)
  })

  it('does not open an executable when the confirmation is dismissed', async () => {
    const exe = path.join(folder, 'setup.exe')
    fs.writeFileSync(exe, 'MZ')
    mockedDialog.showMessageBox.mockResolvedValue({ response: 1, checkboxChecked: false })
    rememberDownload('open-exe-cancelled', exe)

    expect(await openDownload('open-exe-cancelled', confirmTexts)).toBe('cancelled')
    expect(mockedShell.openPath).not.toHaveBeenCalled()
  })

  it('asks for a type it does not know, such as an archive of scripts', async () => {
    const unknown = path.join(folder, 'payload.xyz')
    fs.writeFileSync(unknown, 'content')
    mockedDialog.showMessageBox.mockResolvedValue({ response: 1, checkboxChecked: false })
    rememberDownload('open-unknown-type', unknown)

    expect(await openDownload('open-unknown-type', confirmTexts)).toBe('cancelled')
    expect(mockedDialog.showMessageBox).toHaveBeenCalled()
  })

  it('reports the error the OS returned', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockedShell.openPath.mockResolvedValue('Failed to open path')
    rememberDownload('open-failed', file)
    expect(await openDownload('open-failed', confirmTexts)).toBe('failed')
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it.each(['odt', 'ods', 'odp'])('does not open an ODF %s file after cancellation', async (extension) => {
    const document = path.join(folder, `document.${extension}`)
    fs.writeFileSync(document, 'content')
    mockedDialog.showMessageBox.mockResolvedValue({ response: 1, checkboxChecked: false })
    rememberDownload(`open-odf-${extension}`, document)

    expect(await openDownload(`open-odf-${extension}`, confirmTexts)).toBe('cancelled')
    expect(mockedDialog.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({ detail: `document.${extension}`, defaultId: 1, cancelId: 1 })
    )
    expect(mockedShell.openPath).not.toHaveBeenCalled()
  })

  it('attaches the confirmation to the parent window', async () => {
    const exe = path.join(folder, 'setup.exe')
    const parent = new BrowserWindow()
    fs.writeFileSync(exe, 'MZ')
    mockedDialog.showMessageBox.mockResolvedValue({ response: 1, checkboxChecked: false })
    rememberDownload('open-parent', exe)

    expect(await openDownload('open-parent', confirmTexts, parent)).toBe('cancelled')
    expect(mockedDialog.showMessageBox).toHaveBeenCalledWith(parent, expect.objectContaining({ detail: 'setup.exe' }))
    expect(mockedShell.openPath).not.toHaveBeenCalled()
  })

  it('reports a rejected file open', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockedShell.openPath.mockRejectedValue(new Error('File open failed'))
    rememberDownload('open-rejected', file)

    expect(await openDownload('open-rejected', confirmTexts)).toBe('failed')
    error.mockRestore()
  })

  it('reports a rejected confirmation without opening the file', async () => {
    const exe = path.join(folder, 'setup.exe')
    fs.writeFileSync(exe, 'MZ')
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockedDialog.showMessageBox.mockRejectedValue(new Error('Dialog failed'))
    rememberDownload('open-dialog-rejected', exe)

    expect(await openDownload('open-dialog-rejected', confirmTexts)).toBe('failed')
    expect(mockedShell.openPath).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('does not call the OS for an unknown id or a deleted file', async () => {
    rememberDownload('open-gone', path.join(folder, 'gone.pdf'))
    expect(await openDownload('open-gone', confirmTexts)).toBe('missing')
    expect(await openDownload('open-never-downloaded', confirmTexts)).toBe('unknown')
    expect(await openDownload(file, confirmTexts)).toBe('unknown')
    expect(mockedShell.openPath).not.toHaveBeenCalled()
    expect(mockedDialog.showMessageBox).not.toHaveBeenCalled()
  })
})
