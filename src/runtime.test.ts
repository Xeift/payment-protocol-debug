import { afterEach, describe, expect, test } from 'bun:test'
import { requiredEnv, resolvePort } from './runtime.js'

const originalEnv = { ...process.env }

afterEach(() => {
    process.env = { ...originalEnv }
})

describe('runtime config', () => {
    test('resolvePort uses explicit CLI port', () => {
        process.env.X402_PORT = '49000'
        expect(resolvePort('x402', 48123)).toBe(48123)
    })

    test('resolvePort requires protocol env when CLI port is omitted', () => {
        process.env.MPP_PORT = '49001'
        expect(resolvePort('mpp', undefined)).toBe(49001)
    })

    test('resolvePort rejects invalid env port', () => {
        process.env.X402_PORT = 'abc'
        expect(() => resolvePort('x402', undefined))
            .toThrow('Invalid X402_PORT: abc')
    })

    test('requiredEnv rejects missing values', () => {
        delete process.env.MPP_SECRET_KEY
        expect(() => requiredEnv('MPP_SECRET_KEY')).toThrow('Missing MPP_SECRET_KEY')
    })
})
