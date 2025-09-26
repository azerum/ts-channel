Go-style channels for Node.js:

- Procedural-looking code with async/await that naturally respects backpressure

- Buffered & unbuffered

- `select()` like `select {}` statement in Go (limited to reading from channels) - 
to read from multiple channels, whichever is first (e.g. timeout logic)

- `for await` loop to iterate over channel

- Operators: `merge`, `partitionTime`, `timeout`, `mapWritableChannel`, 
`mapReadableChannel`

- Thoroughly tested

- Focus on TS ergonomics: types are inferred nicely when possible

- Zero dependencies; runs in Node.js and browser (depends on `setTimeout`, 
`AbortController`)

Inspired by:

- Tony Hoare's CSP
- Go channels
- [@thi.ng/csp](https://@thi.ng/csp) - idea of lightweight return types of `read()`
and `tryRead()` without extra allocations

Examples:

TODO
