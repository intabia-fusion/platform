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

import { MeasureContext } from '@hcengineering/core'
import { TranscriptionOptions, TranscriptionProvider, TranscriptionResult } from '../types'
import { ClisrServer } from '@intabiafusion/clisr'

/**
 * Clisr Server Transcribe manager
 */
export class ServerProvider implements TranscriptionProvider {
  readonly name = 'server'

  constructor (
    private readonly ctx: MeasureContext,
    private readonly server: ClisrServer
  ) {}

  async transcribe (audioData: Buffer, options: TranscriptionOptions): Promise<TranscriptionResult> {
    const startTime = Date.now()

    try {
      const result: TranscriptionResult = await this.server.binaryRequest(
        this.ctx,
        'transcribe',
        audioData,
        { options },
        (s) => {
          // Only select clients that have registered transcription capability
          return s.options.transcription === true
        }
      )

      const elapsed = Date.now() - startTime
      this.ctx.info('OpenAI Whisper transcription completed', {
        provider: this.name,
        language: result.language,
        textLength: result.text.length,
        wordCount: result.words?.length ?? 0,
        elapsedMs: elapsed
      })

      return result
    } catch (err: any) {
      const elapsed = Date.now() - startTime
      this.ctx.error('OpenAI Whisper transcription failed', {
        provider: this.name,
        error: err.message,
        elapsedMs: elapsed
      })
      throw err
    }
  }
}

/**
 * Create a Clisr server provider instance
 */
export function createServerProvider (ctx: MeasureContext, server: ClisrServer): ServerProvider {
  return new ServerProvider(ctx, server)
}
