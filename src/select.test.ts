import { expect, test } from 'vitest'
import { Channel } from './Channel.js'
import { select } from './select.js'
import { expectToBlock } from './_expectToBlock.js'
import { AbortedError } from './AbortablePromise.js'

test('Reads value from one of the channels, whichever becomes readable first', async () => {
    const ch1 = new Channel(0)
    const ch2 = new Channel(0)
    
    const s = select([ch1, ch2])
    await expectToBlock(s)
    
    await ch2.write(42)
    await expect(s).resolves.toEqual([ch2, 42])
})

test('Closed channels are also "readable" - they resolve select()', async () => {
    const ch1 = new Channel(0)
    const ch2 = new Channel(0)
    
    const s = select([ch1, ch2])
    await expectToBlock(s)
    
    ch1.close()
    await expect(s).resolves.toEqual([ch1, undefined])
})

test('Does not read values from channels which were not selected', async () => {
    const ch1 = new Channel(1)
    const ch2 = new Channel(1)

    await ch1.write(1)
    await ch2.write(1)

    const [first, _] = await select([ch1, ch2])
    const second = first === ch1 ? ch2 : ch1

    // Verify that `first` was read from
    await expectToBlock(first.read())

    // Verify that value written into `second` is still in the channel
    await expect(second.read()).resolves.toBe(1)
})

test(
    'When multiple channels are readable at once, tries to fairly select one of them',

    async () => {
        // Run select([ch1, ch2]) many times, with ch1 and ch2 both being readable,
        // and see that ch1 and ch2 are selected with roughly the same probability

        let winsOf1 = 0
        let winsOf2 = 0

        const totalRuns = 1000

        for (let run = 0; run < totalRuns; ++run) {
            const ch1 = new Channel(1)
            const ch2 = new Channel(1)

            await ch1.write(1)
            await ch2.write(1)

            const [winner, _] = await select([ch1, ch2])

            if (winner === ch1) {
                ++winsOf1
            }
            else {
                ++winsOf2
            }
        }

        const difference = Math.abs(winsOf2 - winsOf1)
        expect(difference).toBeLessThanOrEqual(totalRuns * 0.05)
    }
)

test('Requires at least one channel', async () => {
    // Disallow empty array at type-level, but also throw Error with readable
    // message at runtime 

    //@ts-expect-error
    const s = select([])

    await expect(s).rejects.toThrowError()
})

test('Correctly infers the resulting value type', () => {
    const numbers = new Channel<number>(0)
    const booleans = new Channel<boolean>(0)
    const neverWrittenToChannel = new Channel<never>(0)

    const s = select([numbers, booleans, neverWrittenToChannel])

    type Actual = Awaited<typeof s>[1]

    // Either a value from `numbers`, value from `booleans`, or 
    // `undefined` if one of the channels was closed 
    type Expected = number | boolean | undefined

    assertIsSubtype<Actual, Expected>()
    assertIsSubtype<Expected, Actual>()
})

function assertIsSubtype<_T extends S, S>() {} 

test(
    'Handles race condition when other readers "steal" value of recently ' + 
    'readable channel', 
    
    async () => {
        const ch = new Channel(0)

        const s = select([ch])
        await expectToBlock(s)

        queueMicrotask(async () => {
            const x = await ch.read()
            expect(x).toBe(1)
        })

        // This resolves the `waitForReadyReady()` used by `select()` under the 
        // hood. The continuation of `select()` - code after `await` - is scheduled
        // into microtask queue
        //
        // But there is another callback in the queue added above. It will "steal"
        // the write, so once continuation of `select()` runs, it will get
        // no value
        //
        // `select()` must not unblock in such case

        await ch.write(1)

        await expectToBlock(s)
    }
)

test(
    'When passed signal is aborted, throws AbortedError and cancels all reads', 
    
    async () => {
        const ch1 = new Channel(0)
        const ch2 = new Channel(0)

        const controller = new AbortController()
        const s = select([ch1, ch2], controller.signal)

        await expectToBlock(s)

        controller.abort()
        await expect(s).rejects.toThrowError(AbortedError)

        // Verify that no reads are left on the channels - writes block.
        // Also verify that further reads work as expected

        await expectToBlock(ch1.write(1))
        await expectToBlock(ch2.write(2))

        await expect(ch1.read()).resolves.toBe(1)
        await expect(ch2.read()).resolves.toBe(2)
    }
)
