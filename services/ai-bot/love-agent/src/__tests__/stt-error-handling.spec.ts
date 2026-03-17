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
 * Tests for error handling and cleanup in edge cases
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
    RecordFullAudio: true
  }
}))

describe('STT Error Handling Tests', () => {
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

  describe('Error Recovery', () => {
    it('should handle errors in stopWs gracefully', async () => {
      const mockTrack: RemoteTrack = {} as unknown as RemoteTrack
      const mockPublication: RemoteTrackPublication = { sid: 'test-sid', kind: 1 } as unknown as RemoteTrackPublication
      const mockParticipant: RemoteParticipant = { name: 'Test', identity: 'test-id' } as unknown as RemoteParticipant

      stt.subscribe(mockTrack, mockPublication, mockParticipant)
      stt.start()

      // Corrupt the stream to cause error
      const sttAny = stt as any
      const streamBySid: Map<string, any> = sttAny.streamBySid
      streamBySid.set('test-sid', {
        close: jest.fn(() => {
          throw new Error('Stream close error')
        })
      })

      // Should not throw even if close fails
      await expect(stt.stopWs('test-sid')).resolves.not.toThrow()

      // Maps should still be cleaned up
      expect(streamBySid.has('test-sid')).toBe(false)
    })

    it('should handle multiple concurrent stopWs calls', async () => {
      const mockTrack: RemoteTrack = {} as unknown as RemoteTrack
      const mockPublication: RemoteTrackPublication = { sid: 'test-sid', kind: 1 } as unknown as RemoteTrackPublication
      const mockParticipant: RemoteParticipant = { name: 'Test', identity: 'test-id' } as unknown as RemoteParticipant

      stt.subscribe(mockTrack, mockPublication, mockParticipant)
      stt.start()

      // Call stopWs multiple times concurrently
      const promises = [stt.stopWs('test-sid'), stt.stopWs('test-sid'), stt.stopWs('test-sid')]

      // All should complete without error
      await expect(Promise.all(promises)).resolves.not.toThrow()
    })

    it('should handle unsubscribe for non-existent track', async () => {
      const mockTrack: RemoteTrack = {} as unknown as RemoteTrack
      const mockPublication: RemoteTrackPublication = {
        sid: 'non-existent',
        kind: 1
      } as unknown as RemoteTrackPublication
      const mockParticipant: RemoteParticipant = { name: 'Test', identity: 'test-id' } as unknown as RemoteParticipant

      // Should not throw for non-existent sid
      await expect(stt.unsubscribe(mockTrack, mockPublication, mockParticipant)).resolves.not.toThrow()
    })

    it('should handle undefined sid in unsubscribe', async () => {
      const mockTrack: RemoteTrack = {} as unknown as RemoteTrack
      const mockPublication: RemoteTrackPublication = {
        sid: undefined,
        kind: 1
      } as unknown as RemoteTrackPublication
      const mockParticipant: RemoteParticipant = { name: 'Test', identity: 'test-id' } as unknown as RemoteParticipant

      // Should not throw for undefined sid
      await expect(stt.unsubscribe(mockTrack, mockPublication, mockParticipant)).resolves.not.toThrow()
    })
  })

  describe('Partial State Cleanup', () => {
    it('should clean up all Maps even if some are partially populated', async () => {
      const sttAny = stt as any
      const trackBySid: Map<string, any> = sttAny.trackBySid
      const streamBySid: Map<string, any> = sttAny.streamBySid
      const participantBySid: Map<string, any> = sttAny.participantBySid

      // Only populate some maps
      trackBySid.set('sid-1', {})
      participantBySid.set('sid-2', {})
      // streamBySid intentionally left empty

      await stt.close()

      expect(trackBySid.size).toBe(0)
      expect(streamBySid.size).toBe(0)
      expect(participantBySid.size).toBe(0)
    })

    it('should handle missing chunkState in finalizeChunk', async () => {
      // Call finalizeChunk for non-existent sid
      const sttAny = stt as any
      const finalizeChunk: (sid: string, reason: string) => void = sttAny.finalizeChunk.bind(stt)

      // Should not throw
      expect(() => {
        finalizeChunk('non-existent', 'stream_end')
      }).not.toThrow()
    })
  })

  describe('Async Iterator Cleanup', () => {
    it('should properly handle stream interruption', async () => {
      const mockTrack: RemoteTrack = {} as unknown as RemoteTrack
      const mockPublication: RemoteTrackPublication = { sid: 'test-sid', kind: 1 } as unknown as RemoteTrackPublication
      const mockParticipant: RemoteParticipant = { name: 'Test', identity: 'test-id' } as unknown as RemoteParticipant

      stt.subscribe(mockTrack, mockPublication, mockParticipant)
      stt.start()

      const sttAny = stt as any
      const streamBySid: Map<string, any> = sttAny.streamBySid

      // Simulate active stream
      const mockStream = {
        close: jest.fn(),
        [Symbol.asyncIterator]: jest.fn()
      }
      streamBySid.set('test-sid', mockStream)

      // Stop should close stream
      await stt.stopWs('test-sid')

      expect(mockStream.close).toHaveBeenCalled()
      expect(streamBySid.has('test-sid')).toBe(false)
    })

    it('should handle stream without close method', async () => {
      const mockTrack: RemoteTrack = {} as unknown as RemoteTrack
      const mockPublication: RemoteTrackPublication = { sid: 'test-sid', kind: 1 } as unknown as RemoteTrackPublication
      const mockParticipant: RemoteParticipant = { name: 'Test', identity: 'test-id' } as unknown as RemoteParticipant

      stt.subscribe(mockTrack, mockPublication, mockParticipant)
      stt.start()

      const sttAny = stt as any
      const streamBySid: Map<string, any> = sttAny.streamBySid

      // Simulate stream without close method
      const mockStream = {
        [Symbol.asyncIterator]: jest.fn()
        // No close method
      }
      streamBySid.set('test-sid', mockStream)

      // Should not throw even without close method
      await expect(stt.stopWs('test-sid')).resolves.not.toThrow()
    })
  })

  describe('Promise Cleanup Edge Cases', () => {
    it('should handle pendingChunkFinalizations with empty array', async () => {
      const sttAny = stt as any
      const pendingChunkFinalizations: Map<string, Promise<void>[]> = sttAny.pendingChunkFinalizations

      // Set empty array
      pendingChunkFinalizations.set('test-sid', [])

      // Should handle gracefully
      await expect(stt.stopWs('test-sid')).resolves.not.toThrow()

      expect(pendingChunkFinalizations.has('test-sid')).toBe(false)
    })

    it('should handle race condition in finally block', async () => {
      const sttAny = stt as any
      const pendingChunkFinalizations: Map<string, Promise<void>[]> = sttAny.pendingChunkFinalizations

      // Create a promise that resolves quickly
      const quickPromise = Promise.resolve()
      pendingChunkFinalizations.set('test-sid', [quickPromise])

      // Manually trigger cleanup before stopWs
      await quickPromise

      // Simulate race: entry might be removed between check and cleanup
      pendingChunkFinalizations.delete('test-sid')

      // Should not throw even if entry is missing
      await expect(stt.stopWs('test-sid')).resolves.not.toThrow()
    })
  })

  describe('Stopped Sids Management', () => {
    it('should track stopped sids correctly', async () => {
      const sttAny = stt as any
      const stoppedSids: Set<string> = sttAny.stoppedSids

      const mockTrack: RemoteTrack = {} as unknown as RemoteTrack
      const mockPublication: RemoteTrackPublication = { sid: 'test-sid', kind: 1 } as unknown as RemoteTrackPublication
      const mockParticipant: RemoteParticipant = { name: 'Test', identity: 'test-id' } as unknown as RemoteParticipant

      stt.subscribe(mockTrack, mockPublication, mockParticipant)
      stt.start()

      // Before stop
      expect(stoppedSids.has('test-sid')).toBe(false)

      await stt.stopWs('test-sid')

      // After stop - should be removed from stoppedSids
      expect(stoppedSids.has('test-sid')).toBe(false)
    })

    it('should handle duplicate stopWs calls for same sid', async () => {
      const mockTrack: RemoteTrack = {} as unknown as RemoteTrack
      const mockPublication: RemoteTrackPublication = { sid: 'test-sid', kind: 1 } as unknown as RemoteTrackPublication
      const mockParticipant: RemoteParticipant = { name: 'Test', identity: 'test-id' } as unknown as RemoteParticipant

      stt.subscribe(mockTrack, mockPublication, mockParticipant)
      stt.start()

      // First stop
      await stt.stopWs('test-sid')

      // Second stop for same sid - should not error
      await expect(stt.stopWs('test-sid')).resolves.not.toThrow()
    })
  })
})
