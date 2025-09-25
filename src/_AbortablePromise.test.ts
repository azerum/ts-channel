import { afterEach, describe, expect, test, vi } from 'vitest'
import EventEmitter from 'events'
import { AbortablePromise, AbortedError } from './_AbortablePromise.js'

afterEach(() => {
    vi.useRealTimers()
})

function abortListenersCount(s: AbortSignal) {
    return EventEmitter.getEventListeners(s, 'abort').length
}

test('When signal aborts, rejects with AbortedError', async () => {
    const controller = new AbortController()

    const p = new AbortablePromise((_resolve, _reject) => {
        return () => { }
    }, controller.signal)

    controller.abort()
    await expect(p).rejects.toThrowError(AbortedError)
})

test('When signal aborts, calls cleanup function returned from executor', async () => {
    const controller = new AbortController()
    const cleanupFn = vi.fn()

    const p = new AbortablePromise((_resolve, _reject) => {
        return cleanupFn
    }, controller.signal)

    // Prevent unhandled rejection
    p.catch(() => { })

    controller.abort()
    expect(cleanupFn).toHaveBeenCalledOnce()
})

describe('When resolves, rejects, or aborts asynchronously, removes signal listener', () => {
        test('When resolves', async () => {
            vi.useFakeTimers()
            const controller = new AbortController()

            const p = new AbortablePromise((resolve, _reject) => {
                setTimeout(() => {
                    resolve(42)
                }, 1000)

                return () => { }
            }, controller.signal)

            expect(abortListenersCount(controller.signal)).toBe(1)

            vi.advanceTimersByTime(1000)
            await expect(p).resolves.toBe(42)

            expect(abortListenersCount(controller.signal)).toBe(0)
        })

        test('When rejects', async () => {
            vi.useFakeTimers()

            const controller = new AbortController()

            const p = new AbortablePromise((_resolve, reject) => {
                setTimeout(() => {
                    reject(new Error('Too bad'))
                }, 1000)

                return () => { }
            }, controller.signal)

            expect(abortListenersCount(controller.signal)).toBe(1)

            vi.advanceTimersByTime(1000)
            await expect(p).rejects.toThrowError('Too bad')

            expect(abortListenersCount(controller.signal)).toBe(0)
        })

        test('When aborts', async () => {
            const controller = new AbortController()

            const p = new AbortablePromise((_resolve, _reject) => {
                return () => { }
            }, controller.signal)

            expect(abortListenersCount(controller.signal)).toBe(1)

            // Prevent unhandled rejection 
            p.catch(() => { })

            controller.abort()
            expect(abortListenersCount(controller.signal)).toBe(0)
        })
    }
)

describe('When resolves or rejects synchronously, does not add signal listener', () => {
    test('When resolves', async () => {
        const controller = new AbortController()

        const p = new AbortablePromise<void>(resolve => {
            resolve()
            return () => { }
        }, controller.signal)

        await p
        expect(abortListenersCount(controller.signal)).toBe(0)
    })

    test('When rejects', async () => {
        const controller = new AbortController()

        const p = new AbortablePromise<void>((_resolve, reject) => {
            reject(new Error())
            return () => { }
        }, controller.signal)

        await expect(p).rejects.toThrowError()
        expect(abortListenersCount(controller.signal)).toBe(0)
    })
})

test(
    'When the passed signal is already aborted, does not run the executor, ' +
    'and creates a rejected Promise',

    async () => {
        const controller = new AbortController()
        controller.abort()

        const executor = vi.fn(() => () => { })
        const p = new AbortablePromise(executor, controller.signal)

        await expect(p).rejects.toThrowError(AbortedError)

        expect(executor).not.toHaveBeenCalled()
    }
)

test(
    'When signal aborts, cleanup function is not executed if promise has already ' +
    'been resolved/rejected',

    async () => {
        const cleanupFn = vi.fn()
        const controller = new AbortController()

        const p = new AbortablePromise((resolve, _reject) => {
            controller.signal.addEventListener('abort', () => {
                resolve(42)
            })

            return cleanupFn
        }, controller.signal)

        controller.abort()
        expect(await p).toBe(42)
        expect(cleanupFn).not.toHaveBeenCalled()
    }
)
