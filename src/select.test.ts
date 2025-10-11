import { assert, describe, expect, test } from 'vitest'
import { Channel } from './Channel.js'
import { select, SelectError, type SelectArgsMap } from './select.js'
import { expectToBlock } from './_expectToBlock.js'
import timers from 'timers/promises'
import { CannotWriteIntoClosedChannel } from './channel-api.js'
import { assertNever } from './select-helpers.js'

describe('Can select raceRead()', () => {
    test('read can win the race', async () => {
        const ch1 = new Channel(0)
        const ch2 = new Channel(0)

        const s = select({
            ch1: ch1.raceRead(),
            ch2: ch2.raceRead(),
        })

        await expectToBlock(s)
        await ch1.write(1)

        await expect(s).resolves.toEqual({ type: 'ch1', value: 1 })

        // Verify that ch2 is not being read from anymore
        await expectToBlock(ch2.write(1))
    })

    test('If multiple channels are readable, only the winner is read from', async () => {
        const ch1 = new Channel(0)
        const ch2 = new Channel(0)

        void ch1.write(1)
        void ch2.write(1)

        const { type } = await select({
            ch1: ch1.raceRead(),
            ch2: ch2.raceRead(),
        })

        const [winningCh, loosingCh] =
            type === 'ch1'
                ? [ch1, ch2]
            : type === 'ch2'
                    ? [ch2, ch1]
            : assertNever(type)

        // Verify that the winning channel was read from and the loosing
        // channel still has a value

        await expectToBlock(winningCh.read())
        await expect(loosingCh.read()).resolves.toBe(1)
    })
})

describe('Can select raceWrite()', () => {
    test('write() can win the race', async () => {
        const ch1 = new Channel(0)
        const ch2 = new Channel(0)

        const s = select({
            ch1: ch1.raceWrite(1),
            ch2: ch2.raceWrite(2),
        })

        await expectToBlock(s)
        await expect(ch2.read()).resolves.toBe(2)
        await expect(s).resolves.toStrictEqual({ type: 'ch2', value: undefined })

        // Verify that ch1 was not written into
        await expectToBlock(ch1.read())
    })

    test('If multiple channels are writable, only the winner is written into', async () => {
        // Buffered channels are writable initially
        const ch1 = new Channel(1)
        const ch2 = new Channel(1)

        const { type } = await select({
            ch1: ch1.raceWrite(1),
            ch2: ch2.raceWrite(1),
        })

        const [winningCh, loosingCh] =
            type === 'ch1'
                ? [ch1, ch2]
            : type === 'ch2'
                ? [ch2, ch1]
            : assertNever(type)

        // Verify that the winning channel was written into and the loosing
        // channel is still empty

        await expect(winningCh.read()).resolves.toBe(1)
        await expectToBlock(loosingCh.read())
    })

    test('If channel closes, select throws and cancels other operations', async () => {
        const ch1 = new Channel(0)
        const ch2 = new Channel(0)
        const ch3 = new Channel(0)

        const s = select({
            ch1: ch1.raceWrite(1),
            ch2: ch2.raceWrite(1),
            ch3: ch3.raceWrite(1),
        })

        await expectToBlock(s)

        // Test what happens when multiple channels close
        ch1.close()
        ch2.close()

        await expect(s).rejects.toThrow()
        const error = await s.catch(e => e)

        assert(error instanceof SelectError)
        expect(error.argName).toBeOneOf(['ch1', 'ch2'])
        expect(error.cause instanceof CannotWriteIntoClosedChannel)

        // Verify that the remaining operation - write into ch3 - was 
        // cancelled
        await expectToBlock(ch3.read())
    })
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

describe('Can select promises', () => {
    test('Already resolved promise', async () => {
        const ch = new Channel(0)

        const result = await select({
            ch: ch.raceRead(),
            p: Promise.resolve(1),
        })

        expect(result.type).toBe('p')
        expect(result.value).toBe(1)

        await expectToBlock(ch.write(1))
    })

    test('Already rejected promise', async () => {
        const ch = new Channel(0)

        const s = select({
            ch: ch.raceRead(),
            p: Promise.reject(new Error('Too bad')),
        })

        await expect(s).rejects.toThrow()
        const error = await s.catch(e => e)

        assert(error instanceof SelectError)
        expect(error.argName).toBe('p')
        assert(error.cause instanceof Error)
        expect(error.cause.message).toBe('Too bad')

        await expectToBlock(ch.write(1))
    })

    test('Asynchronously resolved promise', async () => {
        const ch = new Channel(0)

        const resolveAsync = async () => {
            await Promise.resolve()
            return 1
        }

        const result = await select({
            ch: ch.raceRead(),
            p: resolveAsync()
        })

        expect(result.type).toBe('p')
        expect(result.value).toBe(1)

        await expectToBlock(ch.write(1))
    })

    test('Asynchronously rejected promise', async () => {
        const ch = new Channel(0)

        const throwAsync = async () => {
            await Promise.resolve()
            throw new Error('Too bad')
        }

        const s = select({
            ch: ch.raceRead(),
            p: throwAsync(),
        })

        await expect(s).rejects.toThrow()
        const error = await s.catch(e => e)

        assert(error instanceof SelectError)
        expect(error.argName).toBe('p')
        assert(error.cause instanceof Error)
        expect(error.cause.message).toBe('Too bad')

        await expectToBlock(ch.write(1))
    })
})

describe('Can select abortable functions', () => {
    test('Abortable fn can win the race', async () => {
        const ch = new Channel(0)

        const result = await select({
            ch: ch.raceRead(),
            fn: signal => timers.setImmediate(42, { signal })
        })

        expect(result.type).toBe('fn')
        expect(result.value).toBe(42)

        await expectToBlock(ch.write(1))
    })

    test('If fn throws, select throws and cancels other operations', async () => {
        const ch = new Channel(0)

        const s = select({
            ch: ch.raceRead(),

            fn: async _s => {
                throw new Error('Too bad')
            }
        })

        await expect(s).rejects.toThrow()
        const error = await s.catch(e => e)

        assert(error instanceof SelectError)
        expect(error.argName).toBe('fn')
        assert(error.cause instanceof Error)
        expect(error.cause.message).toBe('Too bad')

        // Verify that read from ch was cancelled
        await expectToBlock(ch.write(1))
    })

    test('When abortable fn looses the race, the signal passed to it is aborted', async () => {
        const ch = new Channel(1)
        await ch.write(1)

        let passedSignal: AbortSignal | null = null

        const result = await select({
            ch: ch.raceRead(),

            fn: async signal => {
                passedSignal = signal

                while (true) {
                    await timers.setTimeout(1000, undefined, { signal })
                }
            }
        })

        expect(result.type).toBe('ch')
        expect(result.value).toBe(1)

        //@ts-expect-error
        expect(passedSignal?.aborted).toBe(true)
    })
})

describe('Can select null', () => {
    test('Null never wins the race', async () => {
        const ch = new Channel(0)

        const s = select({
            ch: ch.raceRead(),
            nothing: null
        })

        await expectToBlock(s)
    })

    test(
        'When null is used to conditionally select operation, types are ' +
        'inferred as expected',

        async () => {
            function maybeTimeout(timeout: boolean) {
                return select({
                    value: timeout ? timers.setTimeout(100, 42) : null
                })
            }

            type Expected = { type: 'value', value: number }
            type Actual = Awaited<ReturnType<typeof maybeTimeout>>

            assertIsSubtype<Expected, Actual>()
            assertIsSubtype<Actual, Expected>()
        }
    )

    function assertIsSubtype<_T extends S, S>() { }

    test('When given only null args, select throws', async () => {
        const s = select({
            a: null,
            b: null,
            c: null,
        })

        await expect(s).rejects.toThrowError()
    })
})

test('When given empty object, throws', async () => {
    const s = select({})
    await expect(s).rejects.toThrowError()
})

test('When multiple operations are ready, fairly selects the winner', async () => {
    await testFairness(async () => {
        const r = new Channel(1)
        await r.write(1)

        const w = new Channel(1)

        return {
            promise: Promise.resolve(1),
            fn: async () => { },
            read: r.raceRead(),
            write: w.raceWrite(1),
        }
    })

    /**
     * Run `select()` with args produced with `makeArgs()` many times. 
     * Count how many times each arg was selected (`makeArgs()` is expected
     * to return the same number of args with the same names each time)
     * 
     * Verify that the distribution is roughly uniform
     */
    async function testFairness(
        makeArgs: () => Promise<SelectArgsMap>,
    ) {
        const opToCount = new Map<string, number>()
        const runs = 10_000

        let argsCount: number | null = null

        for (let i = 0; i < runs; ++i) {
            const args = await makeArgs()

            const currentArgsCount = Object.keys(args).length
            argsCount ??= currentArgsCount

            if (currentArgsCount !== argsCount) {
                throw new Error(
                    `makeArgs() must return the same number of args on every call. ` +
                    `Got different numbers: ${argsCount}, then ${currentArgsCount}`
                )
            }

            const result = await select(args)

            const prev = opToCount.get(result.type) ?? 0
            opToCount.set(result.type, prev + 1)
        }

        assert(argsCount !== null, 'Must run at least one run')

        const expected = runs / argsCount
        const maxDifference = 0.02 * runs

        for (const [op, count] of opToCount.entries()) {
            const difference = Math.abs(expected - count)

            expect(difference, `${op} has won ${count} times, expected ${expected} times`)
                .toBeLessThanOrEqual(maxDifference)
        }
    }
})
