import { expect, test } from 'vitest'
import { makeAbortSignal } from './_makeAbortSignal.js'
import { abortListenersCount } from './_abortListenersCount.js'

test('Aborts after abortFn call', () => {
    const [signal, abort] = makeAbortSignal(undefined)

    expect(signal.aborted).toBe(false)
    abort()
    expect(signal.aborted).toBe(true)
})

test('Once upstream signal aborts, the returned signal aborts too', () => {
    const upstreamController = new AbortController()
    const [signal, _abort] = makeAbortSignal(upstreamController.signal)

    expect(signal.aborted).toBe(false)
    upstreamController.abort()
    expect(signal.aborted).toBe(true)
})

test(
    'If upstream signal is provided, and abortFn is called before it aborts, ' + 
    'listener is removed', 
    
    () => {
        const upstreamController = new AbortController()
        const [_signal, abort] = makeAbortSignal(upstreamController.signal)

        expect(abortListenersCount(upstreamController.signal)).toBe(1)
        abort()
        expect(abortListenersCount(upstreamController.signal)).toBe(0)
    }
)

test(
    'Once upstream signal is aborted, the listener on it is removed', 
    
    () => {
        const upstreamController = new AbortController()
        const [_signal, _abort] = makeAbortSignal(upstreamController.signal)

        expect(abortListenersCount(upstreamController.signal)).toBe(1)
        upstreamController.abort()
        expect(abortListenersCount(upstreamController.signal)).toBe(0)
    }
)
