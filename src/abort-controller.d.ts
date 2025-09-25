declare var AbortController: {
    new(): AbortController
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
