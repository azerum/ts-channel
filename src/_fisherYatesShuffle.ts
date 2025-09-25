/**
 * Shuffles the array in place, with each permutation having equal probability
 * of being chosen, using Fisher-Yates algorithm
 *
 * Taken from https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle
 */
export function shuffle(array: unknown[]) {
    for (let i = 1; i <= array.length - 1; ++i) {
        // 0 <= j <= i
        const j = randomInt(0, i + 1)

        const ofI = array[i]
        array[i] = array[j]
        array[j] = ofI
    }
}

function randomInt(minInclusive: number, maxExclusive: number) {
    const f = Math.random() * (maxExclusive - minInclusive) + minInclusive
    return Math.floor(f)
}
