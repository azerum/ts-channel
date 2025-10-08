CSP-style channels for TypeScript with `async`/`await`. Inspired by:

- Communicating Sequential Processes
- Go channels
- Clojure's `core.async`
- [@thi.ng/csp](https://thi.ng/csp) - idea of return types of `read()` and `tryRead()` 
that avoid extra allocations

### Install

```shell
npm install -E @azerum/ts-csp
```

### Stability

Experimental: breaking changes to API are expected

### Features

- `async`/`await` for all blocking operations, `for await` support

- Buffered & unbuffered channels

- [`select()`](https://azerum.github.io/ts-csp/functions/select.html) function 
similar to `select{}` statement in Go: reads & writes, timeout via 
[`raceTimeout()`](https://azerum.github.io/ts-csp/functions/raceTimeout.html), 
abort via [`raceAbortSignal()`](https://azerum.github.io/ts-csp/functions/raceAbortSignal.html), 
inferred return type for exhaustive matching

- Operators: [`merge()`](https://azerum.github.io/ts-csp/functions/merge.html),
[`partitionTime()`](https://azerum.github.io/ts-csp/functions/partitionTime.html)

- Works in Node.js and browsers; relies on global `setTimeout`, `AbortController`,
`AbortSignal`

- No dependencies

- Thoroughly tested

[API docs](https://azerum.github.io/ts-csp/classes/Channel) describe what each method
on `Channel` does and more

### Examples

See `src/_examples` directory:

- [Ping-pong](./src/_examples/ping-pong.ts): common introductory example of channels in Go

- [Fast producer and slow consumer](./src/_examples/fast-producer-slow-consumer.ts): demonstrates how backpressure works
  
- [Fan-out, fan-in](./src/_examples/fan-out-fan-in.ts): a common pattern to distribute work among N workers and merge results back

- [Read from multiple channels with select](./src/_examples/select-read.ts)

- [Batch processing](./src/_examples/batch-processing.ts): use of `partitionTime()`: 
process channel in groups of N items. Useful e.g. to save data in DB in batches
