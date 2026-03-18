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

/**
 * Tests for STT class cleanup and resource management
 * Focus on detecting memory leaks and ensuring proper cleanup
 */

import { STT } from '../stream/stt.js'
import { Room, RemoteTrack, RemoteTrackPublication, RemoteParticipant } from '@livekit/rtc-node'

// Mock LiveKit modules
jest.mock('@livekit/rtc-node', () => ({
  AudioStream: jest.fn().mockImplementation(() => ({
    close: jest.fn(),
    [Symbol.asyncIterator]: jest.fn().mockReturnValue({
      next: jest.fn().mockResolvedValue({ done: true, value: undefined })
    })
  })),
  RemoteParticipant: jest.fn(),
  RemoteTrack: jest.fn(),
  RemoteTrackPublication: jest.fn(),
  Room: jest.fn()
}))

jest.mock('../config.js', () => ({
  default: {
    PlatformUrl: 'http://localhost:3000',
    LiveKitApiUrl: 'ws://localhost:7880',
    Debug: false,
    RecordFullAudio: false
  }
}))

describe('STT Cleanup Tests', () => {
  let stt: STT
  let mockRoom: jest.Mocked<Room>
  const mockToken = 'test-token'
  const mockWorkspace = 'test-workspace'

  beforeEach(() => {
    mockRoom = {
      name: 'test-room',
      metadata: undefined
    } as unknown as jest.Mocked<Room>

    stt = new STT(mockRoom, mockWorkspace, mockToken)
  })

  afterEach(async () => {
    await stt.close()
  })

  describe('Map Cleanup', () => {
    it('should clean up all maps when close() is called', async () => {
      // Access private maps for testing
      const sttAny = stt as any
      const trackBySid: Map<string, RemoteTrack> = sttAny.trackBySid
      const streamBySid: Map<string, any> = sttAny.streamBySid
      const participantBySid: Map<string, RemoteParticipant> = sttAny.participantBySid
      const chunkStateBySid: Map<string, any> = sttAny.chunkStateBySid
      const sessionStateBySid: Map<string, any> = sttAny.sessionStateBySid
      const timingBySid: Map<string, any> = sttAny.timingBySid
      const sessionBySid: Map<string, any> = sttAny.sessionBySid
      const stoppedSids: Set<string> = sttAny.stoppedSids
      const pendingFinalizations: Map<string, Promise<void>> = sttAny.pendingFinalizations
      const pendingChunkFinalizations: Map<string, Promise<void>[]> = sttAny.pendingChunkFinalizations

      // Add some test data
      trackBySid.set('test-sid', {} as unknown as RemoteTrack)
      streamBySid.set('test-sid', {})
      participantBySid.set('test-sid', {} as unknown as RemoteParticipant)
      chunkStateBySid.set('test-sid', {})
      sessionStateBySid.set('test-sid', {})
      timingBySid.set('test-sid', {})
      sessionBySid.set('test-sid', {})
      stoppedSids.add('test-sid')
      pendingFinalizations.set('test-sid', Promise.resolve())
      pendingChunkFinalizations.set('test-sid', [Promise.resolve()])

      // Close should clean up all maps
      await stt.close()

      expect(trackBySid.size).toBe(0)
      expect(streamBySid.size).toBe(0)
      expect(participantBySid.size).toBe(0)
      expect(chunkStateBySid.size).toBe(0)
      expect(sessionStateBySid.size).toBe(0)
    })

    it('should remove track from maps after unsubscribe', async () => {
      const mockTrack: RemoteTrack = {} as unknown as RemoteTrack
      const mockPublication: RemoteTrackPublication = { sid: 'test-sid', kind: 1 } as unknown as RemoteTrackPublication
      const mockParticipant: RemoteParticipant = { name: 'Test', identity: 'test-id' } as unknown as RemoteParticipant

      stt.subscribe(mockTrack, mockPublication, mockParticipant)

      const sttAny = stt as any
      const trackBySid: Map<string, RemoteTrack> = sttAny.trackBySid
      const participantBySid: Map<string, RemoteParticipant> = sttAny.participantBySid

      expect(trackBySid.has('test-sid')).toBe(true)
      expect(participantBySid.has('test-sid')).toBe(true)

      await stt.unsubscribe(mockTrack, mockPublication, mockParticipant)

      expect(trackBySid.has('test-sid')).toBe(false)
      expect(participantBySid.has('test-sid')).toBe(false)
    })
  })

  describe('Pre-buffer Cleanup', () => {
    it('should clear pre-buffer when speech starts', async () => {
      const mockTrack: RemoteTrack = {} as unknown as RemoteTrack
      const mockPublication: RemoteTrackPublication = { sid: 'test-sid', kind: 1 } as unknown as RemoteTrackPublication
      const mockParticipant: RemoteParticipant = { name: 'Test', identity: 'test-id' } as unknown as RemoteParticipant

      stt.subscribe(mockTrack, mockPublication, mockParticipant)
      stt.start()

      // Simulate processing that adds to pre-buffer
      const sttAny = stt as any
      const chunkState = sttAny.chunkStateBySid.get('test-sid')
      if (chunkState != null) {
        chunkState.preBuffer = [
          { buf: Buffer.alloc(1000), analysis: {}, frameStartTime: 0, frameEndTime: 100, hasSpeech: true }
        ]
        chunkState.preBufferDurationMs = 100
      }

      // After finalizeChunk or stop, pre-buffer should be cleared
      await stt.stopWs('test-sid')

      const finalChunkState = sttAny.chunkStateBySid.get('test-sid')
      if (finalChunkState != null) {
        expect(finalChunkState.preBuffer.length).toBe(0)
        expect(finalChunkState.preBufferDurationMs).toBe(0)
      }
    })
  })

  describe('Look-ahead Buffer Cleanup', () => {
    it('should clear look-ahead buffer after chunk finalization', async () => {
      const mockTrack: RemoteTrack = {} as unknown as RemoteTrack
      const mockPublication: RemoteTrackPublication = { sid: 'test-sid', kind: 1 } as unknown as RemoteTrackPublication
      const mockParticipant: RemoteParticipant = { name: 'Test', identity: 'test-id' } as unknown as RemoteParticipant

      stt.subscribe(mockTrack, mockPublication, mockParticipant)
      stt.start()

      // Simulate look-ahead buffer accumulation
      const sttAny = stt as any
      const chunkState = sttAny.chunkStateBySid.get('test-sid')
      if (chunkState != null) {
        chunkState.adaptiveVAD.lookAheadBuffer = [
          { buf: Buffer.alloc(1000), analysis: {}, frameStartTime: 0, frameEndTime: 100, hasSpeech: true }
        ]
        chunkState.adaptiveVAD.lookAheadDurationMs = 100
      }

      // Stop should clear look-ahead buffer
      await stt.stopWs('test-sid')

      const finalChunkState = sttAny.chunkStateBySid.get('test-sid')
      if (finalChunkState != null) {
        expect(finalChunkState.adaptiveVAD.lookAheadBuffer.length).toBe(0)
        expect(finalChunkState.adaptiveVAD.lookAheadDurationMs).toBe(0)
      }
    })
  })

  describe('Pending Promises Cleanup', () => {
    it('should clean up pending finalizations after completion', async () => {
      const sttAny = stt as any
      const pendingFinalizations: Map<string, Promise<void>> = sttAny.pendingFinalizations

      // Call stopWs which creates and owns the finalization promise
      await stt.stopWs('test-sid')

      // The owning stopWs call should have cleaned up pendingFinalizations in its finally block
      expect(pendingFinalizations.has('test-sid')).toBe(false)
    })

    it('should handle errors in pending chunk finalizations', async () => {
      const sttAny = stt as any
      const pendingChunkFinalizations: Map<string, Promise<void>[]> = sttAny.pendingChunkFinalizations

      // Create a failing promise
      const failingPromise = Promise.reject(new Error('Test error'))
      pendingChunkFinalizations.set('test-sid', [failingPromise])

      // Should not throw when stopping
      await expect(stt.stopWs('test-sid')).resolves.not.toThrow()

      // Should clean up even with errors
      expect(pendingChunkFinalizations.has('test-sid')).toBe(false)
    })
  })

  describe('Multiple Subscribe/Unsubscribe Cycles', () => {
    it('should handle rapid subscribe/unsubscribe without leaking', async () => {
      const mockPublication: RemoteTrackPublication = { sid: 'test-sid', kind: 1 } as unknown as RemoteTrackPublication
      const mockParticipant: RemoteParticipant = { name: 'Test', identity: 'test-id' } as unknown as RemoteParticipant

      // Perform multiple cycles
      for (let i = 0; i < 10; i++) {
        const mockTrack: RemoteTrack = {} as unknown as RemoteTrack
        stt.subscribe(mockTrack, mockPublication, mockParticipant)
        await stt.unsubscribe(mockTrack, mockPublication, mockParticipant)
      }

      // All maps should be empty
      const sttAny = stt as any
      const trackBySid: Map<string, RemoteTrack> = sttAny.trackBySid
      const participantBySid: Map<string, RemoteParticipant> = sttAny.participantBySid

      expect(trackBySid.size).toBe(0)
      expect(participantBySid.size).toBe(0)
    })
  })
})
