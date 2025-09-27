import { expect, test } from 'vitest'
import { FifoRingBuffer } from './_FifoRingBuffer.js'

test.for([1, 5])(
    'write() adds a value and returns true until the buffer is full (capacity=%s)',

    capacity => {
        const buffer = new FifoRingBuffer(capacity)

        for (let value = 0; value < capacity; ++value) {
            expect(buffer.write(value)).toBe(true)
        }

        for (let i = 0; i < 2; ++i) {
            expect(buffer.write(42)).toBe(false)
        }
    }
)

test.for([1, 5])(
    'read() reads values in the order of writing - FIFO - until the buffer is empty ' +
    '(capacity=%s)',

    capacity => {
        const buffer = new FifoRingBuffer(capacity)

        for (let value = 0; value < capacity; ++value) {
            expect(buffer.write(value)).toBe(true)
        }

        for (let expected = 0; expected < capacity; ++expected) {
            const actual = buffer.read()
            expect(actual).toBe(expected)
        }

        expect(buffer.read()).toBe(undefined)
    }
)

test('read() on empty buffer returns undefined', () => {
    const buffer = new FifoRingBuffer(1)
    expect(buffer.read()).toBe(undefined)
})

test('Intermixed reads and writes work as expected', () => {
    const buffer = new FifoRingBuffer(3)

    expect(buffer.write(1)).toBe(true)
    expect(buffer.read()).toBe(1)

    expect(buffer.write(2)).toBe(true)
    expect(buffer.write(3)).toBe(true)
    expect(buffer.read()).toBe(2)

    expect(buffer.write(4)).toBe(true)
    expect(buffer.write(5)).toBe(true)
    expect(buffer.write(6)).toBe(false)
    expect(buffer.read()).toBe(3)
    expect(buffer.read()).toBe(4)
    expect(buffer.read()).toBe(5)
    expect(buffer.read()).toBe(undefined)
})

test(
    'When capacity=0, write() always returns false, and read() always ' + 
    'returns undefined', 
    
    () => {
        const buffer = new FifoRingBuffer(0)

        for (let i = 0; i < 5; ++i) {
            expect(buffer.write(i)).toBe(false)
        }

        for (let i = 0; i < 5; ++i) {
            expect(buffer.read()).toBe(undefined)
        }
    }
)
