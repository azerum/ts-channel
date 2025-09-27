/**
 * Group input tasks into batches of size 5, and process the batches
 *  
 * Example of real usage is inserting records in DB, where doing INSERT
 * with 100 rows is usually faster than doing 100 INSERTs
 * 
 * `partitionTime()` guarantees that `saver()` will not block forever if 
 * `producer()` emits not-a-multiple-of-5 value. E.g. if producer emits
 * just 3 values, `saver()` will not wait for another 2 forever, but timeout
 * and process the incomplete batch
 */

import type { ReadableChannel } from '../channel-api.js'
import { Channel } from '../Channel.js'
import { setTimeout } from 'timers/promises'
import { partitionTime } from '../partitionTime.js'

void main()

async function main() {
    const data = producer()
    await saver(data)   
}

function producer(): ReadableChannel<number> {
    const ch = new Channel<number>(1)

    void (async () => {
        for (let i = 0;; ++i) {
            const ms = Math.random() * 1500
            await setTimeout(ms)

            await ch.write(i)
            console.log(`Wrote ${i}`)
        }

        ch.close()
    })()

    return ch
}

async function saver(data: ReadableChannel<number>) {
    // Group in batches of 5 values. If >=1s elapses since last value, yields 
    // incomplete batch with <5 values. So each group will have <=5 values

    const partitionedData = partitionTime(data, 5, 1000)

    for await (const batch of partitionedData) {
        // Do something, e.g. save in DB
        console.log(batch)
    }
}
