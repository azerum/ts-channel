import type { ReadableChannel } from './channel-api.js'
import { Channel } from './Channel.js'

/**
 * Returns a channel that closes after given time
 */
export function timeout(ms: number): ReadableChannel<never> {
    const ch = new Channel<never>(0)

    setTimeout(() => {
        ch.close()
    }, ms)

    return ch
}
