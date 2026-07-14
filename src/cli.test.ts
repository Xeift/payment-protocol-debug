import { describe, expect, test } from 'bun:test'
import { parseCliArgs, usage } from './cli.js'

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
            server: 'http',
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
            server: 'http',
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
            server: 'http',
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
            server: 'http',
        })
    })

    test('parses MCP server target', () => {
        expect(parseCliArgs([
            '--mode',
            'run',
            '--protocol',
            'x402',
            '--server',
            'mcp',
            '--profile',
            'usdc-eip3009',
        ])).toEqual({
            mode: 'run',
            protocol: 'x402',
            profile: 'usdc-eip3009',
            port: undefined,
            server: 'mcp',
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

    test('rejects unsupported server targets', () => {
        expect(() => parseCliArgs([
            '--mode',
            'run',
            '--protocol',
            'x402',
            '--server',
            'stdio',
            '--profile',
            'usdc-eip3009',
        ])).toThrow('Unsupported server stdio. Expected http or mcp.')
    })

    test('parses MPP MCP USDC EIP-3009 run arguments', () => {
        expect(parseCliArgs([
            '--mode',
            'run',
            '--protocol',
            'mpp',
            '--server',
            'mcp',
            '--profile',
            'usdc-eip3009',
        ])).toEqual({
            mode: 'run',
            protocol: 'mpp',
            profile: 'usdc-eip3009',
            port: undefined,
            server: 'mcp',
        })
    })

    test('rejects MPP MCP Permit2 profiles', () => {
        expect(() => parseCliArgs([
            '--mode',
            'run',
            '--protocol',
            'mpp',
            '--server',
            'mcp',
            '--profile',
            'usdc-permit2',
        ])).toThrow('Protocol mpp server mcp supports profile usdc-eip3009 only')
    })

    test('usage includes the x402 MCP run command', () => {
        expect(usage()).toContain(
            'bun src/payment-debug.ts --mode run --protocol x402 --server mcp --profile usdc-eip3009',
        )
    })

    test('usage includes the MPP MCP run command', () => {
        expect(usage()).toContain(
            'bun src/payment-debug.ts --mode run --protocol mpp --server mcp --profile usdc-eip3009',
        )
    })
})
