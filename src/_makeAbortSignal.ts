/**
 * Returns `[signal, abortFn]`. Optionally links the returned signal to
 * the "upstream" signal: once the upstream signal aborts, so does the
 * returned one
 *
 * `abortFn` aborts the returned signal and has no effect on the upstream
 * signal
 *
 * Adds one event listener to `upstream` and removes it once the returned
 * signal aborts
 *
 * TODO: when older browsers are deprecated, replace this with `AbortSignal.any()`
 */
export function makeAbortSignal(
    upstream: AbortSignal | undefined
): [AbortSignal, () => void] {
    const controller = new AbortController()

    if (upstream === undefined) {
        return [controller.signal, controller.abort.bind(controller)]
    }

    const upstreamListener = () => {
        controller.abort()
    }

    upstream.addEventListener('abort', upstreamListener, { once: true })

    return [controller.signal, () => {
        controller.abort()
        upstream.removeEventListener('abort', upstreamListener)
    }]
}
