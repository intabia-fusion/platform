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

export interface EmbeddingProvider {
  embedDocuments: (texts: string[]) => Promise<number[][]>
  embedQuery: (text: string) => Promise<number[]>
  readonly dims: number
}

/**
 * Creates a local embedding provider using @huggingface/transformers (ONNX runtime).
 * Model is downloaded from HuggingFace Hub on first use and cached locally.
 * Control cache location via TRANSFORMERS_CACHE or HF_HOME env vars.
 *
 * For multilingual-e5-* models the E5 instruction prefix format is required:
 * - Documents: "passage: <text>"
 * - Queries:   "query: <text>"
 */
export async function createEmbeddingProvider (modelName: string): Promise<EmbeddingProvider> {
  const model = modelName
  // Dynamic import so the heavy ONNX runtime is not loaded when feature is disabled.
  const { pipeline } = await import('@huggingface/transformers')

  console.log(`[embedding] Loading model ${model} ...`)
  const extractor = await pipeline('feature-extraction', model, { dtype: 'q8' })
  console.log(`[embedding] Model ${model} loaded`)

  async function embed (prefixedTexts: string[]): Promise<number[][]> {
    // @xenova/transformers returns a Tensor with .data (Float32Array) and .dims [batch, dims]
    const output = await extractor(prefixedTexts, { pooling: 'mean', normalize: true })
    const dims: number = output.dims[1]
    return Array.from({ length: prefixedTexts.length }, (_, i) =>
      Array.from(output.data.slice(i * dims, (i + 1) * dims) as Float32Array)
    )
  }

  return {
    dims: 384,
    embedDocuments: async (texts: string[]) => await embed(texts.map((t) => `passage: ${t}`)),
    embedQuery: async (text: string) => {
      const result = await embed([`query: ${text}`])
      return result[0]
    }
  }
}
