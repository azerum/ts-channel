CSP-style channels for TypeScript with `async`/`await`

- Communicating Sequential Processes
- Go channels
- Clojure's `core.async`
- [@thi.ng/csp](https://thi.ng/csp) - for `read()` and `tryRead()` return types which 
avoid extra allocations

# Install

```shell
npm install @azerum/channel
```

# Features

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

[API docs](https://azerum.github.io/ts-channel) describe what each method
on `Channel` does and more

# Examples

See `src/_examples` directory:

- `ping-pong.ts`: ping-pong
TODO: more
