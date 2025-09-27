import { EventEmitter } from 'events'

export function abortListenersCount(s: AbortSignal) {
    return EventEmitter.getEventListeners(s, 'abort').length
}
