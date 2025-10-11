import { describe, expect, test } from 'vitest'
import { returnOnAbort } from './select-helpers.js'
import { expectToBlock } from './_expectToBlock.js'
import { abortListenersCount } from './_abortListenersCount.js'
import { AbortedError } from './AbortablePromise.js'

describe('returnOnAbort()', () => {
    test('Resolves with signal.reason when signal aborts', async () => {
        const c = new AbortController()
        const p = returnOnAbort(c.signal)()

        await expectToBlock(p)

        c.abort(42)
        await expect(p).resolves.toBe(42)
    })

    test('After resolving, removes its listener on the signal', async () => {
        const c = new AbortController()
        const p = returnOnAbort(c.signal)()

        expect(abortListenersCount(c.signal)).toBe(1)

        c.abort()

        await p
        expect(abortListenersCount(c.signal)).toBe(0)
    })

    test(
        'When cancelSignal aborts, rejects with AbortedError and removes ' + 
        'listener on signal', 
        
        async () => {
            const controller = new AbortController()
            const cancelController = new AbortController()

            const p = returnOnAbort(controller.signal)(cancelController.signal)
            await expectToBlock(p)

            cancelController.abort()
            await expect(p).rejects.toThrowError(AbortedError)

            expect(abortListenersCount(controller.signal)).toBe(0)
        }
    )
})
