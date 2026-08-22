import { childMetrics, newMetrics, recordTopInto, sliceTop, updateMeasure, wipeMetrics } from '../metrics'
import { platformNow } from '../index'

describe('recordTopInto', () => {
  it('should create registry and entry on first record', () => {
    const metrics = newMetrics()

    recordTopInto(metrics, 'sql', 'SELECT 1', 42, 'SELECT 1 -- sample')

    const reg = metrics.top?.sql
    expect(reg).toBeDefined()
    expect(reg?.totalCount).toBe(1)
    expect(reg?.totalSum).toBe(42)
    expect(reg?.evictedCount).toBe(0)
    expect(reg?.evictedSum).toBe(0)
    const e = reg?.entries['SELECT 1']
    expect(e).toEqual({
      count: 1,
      sum: 42,
      max: 42,
      le10: 0,
      le100: 1, // 42ms lands in the (10,100] bucket
      le500: 0,
      sample: 'SELECT 1 -- sample'
    })
  })

  it('should accumulate count/sum/max per key and keep the slowest sample', () => {
    const metrics = newMetrics()

    recordTopInto(metrics, 'sql', 'q', 10, 'fast')
    recordTopInto(metrics, 'sql', 'q', 200, 'slow')
    recordTopInto(metrics, 'sql', 'q', 50, 'mid')

    const e = metrics.top?.sql.entries.q
    expect(e?.count).toBe(3)
    expect(e?.sum).toBe(260)
    expect(e?.max).toBe(200)
    expect(e?.sample).toBe('slow')
  })

  it('should fill non-overlapping latency buckets', () => {
    const metrics = newMetrics()

    recordTopInto(metrics, 'sql', 'q', 5)
    recordTopInto(metrics, 'sql', 'q', 10)
    recordTopInto(metrics, 'sql', 'q', 100)
    recordTopInto(metrics, 'sql', 'q', 500)
    recordTopInto(metrics, 'sql', 'q', 501)

    const e = metrics.top?.sql.entries.q
    expect(e?.le10).toBe(2) // 5, 10
    expect(e?.le100).toBe(1) // 100
    expect(e?.le500).toBe(1) // 500
    expect(e?.count).toBe(5) // 501 counted, not bucketed
  })

  it('should keep separate registries independent', () => {
    const metrics = newMetrics()

    recordTopInto(metrics, 'find', 'q', 10)
    recordTopInto(metrics, 'tx', 'q', 20)

    expect(metrics.top?.find.entries.q.sum).toBe(10)
    expect(metrics.top?.tx.entries.q.sum).toBe(20)
  })

  describe('eviction at cap', () => {
    it('should not evict while under cap', () => {
      const metrics = newMetrics()
      for (let i = 0; i < 5; i++) {
        recordTopInto(metrics, 'sql', `q${i}`, i + 1, undefined, 5)
      }

      const reg = metrics.top?.sql
      expect(Object.keys(reg?.entries ?? {}).length).toBe(5)
      expect(reg?.evictedCount).toBe(0)
    })

    it('should keep both the slowest and the most frequent on compaction', () => {
      const metrics = newMetrics()
      // cap=8 -> compaction keeps the top 2 by max plus the top 2 by count.
      const cap = 8
      recordTopInto(metrics, 'sql', 'slowA', 900, undefined, cap)
      recordTopInto(metrics, 'sql', 'slowB', 800, undefined, cap)
      for (let i = 0; i < 20; i++) recordTopInto(metrics, 'sql', 'hotA', 1, undefined, cap)
      for (let i = 0; i < 15; i++) recordTopInto(metrics, 'sql', 'hotB', 1, undefined, cap)
      // Filler keys: neither slow nor frequent.
      for (let i = 0; i < 4; i++) recordTopInto(metrics, 'sql', `filler${i}`, 5, undefined, cap)
      // The 9th distinct key triggers compaction.
      recordTopInto(metrics, 'sql', 'newcomer', 7, undefined, cap)

      const kept = Object.keys(metrics.top?.sql.entries ?? {})
      expect(kept).toEqual(expect.arrayContaining(['slowA', 'slowB', 'hotA', 'hotB', 'newcomer']))
      expect(kept).not.toContain('filler0')
    })

    it('should roll compacted entries into the registry totals', () => {
      const metrics = newMetrics()
      const cap = 4
      for (let i = 0; i < 6; i++) recordTopInto(metrics, 'sql', `q${i}`, 10, undefined, cap)

      const reg = metrics.top?.sql
      let tracked = 0
      for (const e of Object.values(reg?.entries ?? {})) tracked += e.count
      expect(tracked + (reg?.evictedCount ?? 0)).toBe(6)
      expect(reg?.totalCount).toBe(6)
      expect(reg?.totalSum).toBe(60)
    })

    it('should keep registry totals exact across evictions', () => {
      const metrics = newMetrics()
      let expectedCount = 0
      let expectedSum = 0
      for (let i = 0; i < 100; i++) {
        const v = (i * 37) % 200
        recordTopInto(metrics, 'sql', `q${i % 40}`, v, undefined, 10)
        expectedCount++
        expectedSum += v
      }

      const reg = metrics.top?.sql
      expect(reg?.totalCount).toBe(expectedCount)
      expect(reg?.totalSum).toBe(expectedSum)
      // tracked + evicted == total
      let trackedCount = 0
      let trackedSum = 0
      for (const e of Object.values(reg?.entries ?? {})) {
        trackedCount += e.count
        trackedSum += e.sum
      }
      expect(trackedCount + (reg?.evictedCount ?? 0)).toBe(expectedCount)
      expect(trackedSum + (reg?.evictedSum ?? 0)).toBe(expectedSum)
      expect(Object.keys(reg?.entries ?? {}).length).toBeLessThanOrEqual(10)
    })
  })
})

describe('sliceTop', () => {
  it('should ship the union of the slowest and the most frequent', () => {
    const metrics = newMetrics()
    recordTopInto(metrics, 'sql', 'slow', 900)
    for (let i = 0; i < 50; i++) recordTopInto(metrics, 'sql', 'frequent', 1)
    recordTopInto(metrics, 'sql', 'middling', 20)
    recordTopInto(metrics, 'sql', 'middling', 20)

    const sliced = sliceTop(metrics.top ?? {}, 1)

    expect(Object.keys(sliced.sql.entries).sort()).toEqual(['frequent', 'slow'])
    // Totals describe every observation, not just the shipped ones.
    expect(sliced.sql.totalCount).toBe(53)
  })

  it('should drop a sample identical to the key and keep a distinct one', () => {
    const metrics = newMetrics()
    recordTopInto(metrics, 'sql', 'SELECT 1', 5, 'SELECT 1')
    recordTopInto(metrics, 'sql', 'shape', 5, 'SELECT 42 -- real sql')

    const entries = sliceTop(metrics.top ?? {}).sql.entries

    expect(entries['SELECT 1'].sample).toBeUndefined()
    expect(entries.shape.sample).toBe('SELECT 42 -- real sql')
  })

  it('should not mutate the source registry', () => {
    const metrics = newMetrics()
    recordTopInto(metrics, 'sql', 'a', 900, 'a')
    recordTopInto(metrics, 'sql', 'b', 1, 'b')

    sliceTop(metrics.top ?? {}, 1)

    expect(Object.keys(metrics.top?.sql.entries ?? {}).sort()).toEqual(['a', 'b'])
    expect(metrics.top?.sql.entries.a.sample).toBe('a')
  })
})

describe('wipeMetrics', () => {
  it('should zero values and drop top registries, opLog and buckets across the tree', () => {
    const root = newMetrics()
    const st = platformNow()
    updateMeasure(root, st, {}, {}, undefined, 100)
    recordTopInto(root, 'sql', 'q', 42, 'sample')

    const child = childMetrics(root, ['a', 'b'])
    updateMeasure(child, st, { p: 'x' }, {}, undefined, 50)
    updateMeasure(child, st, { p: 'x' }, {}, undefined, 5)

    expect(root.value).toBe(100)
    expect(child.value).toBe(55)
    expect(child.params.p.x.value).toBe(55)

    wipeMetrics(root)

    expect(root.value).toBe(0)
    expect(root.operations).toBe(0)
    expect(root.top).toBeUndefined()
    expect(root.topResult).toBeUndefined()
    expect(root.le10).toBeUndefined()
    expect(root.le100).toBeUndefined()
    expect(root.le500).toBeUndefined()
    expect(child.value).toBe(0)
    expect(child.operations).toBe(0)
    expect(child.topResult).toBeUndefined()
    // params leaves are wiped too
    expect(child.params.p.x.value).toBe(0)
    expect(child.params.p.x.operations).toBe(0)
    expect(child.params.p.x.topResult).toBeUndefined()
  })

  it('should keep the tree structure usable after wipe', () => {
    const root = newMetrics()
    const st = platformNow()
    const child = childMetrics(root, ['a'])
    updateMeasure(child, st, {}, {}, undefined, 10)

    wipeMetrics(root)

    // Re-record after wipe works.
    updateMeasure(child, st, {}, {}, undefined, 7)
    recordTopInto(root, 'sql', 'q', 3)

    expect(child.value).toBe(7)
    expect(root.top?.sql.totalSum).toBe(3)
  })
})
