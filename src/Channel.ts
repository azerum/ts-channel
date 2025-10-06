import { FifoRingBuffer } from './_FifoRingBuffer.js'
import { AbortablePromise } from './AbortablePromise.js'
import { asyncIteratorForChannel } from './asyncIteratorForChannel.js'
import { CannotWriteIntoClosedChannel, type NotUndefined, type ReadableChannel, type WritableChannel } from './channel-api.js'

/**
 * Implementation of buffered and unbuffered channel, depending on the constructor 
 * parameter
 * 
 * For details, see the methods of {@link ReadableChannel} and {@link WritableChannel}
 * 
 * Note that `T extends NotUndefined`. See {@link NotUndefined} docs for the
 * explanation
 */
export class Channel<T extends NotUndefined> implements ReadableChannel<T>, WritableChannel<T> {
    private readonly buffer: FifoRingBuffer<T>

    // TODO?: those could be queues

    private blockedWrites: BlockedWrite<T>[] = []
    private blockedReads: ResolveReadFn<T>[] = []

    private readonly readableWaits = new Set<() => void>()
    private readonly writableWaits = new Set<() => void>()

    private _closed = false

    /**
     * @param capacity Capacity of the channel buffer. Integer >= 0. If 0,
     * the channel is *unbuffered*, meaning that each {@link WritableChannel.write}
     * blocks until {@link ReadableChannel.read} and vice versa
     */
    constructor(readonly capacity: number) {
        this.buffer = new FifoRingBuffer(capacity)
    }

    get closed() {
        return this._closed
    }

    get readableWaitsCount() {
        return this.readableWaits.size
    }

    get writableWaitsCount() {
        return this.writableWaits.size
    }

    [Symbol.asyncIterator]() {
        return asyncIteratorForChannel(this)
    }

    async write(value: T): Promise<void> {
        if (value === undefined) {
            throw new Error(`Writing \`undefined\` into channel is not allowed`)
        }

        if (this._closed) {
            throw new CannotWriteIntoClosedChannel()
        }

        const readToResolve = this.blockedReads.shift()

        if (readToResolve !== undefined) {
            readToResolve(value)
            return
        }

        this.resolveSomeReadableWait()

        const didWrite = this.buffer.write(value)

        if (didWrite) {
            return
        }

        return new Promise((resolve, reject) => {
            this.blockedWrites.push({ value, resolve, reject })
        })
    }

    async read(): Promise<T | undefined> {
        const result = this.tryRead()

        if (result !== undefined || this._closed) {
            return result
        }

        this.resolveSomeWritableWait()

        return new Promise(resolve => {
            this.blockedReads.push(resolve)
        })
    }

    tryRead(): T | undefined {
        // In unbuffered channel, buffer is always empty and we should read
        // value from the first blocked write
        // 
        // In buffered channel, blocked writes are possible only if the buffer is
        // full. We always read value from the buffer, then resolve any blocked
        // write and put its value in the buffer

        if (this.capacity === 0) {
            const write = this.blockedWrites.shift()

            if (write === undefined) {
                return undefined
            }

            write.resolve()
            return write.value
        }

        const value = this.buffer.read()

        if (value === undefined) {
            return undefined
        }

        const write = this.blockedWrites.shift()

        if (write === undefined) {
            // A space in the buffer was freed, and there are no blocked
            // writes. If one writable wait if there are any

            this.resolveSomeWritableWait()
        }
        else {
            // `write()` always returns `true` here, as we've just done 
            // `read()` above, freeing space for at least 1 element
            this.buffer.write(write.value)
    
            write.resolve()
        }

        return value
    }

    waitUntilReadable<const R>(value: R, signal?: AbortSignal): Promise<R> {
        return new AbortablePromise(resolve => {
            if (this._closed) {
                resolve(value)
                return null
            }

            if (this.buffer.length > 0 || this.blockedWrites.length > 0) {
                resolve(value)
                return null
            }

            const resolveFn = () => resolve(value)
            this.readableWaits.add(resolveFn)

            return () => {
                this.readableWaits.delete(resolveFn)
            }
        }, signal)
    }

    async waitUntilWritable<const R>(value: R, signal?: AbortSignal): Promise<R> {
        return new AbortablePromise(resolve => {
            if (this._closed) {
                resolve(value)
                return null
            }

            if (this.buffer.length < this.capacity || this.blockedReads.length > 0) {
                resolve(value)
                return null
            }

            const resolveFn = () => resolve(value)
            this.writableWaits.add(resolveFn)

            return () => {
                this.writableWaits.delete(resolveFn)
            }
        }, signal)
    }

    close() {
        if (this._closed) {
            return
        }

        this._closed = true

        this.resolveAllReadsWithUndefined()
        this.rejectAllWrites()
        this.resolveAllWaits()
    }

    private resolveAllReadsWithUndefined() {
        for (const resolve of this.blockedReads) {
            resolve(undefined)
        }

        this.blockedReads = []
    }

    private rejectAllWrites() {
        const error = new CannotWriteIntoClosedChannel()

        for (const write of this.blockedWrites) {
            write.reject(error)
        }

        this.blockedWrites = []
    }

    private resolveAllWaits() {
        for (const resolve of this.readableWaits) {
            resolve()
        }

        this.readableWaits.clear()

        for (const resolve of this.writableWaits) {
            resolve()
        }
    
        this.writableWaits.clear()
    }

    private resolveSomeReadableWait() {
        const { value: first } = this.readableWaits[Symbol.iterator]().next()

        if (first !== undefined) {
            first()
            this.readableWaits.delete(first)
        }
    }

    private resolveSomeWritableWait() {
        const { value: first } = this.writableWaits[Symbol.iterator]().next()

        if (first !== undefined) {
            first()
            this.writableWaits.delete(first)
        }
    }
}

interface BlockedWrite<T> {
    value: T
    resolve: () => void
    reject: (reason: unknown) => void
}

type ResolveReadFn<T> = (result: T | undefined) => void
