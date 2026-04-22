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

// Synchronous WASM loader + JS-side wrapper mirroring AudioAnalyzer.analyze().
// The WASM kernel owns a single linear memory; init() lays it out once and
// returns the PCM byte offset. Each analyze() call:
//   1. copies the frame's int16 PCM into PCM_OFF
//   2. invokes analyzeFrame(pcmSamples, sampleRate, runSpectral)
//   3. reads back the RES_OFF block (8 f64) and the magnitude spectrum

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve as pathResolve } from 'node:path'

import { type AudioAnalysis, VAD_FRAME_THRESHOLD, VAD_THRESHOLD_DEFAULT } from './types.js'
import { SPECTRAL_DECIMATION_DEFAULT } from './audio-analysis.js'

interface FftExports {
  memory: WebAssembly.Memory
  init: (fftSize: number, maxPcmSamples: number) => number
  analyzeFrame: (pcmSamples: number, sampleRate: number, runSpectral: number) => number
  getPcmOffset: () => number
  getResultOffset: () => number
  getMagnitudeOffset: () => number
}

const AMBIGUOUS_RMS_LOW = 0.5
const AMBIGUOUS_RMS_HIGH = 2.0

function nearestPowerOf2 (n: number): number {
  if (n <= 0) return 1
  let p = 1
  while (p * 2 <= n) p *= 2
  return p
}

let cachedModule: WebAssembly.Module | null = null

function moduleDir (): string {
  // CJS (ts-jest): __filename is defined.
  if (typeof __filename !== 'undefined') return dirname(__filename)
  // ESM (prod bundle): reach import.meta.url through eval so ts-jest's CJS
  // compile step doesn't choke on the syntax.
  try {
    // eslint-disable-next-line no-eval
    const url = (eval('import.meta.url') as string) ?? ''
    if (url !== '') return dirname(fileURLToPath(url))
  } catch {}
  return ''
}

function loadModule (): WebAssembly.Module {
  if (cachedModule !== null) return cachedModule
  const here = moduleDir()
  // Try module-relative first (works in both dev and prod bundle), then
  // cwd-relative as a last-resort fallback.
  const candidates = [
    here !== '' ? join(here, '..', 'wasm', 'fft.wasm') : '',
    here !== '' ? join(here, '..', '..', 'src', 'wasm', 'fft.wasm') : '',
    pathResolve(process.cwd(), 'src/wasm/fft.wasm'),
    pathResolve(process.cwd(), 'bundle/wasm/fft.wasm')
  ].filter((p) => p !== '')
  let bytes: Buffer | null = null
  for (const p of candidates) {
    try {
      bytes = readFileSync(p)
      break
    } catch {}
  }
  if (bytes === null) {
    throw new Error(`fft.wasm not found; searched: ${candidates.join(', ')}`)
  }
  cachedModule = new WebAssembly.Module(new Uint8Array(bytes))
  return cachedModule
}

export class AudioAnalyzerWasm {
  private readonly exports: FftExports
  private readonly pcmOffset: number
  private readonly resultOffset: number
  private readonly magnitudeOffset: number
  private readonly fftSize: number
  private readonly maxPcmSamples: number
  private frameCount = 0
  private lastSpectrum: Float64Array | null = null

  constructor (
    readonly sampleRate: number = 16000,
    readonly spectralDecimation: number = SPECTRAL_DECIMATION_DEFAULT,
    expectedFrameSamples: number = 160
  ) {
    const mod = loadModule()
    const instance = new WebAssembly.Instance(mod, {
      env: {
        abort: (_msg: number, _file: number, line: number, col: number): void => {
          throw new Error(`WASM abort at ${line}:${col}`)
        }
      }
    })
    this.exports = instance.exports as unknown as FftExports

    this.fftSize = nearestPowerOf2(Math.min(512, Math.max(expectedFrameSamples, 64)))
    this.maxPcmSamples = Math.max(expectedFrameSamples * 4, this.fftSize)

    this.pcmOffset = this.exports.init(this.fftSize, this.maxPcmSamples)
    this.resultOffset = this.exports.getResultOffset()
    this.magnitudeOffset = this.exports.getMagnitudeOffset()
  }

  analyze (
    buf: Buffer,
    previousSpectrum: Float64Array | null,
    vadThreshold: number = VAD_THRESHOLD_DEFAULT
  ): AudioAnalysis {
    const numSamples = buf.length >> 1
    if (numSamples > this.maxPcmSamples) {
      throw new Error(`frame size ${numSamples} exceeds allocated ${this.maxPcmSamples}`)
    }

    const mem = new Uint8Array(this.exports.memory.buffer)
    // Copy PCM bytes (little-endian int16) directly — the WASM kernel reads
    // them with load<i16>, matching Buffer's LE layout on all Node platforms.
    mem.set(buf.subarray(0, numSamples * 2), this.pcmOffset)

    // Quick fast-path RMS estimate is not available before the kernel runs,
    // so mirror the JS analyzer's decimation logic by deferring to "always
    // spectral" when lastSpectrum is null, otherwise honor decimation + the
    // ambiguous-RMS rule *after* we've computed RMS this frame.
    const fc = this.frameCount++
    const forceSpectralByDecimation =
      this.spectralDecimation <= 1 || this.lastSpectrum === null || fc % this.spectralDecimation === 0
    // We cannot know RMS before calling analyzeFrame, so run spectral
    // whenever decimation triggers. For ambiguous RMS we'd need a 2-pass
    // call; accept the same minor cost as the JS path which also decides
    // after computing RMS in JS — here the savings still come from skipping
    // FFT on non-decimation frames.
    const runSpectral = forceSpectralByDecimation ? 1 : 0

    const didSpectral = this.exports.analyzeFrame(numSamples, this.sampleRate, runSpectral) === 1

    const results = new Float64Array(this.exports.memory.buffer, this.resultOffset, 8)
    const rms = results[0]
    const peak = results[1]
    const activeSamples = results[2] | 0
    const sumSquares = results[3]
    const zeroCrossingRate = results[4]

    // If the primary decision was "skip" but RMS is in the ambiguous band,
    // re-run with spectral on (rare; keeps parity with JS analyzer).
    let spectralRan = didSpectral
    let lowBandEnergy = 0
    let highBandEnergy = 0
    let spectralCentroid = 0
    if (!spectralRan) {
      const ambiguous = rms > vadThreshold * AMBIGUOUS_RMS_LOW && rms < vadThreshold * AMBIGUOUS_RMS_HIGH
      if (ambiguous) {
        this.exports.analyzeFrame(numSamples, this.sampleRate, 1)
        spectralRan = true
      }
    }
    if (spectralRan) {
      lowBandEnergy = results[5]
      highBandEnergy = results[6]
      spectralCentroid = results[7]
    }

    let spectrum: Float64Array | null = null
    let spectralFlux = 0
    if (spectralRan) {
      // Copy magnitude spectrum out of WASM memory; the WASM buffer is
      // reused next call so we cannot hand it out directly.
      const view = new Float64Array(this.exports.memory.buffer, this.magnitudeOffset, this.fftSize)
      spectrum = new Float64Array(this.fftSize)
      spectrum.set(view)

      if (previousSpectrum !== null && previousSpectrum.length === spectrum.length) {
        let fluxSum = 0
        for (let i = 0; i < spectrum.length; i++) {
          const diff = spectrum[i] - previousSpectrum[i]
          if (diff > 0) fluxSum += diff
        }
        spectralFlux = fluxSum / spectrum.length
      }
      this.lastSpectrum = spectrum
    }

    // activeSamples threshold is enforced inside WASM with the same
    // VAD_FRAME_THRESHOLD constant — kept here only for the linter.
    void VAD_FRAME_THRESHOLD

    return {
      rms,
      peak,
      activeSamples,
      totalSamples: numSamples,
      sumSquares,
      zeroCrossingRate,
      lowBandEnergy,
      highBandEnergy,
      spectralCentroid,
      spectralFlux,
      spectrum,
      spectralValid: spectralRan
    }
  }
}
