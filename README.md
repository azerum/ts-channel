CSP-style channels for TypeScript with `async`/`await`

- Communicating Sequential Processes
- Go channels
- Clojure's `core.async`
- [@thi.ng/csp](https://thi.ng/csp) - for `read()` and `tryRead()` return types which 
avoid extra allocations

### Install

```shell
npm install @azerum/ts-csp
```

### Features

- Write familiar procedural code with `async`/`await` to process streams of data,
while respecting backpressure. No more callback hell

- Buffered & unbuffered channels

- `select()` function for timeout, cancellation, and other logic similar to 
`select {}` statement in Go (currently, only reads are supported)

- Some useful operators: `merge()`, `partitionTime()`, `timeout()`

- Focus on TS ergonomics: strict types, inferred nicely when possible

- Works in Node.js and browsers; relies on global `setTimeout`, `AbortController`

- No dependencies

- Thoroughly tested

[API docs](https://azerum.github.io/ts-csp) describe what each method
on `Channel` does and more

### Examples

See `src/_examples` directory:

- [Ping-pong](./src/_examples/ping-pong.ts): common introductory example of channels in Go

- [Fast producer and slow consumer](./src/_examples/fast-producer-slow-consumer.ts): demonstrates how backpressure works
  
- [Fan-out, fan-in](./src/_examples/fan-out-fan-in.ts): a common pattern to distribute work among N workers and merge results back

- [Batch processing](./src/_examples/batch-processing.ts): read channel in 
batches of size N, processing one batch at a time - useful for e.g. saving
data in DB with better throughput
