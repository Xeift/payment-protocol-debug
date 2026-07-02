import { describe, expect, test } from 'bun:test'
import {
    assertProtocolProfile,
    getProtocolProfiles,
    parsePaymentProfile,
    parseProtocol,
} from './profiles.js'

describe('profiles', () => {
    test('parses supported protocols and profiles', () => {
        expect(parseProtocol('x402')).toBe('x402')
        expect(parseProtocol('mpp')).toBe('mpp')
        expect(parsePaymentProfile('usdc-eip3009')).toBe('usdc-eip3009')
        expect(parsePaymentProfile('usdc-permit2')).toBe('usdc-permit2')
        expect(parsePaymentProfile('usdt-permit2')).toBe('usdt-permit2')
    })

    test('exposes x402 and MPP profile support exactly', () => {
        expect(getProtocolProfiles('x402')).toEqual([
            'usdc-eip3009',
            'usdc-permit2',
            'usdt-permit2',
        ])
        expect(getProtocolProfiles('mpp')).toEqual([
            'usdc-eip3009',
            'usdt-permit2',
        ])
    })

    test('rejects unsupported MPP USDC Permit2 without fallback', () => {
        expect(() => assertProtocolProfile('mpp', 'usdc-permit2'))
            .toThrow('Protocol mpp does not support profile usdc-permit2')
    })
})
