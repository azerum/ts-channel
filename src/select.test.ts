import { afterEach, describe, expect, test, vi } from 'vitest'
import { Channel } from './Channel.js'
import { raceAbortSignal, raceNever, raceTimeout, select } from './select.js'
import { expectToBlock } from './_expectToBlock.js'
import { abortListenersCount } from './_abortListenersCount.js'

test('Selecting reads and writes', async () => {
    // When selecting multiple reads and writes:
    // 1. Only one operation "wins the race" and completes
    // 2. Other operations are not performed and leave their channels intact

    const ch1 = new Channel(0)
    const ch2 = new Channel(0)
    const ch3 = new Channel(0)
    const ch4 = new Channel(0)

    const s = select({
        ch1: ch1.raceRead(),
        ch2: ch2.raceRead(),
        ch3: ch3.raceWrite(3),
        ch4: ch4.raceWrite(4),
    })

    await expectToBlock(s)

    const w2 = ch2.write(2)
    const r3 = ch3.read()

    await expect(s).resolves.toEqual({ type: 'ch2', value: 2 })

    // Verify that write to ch2 succeeded, while other channels were not 
    // written to/read from

    await expectToBlock(ch1.write(1))
    await w2
    await expectToBlock(r3)
    await expectToBlock(ch4.read())
})

test(
    'Handles race condition when other readers "steal" value of recently ' +
    'readable channel',

    async () => {
        const ch = new Channel(0)

        // Edge case with the microtask queue:
        //
        // 1. select() starts waitUntilReadable()
        // 2. A callback doing read() is added to the microtask queue
        //
        // 3. write() is performed. It resolves the waitUntilReadable() call,
        // which causes continuation of select() (after await Promise.race())
        // to be added to the microtask queue. Note that it is added after
        // callback added in the step 2
        //
        // 4. Callback from step 2 runs. It consumes the performed write(),
        // "stealing" the value from select()
        //
        // 5. select() continuation runs, but fails to read any value, as 
        // channel is empty again
        //
        // select() must remain blocked in such case

        const s = select({ ch: ch.raceRead() })
        await expectToBlock(s)

        queueMicrotask(async () => {
            const x = await ch.read()
            expect(x).toBe(1)
        })

        await ch.write(1)
        await expectToBlock(s)
    }
)

test(
    'Handles race condition when other writes "steal" free space of recently ' +
    'writable channel',

    async () => {
        const ch = new Channel(0)

        // Same principle as with test for edge case with reads:
        //
        // 1. select() starts waitUntilWritable()
        // 2. read() is performed, it resolves the wait of the select
        // 3. Before continuation of select() is ran, write() is performed. 
        // This "steals" free space created by read()
        //
        // select() must remain blocked 

        const s = select({ ch: ch.raceWrite(1) })
        await expectToBlock(s)

        queueMicrotask(async () => {
            await ch.write(2)
        })

        const x = await ch.read()
        expect(x).toBe(2)

        await expectToBlock(s)
    }
)

test('select() correctly infers result type with raceNever', async () => {
    const ch = new Channel<number>(0)

    function example(condition: boolean) {
        // The type of result of `op` here should be the same as in
        // raceRead(). That is, raceNever must not affect the type
        return select({
            op: condition ? ch.raceRead() : raceNever,
        })
    }

    type Actual = Awaited<ReturnType<typeof example>>
    type Expected = { type: 'op', value: number | undefined }

    assertIsSubtype<Actual, Expected>()
    assertIsSubtype<Expected, Actual>()
})

function assertIsSubtype<_T extends S, S>() {}

describe('raceTimeout() never leaves a timer running after select() completes', () => {
    // Do not fake setImmediate, used by expectToBlock()
    const useFakeSetTimeout = () => vi.useFakeTimers({ 
        toFake: ['setTimeout', 'clearTimeout']
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    test('When it wins the race', async () => {
        useFakeSetTimeout()

        const s = select({ timedOut: raceTimeout(1000) })

        await expectToBlock(s)
        expect(vi.getTimerCount()).toBe(1)

        vi.advanceTimersByTime(2000)

        await s
        expect(vi.getTimerCount()).toBe(0)
    })

    test('When it looses the race', async () => {
        useFakeSetTimeout()
        
        const ch = new Channel(1)
        await ch.write(1)

        await select({ 
            ch: ch.raceRead(),
            timedOut: raceTimeout(1000) 
        })

        expect(vi.getTimerCount()).toBe(0)
    })
})

describe(
    'raceAbortSignal() always removes any added listeners on the signal by ' + 
    'the end of select()', 
    
    () => {
        test('When signal is already aborted', async () => {
            const c = new AbortController()

            c.abort()

            await select({ aborted: raceAbortSignal(c.signal) })
            expect(abortListenersCount(c.signal)).toBe(0)
        })

        test('When signal is aborted asynchronously', async () => {
            const c = new AbortController()

            const s = select({ aborted: raceAbortSignal(c.signal) })
            await expectToBlock(s)

            c.abort()
            await s
            expect(abortListenersCount(c.signal)).toBe(0)
        })

        test('When other operation wins the race', async () => {
            const c = new AbortController()

            const ch = new Channel(0)

            const s = select({ 
                wrote: ch.raceWrite(1),
                aborted: raceAbortSignal(c.signal) 
            })

            await expectToBlock(s)

            await ch.read()
            await s
            expect(abortListenersCount(c.signal)).toBe(0)
        })
    }
)
