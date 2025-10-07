import { expect, test } from 'vitest'
import { Channel } from './Channel.js'
import { select } from './select.js'
import { expectToBlock } from './_expectToBlock.js'

test('Racing reads and writes', async () => {
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

    ch2.write(2)
    const r3 = ch3.read()

    await expect(s).resolves.toEqual({ type: 'ch2', value: 2 })

    // Verify that other channels were not written to/read from

    await expectToBlock(ch1.write(1))
    await expectToBlock(r3)
    await expectToBlock(ch4.read())
})

test(
    'Handles race condition when other readers "steal" value of recently ' +
    'readable channel',

    async () => {
        const ch = new Channel(0)

        const s = select({ ch: ch.raceRead() })
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
    'Handles race condition when other writes "steal" free space of recently ' +
    'writable channel',

    async () => {
        const ch = new Channel(0)

        // Same principle as with test for edge case with reads:
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
