import { context, trace, TraceFlags, defaultTextMapSetter } from '@opentelemetry/api'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { RandomIdGenerator } from '@opentelemetry/sdk-trace-base'

export const CALL_ROOT_SPAN_ID = '0000000000000001'
const propagator = new W3CTraceContextPropagator()
const idGen = new RandomIdGenerator()

export function newCallTraceId (): string {
  return idGen.generateTraceId()
}

export function callTraceParent (traceId: string): string | undefined {
  const carrier: Record<string, string> = {}
  propagator.inject(
    trace.setSpanContext(context.active(), {
      traceId,
      spanId: CALL_ROOT_SPAN_ID,
      traceFlags: TraceFlags.SAMPLED
    }),
    carrier,
    defaultTextMapSetter
  )
  return carrier.traceparent
}
