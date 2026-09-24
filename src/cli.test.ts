import { describe, expect, test } from 'bun:test'
import { parseCliArgs, usage } from './cli.js'

describe('parseCliArgs', () => {
    test('parses named run arguments', () => {
        expect(parseCliArgs([
            '--mode',
            'run',
            '--protocol',
            'x402',
            '--chain',
            'base-sepolia',
            '--profile',
            'usdc-eip3009',
        ])).toEqual({
            mode: 'run',
            protocol: 'x402',
            profile: 'usdc-eip3009',
            port: undefined,
            server: 'http',
            chain: 'base-sepolia',
        })
    })

    test('parses local facilitator mode without an explicit protocol', () => {
        expect(parseCliArgs([
            '--mode',
            'facilitator',
            '--chain',
            'op-sepolia',
        ])).toEqual({
            mode: 'facilitator',
            protocol: 'x402',
            profile: undefined,
            port: undefined,
            server: 'http',
            chain: 'op-sepolia',
        })
    })

    test('parses local facilitator mode with a custom port', () => {
        expect(parseCliArgs([
            '--mode',
            'facilitator',
            '--chain',
            'op-sepolia',
            '--port',
            '44022',
        ])).toEqual({
            mode: 'facilitator',
            protocol: 'x402',
            profile: undefined,
            port: 44022,
            server: 'http',
            chain: 'op-sepolia',
        })
    })

    test('rejects facilitator mode without a chain', () => {
        expect(() => parseCliArgs([
            '--mode',
            'facilitator',
        ])).toThrow('Missing --chain for --mode facilitator')
    })

    test('rejects non-OP chains for facilitator mode', () => {
        expect(() => parseCliArgs([
            '--mode',
            'facilitator',
            '--chain',
            'base-sepolia',
        ])).toThrow('--mode facilitator currently supports op-sepolia only')
    })

    test('rejects MPP for facilitator mode', () => {
        expect(() => parseCliArgs([
            '--mode',
            'facilitator',
            '--protocol',
            'mpp',
            '--chain',
            'op-sepolia',
        ])).toThrow('--mode facilitator supports x402 only')
    })

    test('rejects profiles for facilitator mode', () => {
        expect(() => parseCliArgs([
            '--mode',
            'facilitator',
            '--chain',
            'op-sepolia',
            '--profile',
            'usdt-permit2',
        ])).toThrow('--mode facilitator does not accept --profile')
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
            chain: undefined,
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
            chain: undefined,
        })
    })

    test('parses x402 SVM TransferChecked run arguments', () => {
        expect(parseCliArgs([
            '--mode',
            'run',
            '--protocol',
            'x402',
            '--profile',
            'usdc-transfer-checked',
        ])).toEqual({
            mode: 'run',
            protocol: 'x402',
            profile: 'usdc-transfer-checked',
            port: undefined,
            server: 'http',
            chain: undefined,
        })
    })

    test('rejects x402-only SVM profiles for MPP', () => {
        expect(() => parseCliArgs([
            '--mode',
            'run',
            '--protocol',
            'mpp',
            '--profile',
            'usdt-transfer-checked',
        ])).toThrow('Protocol mpp does not support profile usdt-transfer-checked')
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
            chain: undefined,
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
            '--chain',
            'base-sepolia',
            '--profile',
            'usdc-eip3009',
        ])).toEqual({
            mode: 'run',
            protocol: 'x402',
            profile: 'usdc-eip3009',
            port: undefined,
            server: 'mcp',
            chain: 'base-sepolia',
        })
    })

    test('parses x402 Permit2 approve-only profile', () => {
        expect(parseCliArgs([
            '--mode',
            'run',
            '--protocol',
            'x402',
            '--chain',
            'op-sepolia',
            '--profile',
            'usdt-permit2-approve',
        ])).toEqual({
            mode: 'run',
            protocol: 'x402',
            profile: 'usdt-permit2-approve',
            port: undefined,
            server: 'http',
            chain: 'op-sepolia',
        })
    })

    test('rejects Permit2 approve-only profile over MCP', () => {
        expect(() => parseCliArgs([
            '--mode',
            'run',
            '--protocol',
            'x402',
            '--server',
            'mcp',
            '--chain',
            'base-sepolia',
            '--profile',
            'usdt-permit2-approve',
        ])).toThrow('Permit2 approve profiles do not support --server mcp')
    })

    test('parses x402 EVM chain selection', () => {
        expect(parseCliArgs([
            '--mode',
            'run',
            '--protocol',
            'x402',
            '--chain',
            'arbitrum-sepolia',
            '--profile',
            'usdt-permit2',
        ])).toEqual({
            mode: 'run',
            protocol: 'x402',
            profile: 'usdt-permit2',
            port: undefined,
            server: 'http',
            chain: 'arbitrum-sepolia',
        })
    })

    test('rejects approve-only profile without chain', () => {
        expect(() => parseCliArgs([
            '--mode',
            'run',
            '--protocol',
            'x402',
            '--profile',
            'usdc-permit2-approve',
        ])).toThrow('Missing --chain for x402 EVM profile')
    })

    test('rejects x402 EVM profile without chain', () => {
        expect(() => parseCliArgs([
            '--mode',
            'run',
            '--protocol',
            'x402',
            '--profile',
            'usdt-permit2',
        ])).toThrow('Missing --chain for x402 EVM profile')
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
            chain: undefined,
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

    test('usage includes the local facilitator command', () => {
        expect(usage()).toContain(
            'bun src/payment-debug.ts --mode facilitator --chain op-sepolia',
        )
    })

    test('usage includes the x402 MCP run command', () => {
        expect(usage()).toContain(
            'bun src/payment-debug.ts --mode run --protocol x402 --server mcp --chain base-sepolia --profile usdc-eip3009',
        )
    })

    test('usage includes Permit2 approve-only commands', () => {
        expect(usage()).toContain(
            'bun src/payment-debug.ts --mode run --protocol x402 --chain base-sepolia --profile usdc-permit2-approve',
        )
        expect(usage()).toContain(
            'bun src/payment-debug.ts --mode run --protocol x402 --chain base-sepolia --profile usdt-permit2-approve',
        )
    })

    test('usage includes x402 SVM TransferChecked run commands', () => {
        expect(usage()).toContain(
            'bun src/payment-debug.ts --mode run --protocol x402 --profile usdc-transfer-checked',
        )
        expect(usage()).toContain(
            'bun src/payment-debug.ts --mode run --protocol x402 --profile usdt-transfer-checked',
        )
    })

    test('usage includes the MPP MCP run command', () => {
        expect(usage()).toContain(
            'bun src/payment-debug.ts --mode run --protocol mpp --server mcp --profile usdc-eip3009',
        )
    })
})
