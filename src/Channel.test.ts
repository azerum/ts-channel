import { describe, expect, test } from 'vitest'
import { Channel } from './Channel.js'
import { expectToBlock } from './_expectToBlock.js'
import { CannotWriteIntoClosedChannel } from './channel-api.js'

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

    test('When there is no blocked write(), tryRead() returns undefined', async () => {
        const ch = new Channel(0)
        expect(ch.tryRead()).toBe(undefined)
    })

    test('When there is a blocked write(), tryRead() unblocks it', async () => {
        const ch = new Channel(0)

        const w = ch.write(42)
        await expectToBlock(w)

        expect(ch.tryRead()).toBe(42)
        await w
    })

    test('When there is a blocked write(), waitForReadReady() resolves', async () => {
        const ch = new Channel(0)

        ch.write(1)
        await ch.waitForReadReady(undefined)
    })

    test('After close(), blocked read()s are resolved', async () => {
        const ch = new Channel(0)

        const reads = [ch.read(), ch.read()]
        await expectToBlock(Promise.race(reads))

        ch.close()
        await expect(Promise.all(reads)).resolves.toEqual([undefined, undefined])
    })

    test('After close(), tryRead()s return undefined', async () => {
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

    test('If buffer is not empty, waitForReadReady() resolves', async () => {
        const ch = new Channel(3)

        await ch.write(1)
        await ch.waitForReadReady(undefined)
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

describe('All capacities', () => {
    const capacities = [0, 5]

    test.for(capacities)(
        'Blocked write()s wait for read()s and resolve in FIFO order',

        async c => {
            const ch = await makeChannelWithFullBuffer(c)

            const w1 = ch.write('a')
            const w2 = ch.write('b')

            await expectToBlock(Promise.race([w1, w2]))

            await ch.read()
            await w1
            await expectToBlock(w2)

            await ch.read()
            await w2
        }
    )

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

    test.for(capacities)(
        'Blocked read()s wait for writes()s and resolve in FIFO order',

        async c => {
            const ch = new Channel(c)

            const r1 = ch.read()
            const r2 = ch.read()

            await expectToBlock(Promise.race([r1, r2]))

            await ch.write(42)
            await expect(r1).resolves.toEqual(42)
            await expectToBlock(r2)

            await ch.write(43)
            await expect(r2).resolves.toEqual(43)
        }
    )

    test.for(capacities)('After close(), new read()s return undefined', async c => {
        const ch = new Channel(c)

        ch.close()

        for (let i = 0; i < 2; ++i) {
            await expect(ch.read()).resolves.toBe(undefined)
        }
    })

    test.for(capacities)('After close(), blocked and new write()s reject', async c => {
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
    })

    test.for(capacities)(
        'If channel is empty and there is blocked read(), waitForReadReady() ' +
        'does not unblock on write()',

        async c => {
            const ch = new Channel(c)

            const w = ch.waitForReadReady(undefined)
            await expectToBlock(w)

            const r = ch.read()

            await ch.write(1)
            await expectToBlock(w)
            await expect(r).resolves.toBe(1)
        }
    )
})

test('close() is idempotent', () => {
    const ch = new Channel(0)

    ch.close()
    ch.close()
})

test('After close(), .closed is true', () => {
    const ch = new Channel(0)

    expect(ch.closed).toBe(false)
    ch.close()
    expect(ch.closed).toBe(true)
})

test('After close(), blocked waitForReadReady() resolves', async () => {
    const ch = new Channel(0)

    const w = ch.waitForReadReady(undefined)
    await expectToBlock(w)

    ch.close()
    await w
})

test('After close(), waitForReadReady() never blocks again', async () => {
    const ch = new Channel(0)

    ch.close()

    for (let i = 0; i < 2; ++i) {
        await ch.waitForReadReady(undefined)
    }
})

describe(
    'If there are concurrent blocked waitForReadReady(), only one of them resolves',

    () => {
        test.todo('On write()', async () => {
        })

        test.todo('On close()', async () => {
        })
    }
)
