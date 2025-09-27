/**
 * Two routines play ping-pong: ping sends the ball to pong, pong waits, pong 
 * sends the ball to ping, ping waits, ping sends the ball to pong..
 */

import { Channel } from '../Channel.js'
import { timeout } from '../timeout.js'

interface Ball {
    hits: number
}

void main()

async function main() {
    const table = new Channel<Ball>(0)

    void player(table, 'ping')
    void playerWithForAwait(table, 'pong')

    await table.write({ hits: 0 })
}

async function player(table: Channel<Ball>, name: string) {
    while (true) {
        const ball = await table.read()

        if (ball === undefined) {
            break
        }

        ++ball.hits
        console.log(`${name} ${ball.hits}`)

        await timeout(1000).read()
        await table.write(ball)
    }
}

// Another way to write `player()`
async function playerWithForAwait(table: Channel<Ball>, name: string) {
    for await (const ball of table) {
        ++ball.hits
        console.log(`${name} ${ball.hits}`)

        await timeout(1000).read()
        await table.write(ball)
    }
}
