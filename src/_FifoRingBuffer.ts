import type { NotUndefined } from './channel-api.js'

/**
 * FIFO ring buffer of fixed capacity, with O(1) write() and read()
 */
export class FifoRingBuffer<T extends NotUndefined> {
    private readonly buffer: T[]
    
    private readPointer: number | null
    private writePointer: number | null
    private _length = 0

    constructor(readonly capacity: number) {
        if (!Number.isInteger(capacity) || capacity < 0) {
            throw new Error(`capacity must be an integer >= 0. Got: ${capacity}`)
        }

        this.buffer = Array(capacity)
        this.readPointer = null
        this.writePointer = (capacity === 0) ? null : 0
        this._length = 0
    }

    get length() {
        return this._length
    }

    /**
     * Tries to  adds value to the back of the buffer. Returns `true`
     * if the value was written. Does nothing and returns `false` if the buffer
     * is full
     */
    write(value: T): boolean {
        if (this.writePointer === null) {
            return false
        }

        this.buffer[this.writePointer] = value
        
        if (this.readPointer === null) {
            this.readPointer = this.writePointer
        }

        const next = (this.writePointer + 1) % this.capacity

        this.writePointer = (next === this.readPointer)
            ? null
            : next

        ++this._length

        return true
    }

    /**
     * Reads and removes value from the front of the buffer. Returns 
     * `undefined` if the buffer is empty
     */
    read(): T | undefined {
        if (this.readPointer === null) {
            return undefined
        }

        const value = this.buffer[this.readPointer]!

        if (this.writePointer === null) {
            this.writePointer = this.readPointer
        }

        const next = (this.readPointer + 1) % this.capacity

        this.readPointer = (next === this.writePointer)
            ? null
            : next

        --this._length

        return value
    }
}
