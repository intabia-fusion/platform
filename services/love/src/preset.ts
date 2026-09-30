//
// Copyright © 2025 Hardcore Engineering Inc.
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
import { EncodingOptions, EncodingOptionsPreset, VideoCodec } from 'livekit-server-sdk'

export interface RecordingPreset {
  name: string
  width: number
  height: number
  preset: EncodingOptions | EncodingOptionsPreset
}

export const RecordingPreset720p: RecordingPreset = {
  name: '720p',
  width: 1280,
  height: 720,
  preset: EncodingOptionsPreset.H264_720P_30
}

// The library H264_1080P_30 caps at 4500 kbps and blurs text after every scroll. No `keyFrameInterval`:
// egress pairs it with `scenecut=0`, which blurs after scrolls too.
export const RecordingPreset1080p: RecordingPreset = {
  name: '1080p',
  width: 1920,
  height: 1080,
  preset: new EncodingOptions({
    width: 1920,
    height: 1080,
    framerate: 30,
    videoCodec: VideoCodec.H264_HIGH,
    videoBitrate: 12000
  })
}

export const RecordingPreset1080p15fps: RecordingPreset = {
  name: '1080p15fps',
  width: 1920,
  height: 1080,
  preset: new EncodingOptions({
    width: 1920,
    height: 1080,
    framerate: 15,
    videoCodec: VideoCodec.H264_MAIN,
    videoBitrate: 3000
  })
}

/** At 720p a shared screen is downscaled about twice and UI text becomes unreadable. */
export const DefaultRecordingPreset = RecordingPreset1080p

export function getRecordingPreset (name: string | undefined): RecordingPreset {
  switch (name) {
    case RecordingPreset1080p.name:
      return RecordingPreset1080p
    case RecordingPreset720p.name:
      return RecordingPreset720p
    case RecordingPreset1080p15fps.name:
      return RecordingPreset1080p15fps
    default:
      return DefaultRecordingPreset
  }
}
