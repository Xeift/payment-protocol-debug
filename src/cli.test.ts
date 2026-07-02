import { describe, expect, test } from 'bun:test'
import { parseCliArgs } from './cli.js'

describe('parseCliArgs', () => {
    test('parses named run arguments', () => {
        expect(parseCliArgs([
            '--mode',
            'run',
            '--protocol',
            'x402',
            '--profile',
            'usdc-eip3009',
        ])).toEqual({
            mode: 'run',
            protocol: 'x402',
            profile: 'usdc-eip3009',
            port: undefined,
        })
    })

    test('parses server mode without a profile', () => {
        expect(parseCliArgs([
            '--mode',
            'server',
            '--protocol',
            'mpp',
        ])).toEqual({
            mode: 'server',
            protocol: 'mpp',
            profile: undefined,
            port: undefined,
        })
    })

    test('parses MPP USDC Permit2 run arguments', () => {
        expect(parseCliArgs([
            '--mode',
            'run',
            '--protocol',
            'mpp',
            '--profile',
            'usdc-permit2',
        ])).toEqual({
            mode: 'run',
            protocol: 'mpp',
            profile: 'usdc-permit2',
            port: undefined,
        })
    })

    test('parses optional port as an integer', () => {
        expect(parseCliArgs([
            '--mode',
            'server',
            '--protocol',
            'x402',
            '--port',
            '48123',
        ])).toEqual({
            mode: 'server',
            protocol: 'x402',
            profile: undefined,
            port: 48123,
        })
    })

    test('rejects missing run profile', () => {
        expect(() => parseCliArgs([
            '--mode',
            'run',
            '--protocol',
            'x402',
        ])).toThrow('Missing --profile for --mode run')
    })

    test('rejects unsupported argument names', () => {
        expect(() => parseCliArgs([
            '--mode',
            'server',
            '--protocol',
            'x402',
            '--format',
            'json',
        ])).toThrow('Unsupported argument --format')
    })
})
