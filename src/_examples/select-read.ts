/**
 * Two producers produce values with random delays. One consumer reads
 * values one-by-one, whichever comes first, using select()
 */

import type { ReadableChannel } from '../channel-api.js'
import { Channel } from '../Channel.js'
import { setTimeout } from 'timers/promises'
import { select } from '../select.js'

void main()

async function main() {
    const producer1 = producer('producer1')
    const producer2 = producer('producer2')

    await consumer(producer1, producer2)
}

function producer(name: string): ReadableChannel<number> {
    const ch = new Channel<number>(0)

    void (async () => {
        let nextValue = 0

        while (true) {
            await setTimeout(Math.random() * 5000)

            await ch.write(nextValue)
            console.log(name, 'wrote value')

            ++nextValue
        }
    })()

    return ch
}

async function consumer(
    producer1: ReadableChannel<number>,
    producer2: ReadableChannel<number>
) {
    while (true) {
        const result = await select({
            producer1: producer1.raceRead(),
            producer2: producer2.raceRead()
        })

        console.log('Got', result.value, 'from', result.type)
    }
}
