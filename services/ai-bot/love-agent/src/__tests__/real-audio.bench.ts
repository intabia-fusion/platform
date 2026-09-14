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
 * Real-audio CPU benchmark for the love-agent VAD / chunking pipeline.
 *
 * Decodes OGG meeting recordings to 16 kHz mono s16le PCM using ffmpeg,
 * feeds frames of the same size the live pipeline receives from LiveKit
 * (default 10 ms = 160 samples = 320 bytes), and measures CPU + wall time
 * per pipeline stage: analyzeAudioBuffer (FFT / RMS / ZCR), isFrameSpeech,
 * updateNoiseFloor, updateSpeechRate, findOptimalCutPoint.
 *
 * Disabled by default. To run:
 *   LOVE_BENCHMARK_DIR=/Users/haiodo/Develop/audio_recordings \
 *     jest real-audio-benchmark --testTimeout=600000
 *
 * Optional env:
 *   LOVE_BENCHMARK_FRAME_MS   frame size in ms  (default 10, LiveKit default)
 *   LOVE_BENCHMARK_MAX_SEC    cap per-file duration in seconds (default: full)
 *   LOVE_BENCHMARK_FILES      comma-separated basenames (default: all *.ogg)
 */

import { spawnSync } from 'child_process'
import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'

import { AudioAnalyzer, analyzeAudioBuffer, isFrameSpeech, getAdaptiveVADThreshold } from '../stream/audio-analysis'
import { AudioAnalyzerWasm } from '../stream/fft-wasm'
import {
  createAdaptiveVADState,
  updateNoiseFloor,
  updateSpeechRate,
  findOptimalCutPoint
} from '../stream/chunk-detection'
import {
  type AdaptiveVADState,
  type LookAheadFrame,
  MAX_CHUNK_DURATION_MS,
  LOOK_AHEAD_BUFFER_MS,
  MIN_CHUNK_DURATION_MS,
  SPEECH_START_THRESHOLD_MS
} from '../stream/types'

const SAMPLE_RATE = 16000
const BYTES_PER_SAMPLE = 2
const BENCHMARK_DIR = process.env.LOVE_BENCHMARK_DIR
const FRAME_MS = Number(process.env.LOVE_BENCHMARK_FRAME_MS ?? '10')
const MAX_SEC =
  process.env.LOVE_BENCHMARK_MAX_SEC !== undefined ? Number(process.env.LOVE_BENCHMARK_MAX_SEC) : undefined
const FILE_FILTER = process.env.LOVE_BENCHMARK_FILES?.split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0)

interface StageStat {
  totalNs: bigint
  calls: number
}

interface ChunkSummary {
  index: number
  startSec: number
  endSec: number
  durationMs: number
  endReason: 'silence' | 'max_duration' | 'stream_end'
  speechFrames: number
  totalFrames: number
}

interface FileResult {
  file: string
  fileSizeBytes: number
  decodedPcmBytes: number
  audioDurationSec: number
  frameCount: number
  speechFrames: number
  chunks: ChunkSummary[]
  wallMs: number
  cpuUserMs: number
  cpuSystemMs: number
  stages: Record<string, StageStat>
}

function formatNs (ns: bigint): string {
  return (Number(ns) / 1e6).toFixed(2) + ' ms'
}

function addStage (stages: Record<string, StageStat>, name: string, deltaNs: bigint): void {
  const s = stages[name] ?? { totalNs: 0n, calls: 0 }
  s.totalNs += deltaNs
  s.calls += 1
  stages[name] = s
}

function decodePcm (oggPath: string, maxSec?: number): Buffer {
  const args = ['-nostdin', '-loglevel', 'error', '-i', oggPath, '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 's16le']
  if (maxSec !== undefined) {
    args.splice(args.indexOf('-i'), 0, '-t', String(maxSec))
  }
  args.push('pipe:1')

  const res = spawnSync(ffmpegInstaller.path, args, { maxBuffer: 1024 * 1024 * 1024 * 2 })
  if (res.status !== 0) {
    throw new Error(`ffmpeg failed: ${res.stderr.toString()}`)
  }
  return res.stdout
}

function runFileBenchmark (filePath: string): FileResult {
  const fileStat = statSync(filePath)
  // eslint-disable-next-line no-console
  console.log(`[bench] decoding ${filePath} (${(fileStat.size / 1024 / 1024).toFixed(1)} MB)`)

  const decodeStart = process.hrtime.bigint()
  const pcm = decodePcm(filePath, MAX_SEC)
  const decodeMs = Number(process.hrtime.bigint() - decodeStart) / 1e6
  // eslint-disable-next-line no-console
  console.log(`[bench] decoded ${(pcm.length / 1024 / 1024).toFixed(1)} MB PCM in ${decodeMs.toFixed(0)} ms`)

  const samplesPerFrame = Math.round((FRAME_MS / 1000) * SAMPLE_RATE)
  const bytesPerFrame = samplesPerFrame * BYTES_PER_SAMPLE
  const totalFrames = Math.floor(pcm.length / bytesPerFrame)
  const audioDurationSec = (totalFrames * FRAME_MS) / 1000

  const stages: Record<string, StageStat> = {}
  const vad: AdaptiveVADState = createAdaptiveVADState()
  const useLegacy = process.env.LOVE_BENCHMARK_LEGACY === '1'
  const useWasm = process.env.LOVE_BENCHMARK_WASM === '1'
  const samplesPerFrameForInit = Math.round((FRAME_MS / 1000) * SAMPLE_RATE)
  const analyzer = useWasm
    ? new AudioAnalyzerWasm(SAMPLE_RATE, undefined, samplesPerFrameForInit)
    : new AudioAnalyzer(SAMPLE_RATE)
  let speechFrames = 0

  // Chunk-level state (mirrors streamToFiles logic without file I/O)
  let isSpeaking = false
  let consecutiveSpeechMs = 0
  let consecutiveSilenceMs = 0
  let chunkStartMs: number | null = null
  let chunkEndMs = 0
  let chunkSpeechFrames = 0
  let chunkTotalFrames = 0
  let chunkIndex = 0
  const chunks: ChunkSummary[] = []
  let lookAhead: LookAheadFrame[] = []

  const finalizeChunk = (reason: 'silence' | 'max_duration' | 'stream_end', endMs: number): void => {
    if (chunkStartMs === null) return
    const durationMs = endMs - chunkStartMs
    if (durationMs < MIN_CHUNK_DURATION_MS && reason !== 'stream_end') {
      chunkStartMs = null
      chunkSpeechFrames = 0
      chunkTotalFrames = 0
      return
    }
    chunks.push({
      index: chunkIndex++,
      startSec: chunkStartMs / 1000,
      endSec: endMs / 1000,
      durationMs,
      endReason: reason,
      speechFrames: chunkSpeechFrames,
      totalFrames: chunkTotalFrames
    })
    chunkStartMs = null
    chunkSpeechFrames = 0
    chunkTotalFrames = 0
  }

  const cpuStart = process.cpuUsage()
  const wallStart = process.hrtime.bigint()

  for (let f = 0; f < totalFrames; f++) {
    const frameStartMs = f * FRAME_MS
    const frameEndMs = frameStartMs + FRAME_MS
    const buf = pcm.subarray(f * bytesPerFrame, (f + 1) * bytesPerFrame)

    const vadThreshold = getAdaptiveVADThreshold(vad)
    let t0 = process.hrtime.bigint()
    const analysis = useLegacy
      ? analyzeAudioBuffer(buf, SAMPLE_RATE, vad.previousFrameSpectrum)
      : analyzer.analyze(buf, vad.previousFrameSpectrum, vadThreshold)
    const stageName = useLegacy ? 'analyzeAudioBuffer(legacy)' : useWasm ? 'analyzer.analyze(wasm)' : 'analyzer.analyze'
    addStage(stages, stageName, process.hrtime.bigint() - t0)

    t0 = process.hrtime.bigint()
    const hasSpeech = isFrameSpeech(analysis, vad)
    addStage(stages, 'isFrameSpeech', process.hrtime.bigint() - t0)

    t0 = process.hrtime.bigint()
    updateNoiseFloor(vad, analysis.rms, !hasSpeech)
    addStage(stages, 'updateNoiseFloor', process.hrtime.bigint() - t0)

    t0 = process.hrtime.bigint()
    updateSpeechRate(vad, frameEndMs, hasSpeech, FRAME_MS)
    addStage(stages, 'updateSpeechRate', process.hrtime.bigint() - t0)

    if (analysis.spectrum !== null) {
      vad.previousFrameSpectrum = analysis.spectrum
    }

    if (hasSpeech) speechFrames++

    // Chunking state machine mirrors stt.ts streamToFiles
    if (hasSpeech) {
      consecutiveSpeechMs += FRAME_MS
      consecutiveSilenceMs = 0
      if (!isSpeaking && consecutiveSpeechMs >= SPEECH_START_THRESHOLD_MS) {
        isSpeaking = true
        if (chunkStartMs === null) {
          chunkStartMs = frameStartMs - consecutiveSpeechMs
          chunkSpeechFrames = 0
          chunkTotalFrames = 0
        }
      }
    } else {
      consecutiveSilenceMs += FRAME_MS
      consecutiveSpeechMs = 0
      if (isSpeaking && consecutiveSilenceMs >= vad.adaptiveSilenceThresholdMs) {
        isSpeaking = false
        if (chunkStartMs !== null) {
          finalizeChunk('silence', frameEndMs)
        }
      }
    }

    if (chunkStartMs !== null) {
      chunkTotalFrames++
      if (hasSpeech) chunkSpeechFrames++
      chunkEndMs = frameEndMs
      const currentDuration = frameEndMs - chunkStartMs

      if (currentDuration >= MAX_CHUNK_DURATION_MS - LOOK_AHEAD_BUFFER_MS) {
        lookAhead.push({
          buf,
          analysis,
          frameStartTime: frameStartMs,
          frameEndTime: frameEndMs,
          hasSpeech
        })
      }

      if (currentDuration >= MAX_CHUNK_DURATION_MS) {
        t0 = process.hrtime.bigint()
        const cut = findOptimalCutPoint(lookAhead, 50)
        addStage(stages, 'findOptimalCutPoint', process.hrtime.bigint() - t0)

        const endMs = cut >= 0 && cut < lookAhead.length ? lookAhead[cut].frameStartTime : frameEndMs
        finalizeChunk('max_duration', endMs)
        if (isSpeaking) {
          chunkStartMs = endMs
          chunkSpeechFrames = 0
          chunkTotalFrames = 0
        }
        lookAhead = []
      }
    }
  }

  if (chunkStartMs !== null) {
    finalizeChunk('stream_end', chunkEndMs)
  }

  const wallNs = process.hrtime.bigint() - wallStart
  const cpu = process.cpuUsage(cpuStart)

  return {
    file: filePath,
    fileSizeBytes: fileStat.size,
    decodedPcmBytes: pcm.length,
    audioDurationSec,
    frameCount: totalFrames,
    speechFrames,
    chunks,
    wallMs: Number(wallNs) / 1e6,
    cpuUserMs: cpu.user / 1000,
    cpuSystemMs: cpu.system / 1000,
    stages
  }
}

function reportResult (r: FileResult): void {
  const realtimeMs = r.audioDurationSec * 1000
  const cpuTotalMs = r.cpuUserMs + r.cpuSystemMs
  const realtimeRatio = cpuTotalMs / realtimeMs
  const perFrameUs = (r.wallMs * 1000) / Math.max(1, r.frameCount)
  const speechPct = (r.speechFrames / Math.max(1, r.frameCount)) * 100

  // eslint-disable-next-line no-console
  console.log(
    [
      '',
      `=== ${r.file} ===`,
      `audio:         ${r.audioDurationSec.toFixed(1)} s (${r.frameCount} frames @ ${FRAME_MS} ms)`,
      `speech:        ${r.speechFrames} frames (${speechPct.toFixed(1)}%)`,
      `chunks:        ${r.chunks.length}`,
      `wall:          ${r.wallMs.toFixed(0)} ms   (${perFrameUs.toFixed(1)} us/frame)`,
      `cpu user:      ${r.cpuUserMs.toFixed(0)} ms`,
      `cpu system:    ${r.cpuSystemMs.toFixed(0)} ms`,
      `cpu/realtime:  ${(realtimeRatio * 100).toFixed(2)}%   ` +
        `(1 CPU core handles ~${realtimeRatio > 0 ? (1 / realtimeRatio).toFixed(1) : 'inf'} concurrent streams)`,
      'stage breakdown:'
    ].join('\n')
  )

  const entries = Object.entries(r.stages).sort((a, b) => Number(b[1].totalNs - a[1].totalNs))
  const totalStageNs = entries.reduce((acc, [, s]) => acc + s.totalNs, 0n)
  for (const [name, s] of entries) {
    const avgUs = Number(s.totalNs) / s.calls / 1000
    const pct = totalStageNs > 0n ? (Number(s.totalNs) / Number(totalStageNs)) * 100 : 0
    // eslint-disable-next-line no-console
    console.log(
      `  ${name.padEnd(22)} total=${formatNs(s.totalNs).padStart(10)}  ` +
        `avg=${avgUs.toFixed(2).padStart(6)} us  calls=${s.calls}  share=${pct.toFixed(1)}%`
    )
  }

  if (r.chunks.length > 0) {
    const durations = r.chunks.map((c) => c.durationMs)
    const avgDur = durations.reduce((a, b) => a + b, 0) / durations.length
    const minDur = Math.min(...durations)
    const maxDur = Math.max(...durations)
    const silence = r.chunks.filter((c) => c.endReason === 'silence').length
    const maxd = r.chunks.filter((c) => c.endReason === 'max_duration').length
    // eslint-disable-next-line no-console
    console.log(
      `chunks: avg=${avgDur.toFixed(0)} ms  min=${minDur} ms  max=${maxDur} ms  ` +
        `silence=${silence}  max_duration=${maxd}  stream_end=${r.chunks.length - silence - maxd}`
    )
  }
}

const describeOrSkip = BENCHMARK_DIR !== undefined && existsSync(BENCHMARK_DIR) ? describe : describe.skip

describeOrSkip('real audio love-agent benchmark', () => {
  it('profiles VAD pipeline on meeting recordings', () => {
    // Guaranteed non-undefined inside describeOrSkip branch.
    const dir = BENCHMARK_DIR as string
    const all = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.ogg'))
    const files = FILE_FILTER !== undefined ? all.filter((f) => FILE_FILTER.includes(f)) : all
    if (files.length === 0) {
      throw new Error(`no .ogg files found in ${dir}`)
    }

    const results: FileResult[] = []
    for (const name of files) {
      results.push(runFileBenchmark(join(dir, name)))
    }

    for (const r of results) reportResult(r)

    // Aggregate
    const totalAudio = results.reduce((a, r) => a + r.audioDurationSec, 0)
    const totalWall = results.reduce((a, r) => a + r.wallMs, 0)
    const totalCpu = results.reduce((a, r) => a + r.cpuUserMs + r.cpuSystemMs, 0)
    const totalFrames = results.reduce((a, r) => a + r.frameCount, 0)
    const totalChunks = results.reduce((a, r) => a + r.chunks.length, 0)
    // eslint-disable-next-line no-console
    console.log(
      [
        '',
        '=== AGGREGATE ===',
        `files:            ${results.length}`,
        `audio total:      ${totalAudio.toFixed(1)} s`,
        `frames total:     ${totalFrames}`,
        `chunks total:     ${totalChunks}`,
        `wall total:       ${totalWall.toFixed(0)} ms`,
        `cpu total:        ${totalCpu.toFixed(0)} ms`,
        `cpu/realtime:     ${((totalCpu / (totalAudio * 1000)) * 100).toFixed(2)}%`,
        `concurrent/core:  ~${(1 / (totalCpu / (totalAudio * 1000))).toFixed(1)} streams`
      ].join('\n')
    )

    // Sanity: we should have processed something.
    expect(totalFrames).toBeGreaterThan(0)
  })
})
