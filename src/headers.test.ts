import { describe, expect, test } from 'bun:test'
import {
    decodeMaybeBase64urlJson,
    splitScheme,
} from './headers.js'

describe('header helpers', () => {
    test('splitScheme separates auth scheme and value', () => {
        expect(splitScheme('Payment abc.def')).toEqual({
            scheme: 'Payment',
            value: 'abc.def',
        })
    })

    test('splitScheme keeps values without a scheme', () => {
        expect(splitScheme('abc.def')).toEqual({
            scheme: undefined,
            value: 'abc.def',
        })
    })

    test('decodeMaybeBase64urlJson decodes JSON payloads', () => {
        const encoded = Buffer.from(JSON.stringify({ amount: '10000' })).toString('base64url')
        expect(decodeMaybeBase64urlJson(encoded)).toEqual({ amount: '10000' })
    })
})
