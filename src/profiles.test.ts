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
        expect(parsePaymentProfile('usdc-transfer-checked')).toBe('usdc-transfer-checked')
        expect(parsePaymentProfile('usdt-transfer-checked')).toBe('usdt-transfer-checked')
    })

    test('exposes x402 and MPP profile support exactly', () => {
        expect(getProtocolProfiles('x402')).toEqual([
            'usdc-eip3009',
            'usdc-permit2',
            'usdt-permit2',
            'usdc-transfer-checked',
            'usdt-transfer-checked',
        ])
        expect(getProtocolProfiles('mpp')).toEqual([
            'usdc-eip3009',
            'usdc-permit2',
            'usdt-permit2',
        ])
    })

    test('supports MPP USDC Permit2 explicitly', () => {
        expect(() => assertProtocolProfile('mpp', 'usdc-permit2')).not.toThrow()
    })

    test('keeps SVM profiles scoped to x402', () => {
        expect(() => assertProtocolProfile('x402', 'usdc-transfer-checked')).not.toThrow()
        expect(() => assertProtocolProfile('mpp', 'usdc-transfer-checked')).toThrow(
            'Protocol mpp does not support profile usdc-transfer-checked',
        )
    })
})
