import { describe, expect, test } from 'vitest'
import { Channel } from './Channel.js'
import { expectToBlock } from './_expectToBlock.js'
import { CannotWriteIntoClosedChannel } from './channel-api.js'
import { AbortedError } from './makeAbortablePromise.js'

async function makeChannelWithFullBuffer(capacity: number) {
    if (capacity === 0) {
        return new Channel(0)
    }

    const channel = new Channel(capacity)

    for (let i = 0; i < capacity; ++i) {
        await channel.write(i)
    }

    return channel
}

test.for([
    -1,
    3.14,
    Infinity,
    NaN,
])('If capacity is not an integer >= 0, constructor throws', async c => {
    expect(() => new Channel(c)).toThrowError(c.toString())
})

describe('Unbuffered', () => {
    test('write() blocks until read()', async () => {
        const ch = new Channel(0)

        const w = ch.write(42)
        await expectToBlock(w)

        await expect(ch.read()).resolves.toEqual(42)
        await w
    })

    test('read() blocks until write()', async () => {
        const ch = new Channel(0)

        const r = ch.read()
        await expectToBlock(r)

        await ch.write(42)
        await expect(r).resolves.toEqual(42)
    })

    test('If there is no blocked write(), tryRead() returns undefined', async () => {
        const ch = new Channel(0)
        expect(ch.tryRead()).toBe(undefined)
    })

    test('If there is a blocked write(), tryRead() unblocks it', async () => {
        const ch = new Channel(0)

        const w = ch.write(42)
        await expectToBlock(w)

        expect(ch.tryRead()).toBe(42)
        await w
    })

    test('If there is no blocked read(), tryWrite() returns false', async () => {
        const ch = new Channel(0)
        expect(ch.tryWrite(42)).toBe(false)
    })

    test('If there is a blocked read(), tryWrite() unblocks it', async () => {
        const ch = new Channel(0)

        const r = ch.read()
        await expectToBlock(r)

        expect(ch.tryWrite(42)).toBe(true)
        await expect(r).resolves.toBe(42)
    })

    test('waitUntilReadable() blocks until there is a blocked write', async () => {
        const ch = new Channel(0)

        const w = ch.waitUntilReadable(undefined)
        await expectToBlock(w)

        ch.write(1)
        await w
    })

    test('If there is a blocked write(), waitUntilReadable() does not block', async () => {
        const ch = new Channel(0)

        ch.write(1)
        await ch.waitUntilReadable(undefined)
    })

    test('waitUntilWritable() blocks until there is a blocked read', async () => {
        const ch = new Channel(0)

        const w = ch.waitUntilWritable(undefined)
        await expectToBlock(w)

        ch.read()
        await w
    })

    test('If there is a blocked read, waitUntilWritable() does not block', async () => {
        const ch = new Channel(0)

        ch.read()
        await ch.waitUntilWritable(undefined)
    })

    test('After close(), blocked read()s are resolved', async () => {
        const ch = new Channel(0)

        const reads = [ch.read(), ch.read()]
        await expectToBlock(Promise.race(reads))

        ch.close()
        await expect(Promise.all(reads)).resolves.toEqual([undefined, undefined])
    })

    test('After close(), tryRead()s return undefined', () => {
        const ch = new Channel(0)

        ch.close()
        expect(ch.tryRead()).toBe(undefined)
    })
})

describe('Buffered', () => {
    test('write() does not block until the buffer is full', async () => {
        const ch = new Channel(3)

        await ch.write(1)
        await ch.write(2)
        await ch.write(3)
        await expectToBlock(ch.write(4))
    })

    test('tryWrite() writes value and returns true until the buffer is full', async () => {
        const ch = new Channel(3)

        expect(ch.tryWrite(1)).toBe(true)
        expect(ch.tryWrite(2)).toBe(true)
        expect(ch.tryWrite(3)).toBe(true)
        expect(ch.tryWrite(4)).toBe(false)
    })

    test('If buffer is not empty, read()/tryRead() take values from it', async () => {
        const ch = new Channel(3)

        await ch.write(1)
        await ch.write(2)
        await ch.write(3)

        await expect(ch.read()).resolves.toBe(1)
        expect(ch.tryRead()).toBe(2)
        await expect(ch.read()).resolves.toBe(3)

        await expectToBlock(ch.read())
        expect(ch.tryRead()).toBe(undefined)
    })

    test('If buffer is not empty, waitUntilReadable() does not block', async () => {
        const ch = new Channel(3)

        await ch.write(1)
        await ch.waitUntilReadable(undefined)
    })

    test('If buffer is not full, waitUntilWritable() does not block', async () => {
        const ch = new Channel(3)

        await ch.waitUntilWritable(undefined)

        await ch.write(1)
        await ch.write(2)

        await ch.waitUntilWritable(undefined)
    })

    test('If buffer is full, waitUntilWritable() blocks until it is not', async () => {
        const ch = new Channel(3)

        await ch.waitUntilWritable(undefined)

        await ch.write(1)
        await ch.write(2)
        await ch.write(3)

        const w = ch.waitUntilWritable(undefined)
        await expectToBlock(w)

        await ch.read()
        await w
    })

    test('After close(), read()s and tryRead()s consume values from the buffer', async () => {
        const ch = new Channel(3)

        await ch.write(1)
        await ch.write(2)
        ch.close()

        await expect(ch.read()).resolves.toBe(1)
        expect(ch.tryRead()).toBe(2)

        await expect(ch.read()).resolves.toBe(undefined)
        expect(ch.tryRead()).toBe(undefined)
    })
})

const capacities = [0, 5]

describe('All capacities: writes and reads', () => {
    test.for(capacities)(
        'Concurrent blocked write()s resolve one-by-one in unspecified order (%s)',

        async c => {
            const ch = await makeChannelWithFullBuffer(c)

            const blockedWrites = new Map<number, Promise<number>>()

            for (let i = 0; i < 5; ++i) {
                const promise = ch.write(i).then(() => i)
                blockedWrites.set(i, promise)
            }

            while (blockedWrites.size > 0) {
                const race = Promise.race(blockedWrites.values())
                await expectToBlock(race)

                await ch.read()
                const winner = await race

                blockedWrites.delete(winner)
            }
        }
    )

    test.for(capacities)(
        'Concurrent blocked read()s resolve one-by-one in unspecified order (%s)',

        async c => {
            const ch = new Channel(c)

            const blockedReads = new Map<number, Promise<number>>()

            for (let i = 0; i < 5; ++i) {
                const promise = ch.read().then(() => i)
                blockedReads.set(i, promise)
            }

            while (blockedReads.size > 0) {
                const race = Promise.race(blockedReads.values())
                await expectToBlock(race)

                await ch.write(42)
                const winner = await race

                blockedReads.delete(winner)
            }
        }
    )

    test.for(capacities)(
        'After close(), new read()s return undefined (%s)',

        async c => {
            const ch = new Channel(c)

            ch.close()

            for (let i = 0; i < 2; ++i) {
                await expect(ch.read()).resolves.toBe(undefined)
            }
        }
    )

    test.for(capacities)(
        'After close(), blocked and new write()s reject (%s)',

        async c => {
            const ch = await makeChannelWithFullBuffer(c)

            const writes = [ch.write(1), ch.write(2)]
            await expectToBlock(Promise.race(writes))

            ch.close()

            for (const promise of writes) {
                await expect(promise).rejects.toThrowError(CannotWriteIntoClosedChannel)
            }

            for (let i = 0; i < 2; ++i) {
                await expect(ch.write(i)).rejects.toThrowError(CannotWriteIntoClosedChannel)
            }
        }
    )

    test.for(capacities)(
        'After close(), new write()/tryWrite() throw (%s)', 
        
        async c => {
            // Test with nonempty channel just in case
            const ch = await makeChannelWithFullBuffer(c)

            ch.close()

            await expect(ch.write(1)).rejects.toThrowError(CannotWriteIntoClosedChannel)
            expect(() => ch.tryWrite(1)).toThrowError(CannotWriteIntoClosedChannel)
        }
    )
})

test.for(capacities)('close() is idempotent (%s)', c => {
    const ch = new Channel(c)

    ch.close()
    ch.close()
})

test.for(capacities)('After close(), .closed is true (%s)', c => {
    const ch = new Channel(c)

    expect(ch.closed).toBe(false)
    ch.close()
    expect(ch.closed).toBe(true)
})

describe('All capacities: waits', () => {
    test.for(capacities)(
        'If there are multiple blocked waitUntilReadable(), after write(), ' +
        'only one of them unblocks',

        async c => {
            const ch = new Channel(c)

            const w1 = ch.waitUntilReadable(1)
            const w2 = ch.waitUntilReadable(2)

            await expectToBlock(Promise.race([w1, w2]))

            ch.write(1)

            const winner = await Promise.race([w1, w2])

            const remainingWait = winner === 1 ? w2 : w1
            await expectToBlock(remainingWait)
        }
    )

    test.for(capacities)(
        'If there are multiple blocked waitUntilWritable(), after read(), ' +
        'only one of them unblocks',

        async c => {
            const ch = await makeChannelWithFullBuffer(c)

            const w1 = ch.waitUntilWritable(1)
            const w2 = ch.waitUntilWritable(2)

            await expectToBlock(Promise.race([w1, w2]))

            ch.read()

            const winner = await Promise.race([w1, w2])

            const remainingWait = winner === 1 ? w2 : w1
            await expectToBlock(remainingWait)
        }
    )

    test.for(capacities)(
        'If channel is empty, then write() is made, but there is a blocked read(), ' +
        'waitUntilReadable() does not unblock (%s)',

        async c => {
            const ch = new Channel(c)

            const w = ch.waitUntilReadable(undefined)
            await expectToBlock(w)

            const r = ch.read()

            await ch.write(1)
            await expectToBlock(w)
            await expect(r).resolves.toBe(1)
        }
    )

    test.for(capacities)(
        'If buffer is full, then read() is made, but there is a blocked write(), ' +
        'waitUntilWritable() does not unblock (%s)',

        async c => {
            const ch = await makeChannelWithFullBuffer(c)

            const w = ch.waitUntilWritable(undefined)
            await expectToBlock(w)

            ch.write(42)
            await ch.read()

            await expectToBlock(w)
        }
    )

    test.for(capacities)(
        'After close(), all blocked waitUntilReadable() resolve (%s)',

        async c => {
            const ch = new Channel(c)

            const promises = [
                ch.waitUntilReadable(undefined),
                ch.waitUntilReadable(undefined),
            ]

            await expectToBlock(Promise.race(promises))

            ch.close()
            await Promise.all(promises)
        }
    )

    test.for(capacities)(
        'After close(), all blocked waitUntilWritable() resolve (%s)',

        async c => {
            const ch = await makeChannelWithFullBuffer(c)

            const promises = [
                ch.waitUntilWritable(undefined),
                ch.waitUntilWritable(undefined),
            ]

            await expectToBlock(Promise.race(promises))

            ch.close()
            await Promise.all(promises)
        }
    )

    test.for(capacities)(
        'After close(), waitUntilReadable/Writable() never block again (%s)',

        async c => {
            const ch = new Channel(c)

            ch.close()

            for (let i = 0; i < 2; ++i) {
                await ch.waitUntilReadable(undefined)
                await ch.waitUntilWritable(undefined)
            }
        }
    )

    test('waitUntilReadable() can be cancelled', async () => {
        const ch = new Channel(0)

        const controller = new AbortController()

        const w = ch.waitUntilReadable(undefined, controller.signal)

        await expectToBlock(w)
        expect(ch.readableWaitsCount).toBe(1)

        controller.abort()

        await expect(w).rejects.toThrowError(AbortedError)
        expect(ch.readableWaitsCount).toBe(0)
    })

    test('waitUntilWritable() can be cancelled', async () => {
        const ch = new Channel(0)
        const controller = new AbortController()

        const w = ch.waitUntilWritable(undefined, controller.signal)

        await expectToBlock(w)
        expect(ch.writableWaitsCount).toBe(1)

        controller.abort()

        await expect(w).rejects.toThrowError(AbortedError)
        expect(ch.writableWaitsCount).toBe(0)
    })
})

test('Writing `undefined` into channel is not allowed', async () => {
    // `undefined` is returned by `read()` when channel is closed. If we
    // allowed writing `undefined` as a regular value, users would not be
    // able to tell apart "got undefined value" from "channel is closed".
    // `asyncIteratorForChannel()` and potentially other code would break too
    //
    // Users can always use `null` instead

    const ch = new Channel(0)

    //@ts-expect-error `undefined` must not be allowed as a channel value type
    const w = ch.write(undefined)

    await expect(w).rejects.toThrowError()

    expect(() => {
        //@ts-expect-error Same as above
        ch.tryWrite(undefined)
    })
    .toThrowError()
})

test(
    'If write(b) is called after write(a) unblocks, a will be read before b',

    async () => {
        const ch = new Channel(10)

        await ch.write(1)
        await ch.write(2)

        await expect(ch.read()).resolves.toBe(1)
        await expect(ch.read()).resolves.toBe(2)
    }
)

test('If tryWrite(b) is made after tryWrite(a), a will be read before b', async () => {
    const ch = new Channel(10)

    ch.tryWrite(1)
    ch.tryWrite(2)

    await expect(ch.read()).resolves.toBe(1)
    await expect(ch.read()).resolves.toBe(2)
})

test('Channel is an AsyncIterable that reads values', async () => {
    const ch = new Channel<number>(3)

    async function writer() {
        for (let i = 0; i < 3; ++i) {
            await ch.write(i)
        }

        ch.close()
    }

    async function reader() {
        const collectedValues: number[] = []

        for await (const x of ch) {
            collectedValues.push(x)
        }

        return collectedValues
    }

    const [collectedValues, _] = await Promise.all([reader(), writer()])
    expect(collectedValues).toEqual([0, 1, 2])
})
