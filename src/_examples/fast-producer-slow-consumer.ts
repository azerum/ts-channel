/**
 * `producer()` produces values as fast as possible, while `consumer()` consumes
 * one value per seconds. The program does not run out of memory since 
 * `producer()` starts to block on `ch.write()` once the channel buffer is full
 */

import type { ReadableChannel } from '../channel-api.js'
import { Channel } from '../Channel.js'
import { setTimeout } from 'timers/promises'

void main()

async function main() {
    const values = producer()
    await consumer(values)
}

function producer(): ReadableChannel<number> {
    // Buffer capacity of 3 will allow producer() to write 3 values
    // before blocking for 1s - waiting for consumer() to read at least 1
    const ch = new Channel<number>(3)

    void (async () => {
        for (let i = 0;; ++i) {
            await ch.write(i)
            console.log(`Wrote ${i}`)
        }

        ch.close()
    })()

    return ch
}

async function consumer(values: ReadableChannel<number>) {
    for await (const x of values) {
        console.log(`Start processing ${x}`)
        await setTimeout(1000)
        console.log(`Done ${x}`)
    }
}
