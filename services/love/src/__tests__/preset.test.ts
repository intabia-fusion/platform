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

import { EncodingOptionsPreset, VideoCodec } from 'livekit-server-sdk'
import {
  DefaultRecordingPreset,
  getRecordingPreset,
  RecordingPreset1080p,
  RecordingPreset1080p15fps,
  RecordingPreset720p
} from '../preset'

describe('getRecordingPreset', () => {
  it('records 1080p unless RECORDING_PRESET says otherwise', () => {
    // 720p halves a 1920-wide screen share in the composite and makes UI text unreadable.
    expect(DefaultRecordingPreset).toBe(RecordingPreset1080p)
    expect(getRecordingPreset(undefined)).toBe(RecordingPreset1080p)
    expect(getRecordingPreset('')).toBe(RecordingPreset1080p)
    expect(getRecordingPreset('H264_720P_30')).toBe(RecordingPreset1080p)
    expect(RecordingPreset1080p.preset).toMatchObject({
      width: 1920,
      height: 1080,
      framerate: 30,
      videoBitrate: 12000,
      videoCodec: VideoCodec.H264_HIGH
    })
    expect(RecordingPreset720p.preset).toBe(EncodingOptionsPreset.H264_720P_30)
  })

  it('resolves the named presets', () => {
    expect(getRecordingPreset('720p')).toBe(RecordingPreset720p)
    expect(getRecordingPreset('1080p')).toBe(RecordingPreset1080p)
    expect(getRecordingPreset('1080p15fps')).toBe(RecordingPreset1080p15fps)
  })
})
