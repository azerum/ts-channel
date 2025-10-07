CSP-style channels for TypeScript with `async`/`await`. Inspired by:

- Communicating Sequential Processes
- Go channels
- Clojure's `core.async`
- [@thi.ng/csp](https://thi.ng/csp) - idea of return types of `read()` and `tryRead()` 
that avoid extra allocations

### Install

```shell
npm install @azerum/ts-csp
```

### Stability

Experimental: breaking changes to API are expected

### Features

- Write familiar procedural code with `async`/`await` to process streams of data,
while respecting backpressure. No more callback hell

- Buffered and unbuffered channels

- `select()` function similar to `select{}` statement in Go, `alts!` in Clojure,
with support of reads and writes

- Timeout and cancellation of reads with `select()` + `raceTimeout()` / `raceAbortSignal()`

- Some useful operators: `merge()`, `partitionTime()`

- TS ergonomics: types are strict and inferred when possible (e.g. see `select()`)

- Works in Node.js and browsers; relies on global `setTimeout`, `AbortController`

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
