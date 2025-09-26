import { Channel } from '../Channel.js'
import { timeout } from '../timeout.js'

interface Ball {
    hits: number
}

void main()

async function main() {
    const table = new Channel<Ball>(0)

    void player(table, 'ping')
    void player(table, 'pong')

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

        // Or use Promisified `setTimeout` 
        await timeout(1000).read()

        await table.write(ball)
    }
}
