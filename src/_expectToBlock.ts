import { expect } from 'vitest'

/**
 * Asserts that `promise` does not settle. Warning: only works for 
 * very particular promises, like ones created by {@link Channel}. Used by `Channel`
 * tests. See comments in the code
 */
export async function expectToBlock(promise: Promise<unknown>) {
    // How to test if a promise does not settle? In general it is not possible -
    // there always might be an async work that takes arbitrary long but finally
    // settles the promise
    //
    // However, in case of Channel, code does not use any async APIs like 
    // `setTimeout`. Promises are only ever resolved from method calls, 
    // synchronously. So by the time method returns, if promise is pending, it 
    // will remain pending
    //
    // In future some code might put resolution of promise into microtask queue,
    // e.g.
    //
    // ```ts
    // someMethod() {
    //   const [promise, resolve] = somehowCreatePromiseAndResolveFn()
    //   this.someOtherPromise.then(() => resolve())
    //   return promise
    // }
    //
    // anotherMethod() {
    //  this.someOtherPromiseResolve()
    // }
    // ```
    //
    // In such case, after `anotherMethod()` returns, promise returned by
    // `someMethod()` will not yet be settled, but it will be once microtask
    // queue is processed
    // 
    // To catch such cases, we wait at least one full event loop iteration. 
    // This gives time for most kinds of callbacks to execute, including
    // new microtask callbacks added inside *another* microtask callback, like
    // with `promise.then().then()`

    const winner = await Promise.race([
        promise,
        waitAtLeastOneEventLoopIteration(STILL_BLOCKED)
    ])

    expect(
        winner, 
        'Expected promise to remain pending. It resolved with the value'
    ).toBe(STILL_BLOCKED)
}

const STILL_BLOCKED = Symbol('STILL_BLOCKED')

function waitAtLeastOneEventLoopIteration<const T>(value: T) {
    return new Promise<T>(resolve => {
        setImmediate(() => {
            setImmediate(() => {
                resolve(value)
            })
        })
    })
}
