//
// Copyright © 2025 Andrey Sobolev (haiodo@gmail.com)
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

import { gzipSync } from 'zlib'
import { spawn } from 'child_process'
import { writeFileSync, unlinkSync, readFileSync, mkdtempSync, rmdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import { createWavHeader } from '../stream/wav-utils'

const SAMPLE_RATE = 16000
const CHANNELS = 1
const BITS_PER_SAMPLE = 16
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8

// Number of iterations for averaging results
const ITERATIONS = 5

interface CompressionStats {
  compressedSize: number
  compressionRatio: number
  avgTimeMs: number
  minTimeMs: number
  maxTimeMs: number
  times: number[]
}

interface BenchmarkResult {
  durationSeconds: number
  originalSize: number
  gzip: CompressionStats
  opus: CompressionStats
  opusLevel1: CompressionStats
}

/**
 * Generate synthetic audio data simulating speech
 * Uses a mix of sine waves with varying amplitudes to simulate speech patterns
 */
function generateSpeechLikeAudio (durationSeconds: number): Buffer {
  const numSamples = Math.floor(SAMPLE_RATE * durationSeconds)
  const dataLength = numSamples * BYTES_PER_SAMPLE
  const buffer = Buffer.alloc(dataLength)

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE

    // Mix of frequencies typical in human speech (100-3000 Hz)
    // Fundamental frequency around 150 Hz
    const fundamental = Math.sin(2 * Math.PI * 150 * t)
    // First formant around 500 Hz
    const formant1 = 0.7 * Math.sin(2 * Math.PI * 500 * t)
    // Second formant around 1500 Hz
    const formant2 = 0.4 * Math.sin(2 * Math.PI * 1500 * t)
    // Third formant around 2500 Hz
    const formant3 = 0.2 * Math.sin(2 * Math.PI * 2500 * t)

    // Add amplitude modulation to simulate speech rhythm (syllables)
    const syllableRate = 4 // ~4 syllables per second
    const amplitudeEnvelope = 0.5 + 0.5 * Math.sin(2 * Math.PI * syllableRate * t)

    // Add some noise for realism
    const noise = 0.05 * (Math.random() * 2 - 1)

    // Combine all components
    const sample = amplitudeEnvelope * (fundamental + formant1 + formant2 + formant3) * 0.25 + noise

    // Convert to 16-bit PCM
    const intSample = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)))
    buffer.writeInt16LE(intSample, i * BYTES_PER_SAMPLE)
  }

  return buffer
}

/**
 * Create a complete WAV file from audio data
 */
function createWavFile (audioData: Buffer): Buffer {
  const header = createWavHeader(audioData.length, SAMPLE_RATE, CHANNELS, BITS_PER_SAMPLE)
  return Buffer.concat([header, audioData])
}

/**
 * Compress using gzip and measure time
 */
function compressWithGzip (wavData: Buffer): { data: Buffer, timeMs: number } {
  const start = performance.now()
  const compressed = gzipSync(wavData, { level: 6 })
  const end = performance.now()
  return { data: compressed, timeMs: end - start }
}

/**
 * Convert WAV to OGG Opus using ffmpeg and measure time
 */
async function compressWithOpus (
  wavData: Buffer,
  tempDir: string,
  compressionLevel: number = 10
): Promise<{ data: Buffer, timeMs: number }> {
  const wavPath = join(tempDir, `input_${Date.now()}.wav`)
  const oggPath = join(tempDir, `output_${Date.now()}.ogg`)

  writeFileSync(wavPath, wavData)

  const start = performance.now()

  await new Promise<void>((resolve, reject) => {
    const ffmpegPath = ffmpegInstaller.path
    const args = [
      '-i',
      wavPath,
      '-codec:a',
      'libopus',
      '-b:a',
      '16k', // 16 kbps - optimal for 16kHz speech audio
      '-vbr',
      'on',
      '-compression_level',
      compressionLevel.toString(),
      '-application',
      'voip',
      '-y',
      oggPath
    ]

    const proc = spawn(ffmpegPath, args)

    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to start ffmpeg: ${err.message}`))
    })
  })

  const end = performance.now()

  const oggData = readFileSync(oggPath)

  // Cleanup
  try {
    unlinkSync(wavPath)
    unlinkSync(oggPath)
  } catch {
    // Ignore cleanup errors
  }

  return { data: oggData, timeMs: end - start }
}

/**
 * Run benchmark for a specific duration
 */
async function runBenchmark (durationSeconds: number, tempDir: string): Promise<BenchmarkResult> {
  const audioData = generateSpeechLikeAudio(durationSeconds)
  const wavData = createWavFile(audioData)

  const gzipTimes: number[] = []
  const opusTimes: number[] = []
  const opusLevel1Times: number[] = []

  let gzipSize = 0
  let opusSize = 0
  let opusLevel1Size = 0

  // Run multiple iterations
  for (let i = 0; i < ITERATIONS; i++) {
    // Gzip compression
    const gzipResult = compressWithGzip(wavData)
    gzipTimes.push(gzipResult.timeMs)
    gzipSize = gzipResult.data.length

    // Opus compression level 10 (default)
    const opusResult = await compressWithOpus(wavData, tempDir, 10)
    opusTimes.push(opusResult.timeMs)
    opusSize = opusResult.data.length

    // Opus compression level 1 (fast)
    const opusLevel1Result = await compressWithOpus(wavData, tempDir, 1)
    opusLevel1Times.push(opusLevel1Result.timeMs)
    opusLevel1Size = opusLevel1Result.data.length
  }

  return {
    durationSeconds,
    originalSize: wavData.length,
    gzip: {
      compressedSize: gzipSize,
      compressionRatio: (1 - gzipSize / wavData.length) * 100,
      avgTimeMs: gzipTimes.reduce((a, b) => a + b, 0) / gzipTimes.length,
      minTimeMs: Math.min(...gzipTimes),
      maxTimeMs: Math.max(...gzipTimes),
      times: gzipTimes
    },
    opus: {
      compressedSize: opusSize,
      compressionRatio: (1 - opusSize / wavData.length) * 100,
      avgTimeMs: opusTimes.reduce((a, b) => a + b, 0) / opusTimes.length,
      minTimeMs: Math.min(...opusTimes),
      maxTimeMs: Math.max(...opusTimes),
      times: opusTimes
    },
    opusLevel1: {
      compressedSize: opusLevel1Size,
      compressionRatio: (1 - opusLevel1Size / wavData.length) * 100,
      avgTimeMs: opusLevel1Times.reduce((a, b) => a + b, 0) / opusLevel1Times.length,
      minTimeMs: Math.min(...opusLevel1Times),
      maxTimeMs: Math.max(...opusLevel1Times),
      times: opusLevel1Times
    }
  }
}

/**
 * Format bytes to human readable string
 */
function formatBytes (bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * Print benchmark results in a table format
 */
function printResults (results: BenchmarkResult[]): void {
  console.log('\n' + '='.repeat(100))
  console.log('AUDIO COMPRESSION BENCHMARK RESULTS')
  console.log('='.repeat(100))
  console.log(`Sample Rate: ${SAMPLE_RATE} Hz, Channels: ${CHANNELS}, Bits per Sample: ${BITS_PER_SAMPLE}`)
  console.log(`Iterations per test: ${ITERATIONS}`)
  console.log('='.repeat(100))

  console.log('\n--- SIZE COMPARISON ---')
  console.log(
    `${'Duration'.padEnd(10)} | ${'Original'.padEnd(12)} | ${'Gzip'.padEnd(12)} | ${'Gzip %'.padEnd(8)} | ${'Opus L10'.padEnd(12)} | ${'L10 %'.padEnd(8)} | ${'Opus L1'.padEnd(12)} | ${'L1 %'.padEnd(8)}`
  )
  console.log('-'.repeat(105))

  for (const r of results) {
    console.log(
      `${r.durationSeconds.toString().padEnd(9)}s | ${formatBytes(r.originalSize).padEnd(12)} | ${formatBytes(r.gzip.compressedSize).padEnd(12)} | ${r.gzip.compressionRatio.toFixed(1).padEnd(7)}% | ${formatBytes(r.opus.compressedSize).padEnd(12)} | ${r.opus.compressionRatio.toFixed(1).padEnd(7)}% | ${formatBytes(r.opusLevel1.compressedSize).padEnd(12)} | ${r.opusLevel1.compressionRatio.toFixed(1).padEnd(7)}%`
    )
  }

  console.log('\n--- SPEED COMPARISON (ms) ---')
  console.log(
    `${'Duration'.padEnd(10)} | ${'Gzip Avg'.padEnd(12)} | ${'Opus L10 Avg'.padEnd(14)} | ${'L10/Gzip'.padEnd(10)} | ${'Opus L1 Avg'.padEnd(14)} | ${'L1/Gzip'.padEnd(10)} | ${'L10/L1'.padEnd(10)}`
  )
  console.log('-'.repeat(95))

  for (const r of results) {
    const l10VsGzip = (r.opus.avgTimeMs / r.gzip.avgTimeMs).toFixed(1)
    const l1VsGzip = (r.opusLevel1.avgTimeMs / r.gzip.avgTimeMs).toFixed(1)
    const l10VsL1 = (r.opus.avgTimeMs / r.opusLevel1.avgTimeMs).toFixed(2)
    console.log(
      `${r.durationSeconds.toString().padEnd(9)}s | ${r.gzip.avgTimeMs.toFixed(2).padEnd(12)} | ${r.opus.avgTimeMs.toFixed(2).padEnd(14)} | ${(l10VsGzip + 'x').padEnd(10)} | ${r.opusLevel1.avgTimeMs.toFixed(2).padEnd(14)} | ${(l1VsGzip + 'x').padEnd(10)} | ${(l10VsL1 + 'x').padEnd(10)}`
    )
  }

  console.log('\n--- SIZE vs GZIP COMPARISON ---')
  console.log(
    `${'Duration'.padEnd(10)} | ${'Opus L10/Gzip'.padEnd(15)} | ${'Opus L1/Gzip'.padEnd(15)} | ${'Savings L10'.padEnd(15)} | ${'Savings L1'.padEnd(15)}`
  )
  console.log('-'.repeat(75))

  for (const r of results) {
    const l10VsGzipSize = ((r.opus.compressedSize / r.gzip.compressedSize) * 100).toFixed(1)
    const l1VsGzipSize = ((r.opusLevel1.compressedSize / r.gzip.compressedSize) * 100).toFixed(1)
    const savingsL10 = formatBytes(r.gzip.compressedSize - r.opus.compressedSize)
    const savingsL1 = formatBytes(r.gzip.compressedSize - r.opusLevel1.compressedSize)
    console.log(
      `${r.durationSeconds.toString().padEnd(9)}s | ${(l10VsGzipSize + '%').padEnd(15)} | ${(l1VsGzipSize + '%').padEnd(15)} | ${savingsL10.padEnd(15)} | ${savingsL1.padEnd(15)}`
    )
  }

  console.log('\n--- SUMMARY ---')
  const totalGzipTime = results.reduce((a, r) => a + r.gzip.avgTimeMs, 0)
  const totalOpusTime = results.reduce((a, r) => a + r.opus.avgTimeMs, 0)
  const totalOpusL1Time = results.reduce((a, r) => a + r.opusLevel1.avgTimeMs, 0)
  const avgGzipCompression = results.reduce((a, r) => a + r.gzip.compressionRatio, 0) / results.length
  const avgOpusCompression = results.reduce((a, r) => a + r.opus.compressionRatio, 0) / results.length
  const avgOpusL1Compression = results.reduce((a, r) => a + r.opusLevel1.compressionRatio, 0) / results.length

  console.log(`Average Gzip compression: ${avgGzipCompression.toFixed(1)}%`)
  console.log(`Average Opus L10 compression: ${avgOpusCompression.toFixed(1)}%`)
  console.log(`Average Opus L1 compression: ${avgOpusL1Compression.toFixed(1)}%`)
  console.log('')
  console.log(`Total Gzip time: ${totalGzipTime.toFixed(2)}ms`)
  console.log(
    `Total Opus L10 time: ${totalOpusTime.toFixed(2)}ms (${(totalOpusTime / totalGzipTime).toFixed(1)}x slower than Gzip)`
  )
  console.log(
    `Total Opus L1 time: ${totalOpusL1Time.toFixed(2)}ms (${(totalOpusL1Time / totalGzipTime).toFixed(1)}x slower than Gzip)`
  )
  console.log('')
  console.log(
    `Opus L10 produces ${((results.reduce((a, r) => a + r.opus.compressedSize, 0) / results.reduce((a, r) => a + r.gzip.compressedSize, 0)) * 100).toFixed(1)}% of Gzip file size`
  )
  console.log(
    `Opus L1 produces ${((results.reduce((a, r) => a + r.opusLevel1.compressedSize, 0) / results.reduce((a, r) => a + r.gzip.compressedSize, 0)) * 100).toFixed(1)}% of Gzip file size`
  )
  console.log(`Opus L1 is ${(totalOpusTime / totalOpusL1Time).toFixed(2)}x faster than Opus L10`)
  console.log('='.repeat(100) + '\n')
}

describe('Audio Compression Benchmark', () => {
  let tempDir: string

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'audio-compression-test-'))
  })

  afterAll(() => {
    try {
      // Clean up temp directory
      rmdirSync(tempDir, { recursive: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  const durations = [1, 5, 10, 30]
  const results: BenchmarkResult[] = []

  describe.each(durations)('%d second audio', (duration) => {
    it(`should benchmark compression for ${duration}s audio`, async () => {
      const result = await runBenchmark(duration, tempDir)
      results.push(result)

      // Basic assertions to ensure compression works
      expect(result.gzip.compressedSize).toBeLessThan(result.originalSize)
      expect(result.opus.compressedSize).toBeLessThan(result.originalSize)
      expect(result.gzip.avgTimeMs).toBeGreaterThan(0)
      expect(result.opus.avgTimeMs).toBeGreaterThan(0)

      // Log individual result
      console.log(`\n[${duration}s audio]`)
      console.log(`  Original: ${formatBytes(result.originalSize)}`)
      console.log(
        `  Gzip: ${formatBytes(result.gzip.compressedSize)} (${result.gzip.compressionRatio.toFixed(1)}%) in ${result.gzip.avgTimeMs.toFixed(2)}ms avg`
      )
      console.log(
        `  Opus L10: ${formatBytes(result.opus.compressedSize)} (${result.opus.compressionRatio.toFixed(1)}%) in ${result.opus.avgTimeMs.toFixed(2)}ms avg`
      )
      console.log(
        `  Opus L1: ${formatBytes(result.opusLevel1.compressedSize)} (${result.opusLevel1.compressionRatio.toFixed(1)}%) in ${result.opusLevel1.avgTimeMs.toFixed(2)}ms avg`
      )
    }, 60000) // 60 second timeout for longer audio
  })

  it('should print final summary', () => {
    printResults(results)

    // Additional assertions for the complete benchmark
    expect(results.length).toBe(durations.length)

    // Opus should generally achieve better compression for audio
    for (const result of results) {
      expect(result.opus.compressionRatio).toBeGreaterThan(result.gzip.compressionRatio)
    }
  })
})

describe('Audio Generation Validation', () => {
  it('should generate correct buffer size for given duration', () => {
    const duration = 1 // 1 second
    const audioData = generateSpeechLikeAudio(duration)
    const expectedSize = SAMPLE_RATE * BYTES_PER_SAMPLE * duration

    expect(audioData.length).toBe(expectedSize)
  })

  it('should generate valid 16-bit PCM samples', () => {
    const audioData = generateSpeechLikeAudio(0.1) // 100ms
    const numSamples = audioData.length / BYTES_PER_SAMPLE

    for (let i = 0; i < numSamples; i++) {
      const sample = audioData.readInt16LE(i * BYTES_PER_SAMPLE)
      expect(sample).toBeGreaterThanOrEqual(-32768)
      expect(sample).toBeLessThanOrEqual(32767)
    }
  })

  it('should create valid WAV file structure', () => {
    const audioData = generateSpeechLikeAudio(0.1)
    const wavData = createWavFile(audioData)

    // Check WAV header markers
    expect(wavData.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wavData.toString('ascii', 8, 12)).toBe('WAVE')
    expect(wavData.toString('ascii', 12, 16)).toBe('fmt ')
    expect(wavData.toString('ascii', 36, 40)).toBe('data')

    // Check sample rate
    expect(wavData.readUInt32LE(24)).toBe(SAMPLE_RATE)

    // Check channels
    expect(wavData.readUInt16LE(22)).toBe(CHANNELS)

    // Check bits per sample
    expect(wavData.readUInt16LE(34)).toBe(BITS_PER_SAMPLE)

    // Check data size
    expect(wavData.readUInt32LE(40)).toBe(audioData.length)
  })
})

describe('Compression Method Comparison', () => {
  let tempDir: string

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'compression-compare-'))
  })

  afterAll(() => {
    try {
      rmdirSync(tempDir, { recursive: true })
    } catch {
      // Ignore
    }
  })

  it('should compare gzip levels', () => {
    const audioData = generateSpeechLikeAudio(5)
    const wavData = createWavFile(audioData)

    const levels = [1, 3, 6, 9]
    const results: Array<{ level: number, size: number, timeMs: number }> = []

    for (const level of levels) {
      const start = performance.now()
      const compressed = gzipSync(wavData, { level })
      const end = performance.now()

      results.push({
        level,
        size: compressed.length,
        timeMs: end - start
      })
    }

    console.log('\n--- GZIP LEVEL COMPARISON (5s audio) ---')
    console.log(`${'Level'.padEnd(10)} | ${'Size'.padEnd(14)} | ${'Time (ms)'.padEnd(12)} | ${'Ratio'.padEnd(10)}`)
    console.log('-'.repeat(55))

    for (const r of results) {
      const ratio = ((1 - r.size / wavData.length) * 100).toFixed(1)
      console.log(
        `${r.level.toString().padEnd(10)} | ${formatBytes(r.size).padEnd(14)} | ${r.timeMs.toFixed(2).padEnd(12)} | ${ratio.padEnd(9)}%`
      )
    }

    // Higher levels should produce smaller or equal output
    for (let i = 1; i < results.length; i++) {
      expect(results[i].size).toBeLessThanOrEqual(results[i - 1].size + 100) // Allow small variance
    }
  })

  it('should compare opus bitrates', async () => {
    const audioData = generateSpeechLikeAudio(5)
    const wavData = createWavFile(audioData)
    const wavPath = join(tempDir, 'bitrate_test.wav')
    writeFileSync(wavPath, wavData)

    const bitrates = ['12k', '16k', '24k', '32k']
    const results: Array<{ bitrate: string, size: number, timeMs: number }> = []

    for (const bitrate of bitrates) {
      const oggPath = join(tempDir, `output_${bitrate}.ogg`)

      const start = performance.now()
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(ffmpegInstaller.path, [
          '-i',
          wavPath,
          '-codec:a',
          'libopus',
          '-b:a',
          bitrate,
          '-vbr',
          'on',
          '-compression_level',
          '10',
          '-application',
          'voip',
          '-y',
          oggPath
        ])

        proc.on('close', (code) => {
          if (code === 0) resolve()
          else reject(new Error('ffmpeg error'))
        })
        proc.on('error', reject)
      })
      const end = performance.now()

      const oggData = readFileSync(oggPath)
      results.push({
        bitrate,
        size: oggData.length,
        timeMs: end - start
      })

      unlinkSync(oggPath)
    }

    console.log('\n--- OPUS BITRATE COMPARISON (5s audio) ---')
    console.log(`${'Bitrate'.padEnd(10)} | ${'Size'.padEnd(14)} | ${'Time (ms)'.padEnd(12)} | ${'Ratio'.padEnd(10)}`)
    console.log('-'.repeat(55))

    for (const r of results) {
      const ratio = ((1 - r.size / wavData.length) * 100).toFixed(1)
      console.log(
        `${r.bitrate.padEnd(10)} | ${formatBytes(r.size).padEnd(14)} | ${r.timeMs.toFixed(2).padEnd(12)} | ${ratio.padEnd(9)}%`
      )
    }

    unlinkSync(wavPath)

    // Higher bitrates should produce larger files
    for (let i = 1; i < results.length; i++) {
      expect(results[i].size).toBeGreaterThanOrEqual(results[i - 1].size - 100) // Allow small variance
    }
  }, 60000)

  it('should compare opus compression levels', async () => {
    const audioData = generateSpeechLikeAudio(5)
    const wavData = createWavFile(audioData)
    const wavPath = join(tempDir, 'level_test.wav')
    writeFileSync(wavPath, wavData)

    // compression_level: 0 (fastest) to 10 (best compression, slowest)
    const levels = [0, 1, 2, 3, 5, 7, 10]
    const results: Array<{ level: number, size: number, timeMs: number }> = []

    for (const level of levels) {
      const oggPath = join(tempDir, `output_level_${level}.ogg`)

      const start = performance.now()
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(ffmpegInstaller.path, [
          '-i',
          wavPath,
          '-codec:a',
          'libopus',
          '-b:a',
          '16k',
          '-vbr',
          'on',
          '-compression_level',
          level.toString(),
          '-application',
          'voip',
          '-y',
          oggPath
        ])

        proc.on('close', (code) => {
          if (code === 0) resolve()
          else reject(new Error('ffmpeg error'))
        })
        proc.on('error', reject)
      })
      const end = performance.now()

      const oggData = readFileSync(oggPath)
      results.push({
        level,
        size: oggData.length,
        timeMs: end - start
      })

      unlinkSync(oggPath)
    }

    console.log('\n--- OPUS COMPRESSION LEVEL COMPARISON (5s audio, 16k bitrate) ---')
    console.log(
      `${'Level'.padEnd(10)} | ${'Size'.padEnd(14)} | ${'Time (ms)'.padEnd(12)} | ${'Ratio'.padEnd(10)} | ${'vs Level 10'.padEnd(12)}`
    )
    console.log('-'.repeat(70))

    const level10Result = results.find((r) => r.level === 10)
    for (const r of results) {
      const ratio = ((1 - r.size / wavData.length) * 100).toFixed(1)
      const speedup = level10Result !== undefined ? (level10Result.timeMs / r.timeMs).toFixed(2) + 'x' : '-'
      console.log(
        `${r.level.toString().padEnd(10)} | ${formatBytes(r.size).padEnd(14)} | ${r.timeMs.toFixed(2).padEnd(12)} | ${ratio.padEnd(9)}% | ${speedup.padEnd(11)}`
      )
    }

    unlinkSync(wavPath)

    // All levels should produce similar sizes (bitrate is the main factor)
    const sizes = results.map((r) => r.size)
    const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length
    for (const size of sizes) {
      expect(Math.abs(size - avgSize)).toBeLessThan(avgSize * 0.1) // Within 10%
    }
  }, 60000)

  it('should compare opus compression levels for different durations', async () => {
    const durations = [1, 5, 10, 30]
    const levels = [0, 5, 10]

    console.log('\n--- OPUS COMPRESSION LEVEL vs DURATION ---')
    console.log(
      `${'Duration'.padEnd(10)} | ${'Level 0'.padEnd(16)} | ${'Level 5'.padEnd(16)} | ${'Level 10'.padEnd(16)} | ${'Speedup 0vs10'.padEnd(14)}`
    )
    console.log('-'.repeat(80))

    for (const duration of durations) {
      const audioData = generateSpeechLikeAudio(duration)
      const wavData = createWavFile(audioData)
      const wavPath = join(tempDir, `duration_${duration}.wav`)
      writeFileSync(wavPath, wavData)

      const times: Record<number, number> = {}

      for (const level of levels) {
        const oggPath = join(tempDir, `output_d${duration}_l${level}.ogg`)

        const start = performance.now()
        await new Promise<void>((resolve, reject) => {
          const proc = spawn(ffmpegInstaller.path, [
            '-i',
            wavPath,
            '-codec:a',
            'libopus',
            '-b:a',
            '16k',
            '-vbr',
            'on',
            '-compression_level',
            level.toString(),
            '-application',
            'voip',
            '-y',
            oggPath
          ])

          proc.on('close', (code) => {
            if (code === 0) resolve()
            else reject(new Error('ffmpeg error'))
          })
          proc.on('error', reject)
        })
        const end = performance.now()

        times[level] = end - start
        unlinkSync(oggPath)
      }

      unlinkSync(wavPath)

      const speedup = (times[10] / times[0]).toFixed(2)
      console.log(
        `${duration.toString().padEnd(9)}s | ${times[0].toFixed(2).padEnd(15)}ms | ${times[5].toFixed(2).padEnd(15)}ms | ${times[10].toFixed(2).padEnd(15)}ms | ${speedup.padEnd(13)}x`
      )
    }
  }, 120000)
})
