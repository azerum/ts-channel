import { afterEach, describe, expect, test, vi } from 'vitest'
import { partitionTime } from './partitionTime.js'
import { Channel } from './Channel.js'
import { expectToBlock } from './_expectToBlock.js'

afterEach(() => {
    vi.useRealTimers()
})

function useFakeSetTimeout() {
    // Do not fake setImmediate(), which used by expectToBlock()
    vi.useFakeTimers({
        toFake: ['setTimeout']
    })
}

async function expectNextValue<T>(
    nextResult: Promise<IteratorResult<T>>,
    value: T
): Promise<void> {
    const result = await nextResult

    expect(result.done ?? false).toBe(false)
    expect(result.value).toStrictEqual(value)
}

async function expectToEnd<T>(nextResult: Promise<IteratorResult<T>>): Promise<void> {
    const result = await nextResult
    expect(result.done).toBe(true)
}

test('Consumes channel values in groups of groupSize', async () => {
    const ch = new Channel<number>(10)

    const iterator = partitionTime({
        source: ch,
        groupSize: 3,
        nextValueTimeoutMs: 60_000
    })
    [Symbol.asyncIterator]()

    await ch.write(1)
    await ch.write(2)
    await ch.write(3)
    await ch.write(4)
    await ch.write(5)
    await ch.write(6)
    ch.close()

    await expectNextValue(iterator.next(), [1, 2, 3])
    await expectNextValue(iterator.next(), [4, 5, 6])
    await expectToEnd(iterator.next())
})

test(
    'If channel closes while there is an incomplete group, yields that group',

    async () => {
        const ch = new Channel<number>(10)

        const iterator = partitionTime({
            source: ch,
            groupSize: 3,
            nextValueTimeoutMs: 60_000
        })
        [Symbol.asyncIterator]()

        await ch.write(1)
        ch.close()

        await expectNextValue(iterator.next(), [1])
        await expectToEnd(iterator.next())
    }
)

describe(
    'If channel closes when the current group is empty, does not yield that group',

    () => {
        test('Closed immediately', async () => {
            const ch = new Channel<number>(0)

            const iterator = partitionTime({
                source: ch,
                groupSize: 3,
                nextValueTimeoutMs: 60_000
            })
            [Symbol.asyncIterator]()

            ch.close()

            const group = await iterator.next()
            expect(group.done).toBe(true)
        })

        test('Closed after yielded group', async () => {
            const ch = new Channel<number>(3)

            const iterator = partitionTime({
                source: ch,
                groupSize: 3,
                nextValueTimeoutMs: 60_000
            })
            [Symbol.asyncIterator]()

            await ch.write(1)
            await ch.write(2)
            await ch.write(3)
            ch.close()

            const group1 = await iterator.next()
            expect(group1.value).toStrictEqual([1, 2, 3])

            const group2 = await iterator.next()
            expect(group2.done).toBe(true)
        })
    }
)

test(
    'If nextValueTimeoutMs elapses since the last value was read from the channel, ' +
    'and the current group is incomplete, yields incomplete group',

    async () => {
        useFakeSetTimeout()
        const ch = new Channel<number>(10)

        const iterator = partitionTime({
            source: ch,
            groupSize: 3,
            nextValueTimeoutMs: 1000
        })
        [Symbol.asyncIterator]()

        const nextPromise = iterator.next()

        await ch.write(1)
        await ch.write(2)

        await expectToBlock(nextPromise)

        vi.advanceTimersByTime(500)
        await expectToBlock(nextPromise)

        vi.advanceTimersByTime(1000)
        await expectNextValue(nextPromise, [1, 2])
    }
)

test('nextValueTimeoutMs timer resets with each read value', async () => {
    useFakeSetTimeout()
    const ch = new Channel<number>(10)

    const iterator = partitionTime({
        source: ch,
        groupSize: 3,
        nextValueTimeoutMs: 10_000
    })
    [Symbol.asyncIterator]()

    const nextPromise = iterator.next()

    await ch.write(1)
    await expectToBlock(nextPromise)

    vi.advanceTimersByTime(5000)
    await expectToBlock(nextPromise)

    // 11s has elapsed since the start of consuming iterator, 
    // but only 6s has elapsed since the last read value - 2

    await ch.write(2)
    vi.advanceTimersByTime(6000)

    await expectToBlock(nextPromise)
})
