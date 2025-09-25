// Definitions for used global APIs, available both in Node.js and browsers

declare var AbortController: {
    new(): AbortController

    // This is needed for compatibility with @types/node, whose definitions
    // are checked unless skipLibCheck: true (we keep it false for now)
    prototype: AbortController
}

declare interface AbortController {
    readonly signal: AbortSignal
}

declare interface AbortSignal {
    addEventListener(
        type: 'abort',
        listener: () => void,
        options?: { once: boolean} 
    ): void

    removeEventListener(type: 'abort', listener: () => void): void

    readonly aborted: boolean
}

declare function setTimeout(callback: () => void, ms: number): unknown
