import { describe, expect, test } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { createMppMcpClientPair } from './mpp-mcp-debug.js'

describe('MPP MCP debug implementation', () => {
    test('uses mppx MCP SDK helpers for the paid tool flow', async () => {
        const source = await Bun.file(new URL('./mpp-mcp-debug.ts', import.meta.url)).text()

        expect(source).toContain("from 'mppx/mcp-sdk/client'")
        expect(source).toContain('mppxServerTransport.mcpSdk()')
        expect(source).toContain('stripMppxHttpTransport')
        expect(source).toContain('MppxMcpClient.wrap')
        expect(source).toContain('mppxServerEvm.charge')
        expect(source).toContain('paid_tool')
        expect(source).not.toContain('@quicknode/mpp')
    })

    test('keeps MCP lifecycle calls on the native SDK client', () => {
        const mcpClient = new Client({
            name: 'test-client',
            version: '1.0.0',
        })
        const fakeMethod = {
            name: 'evm',
            intent: 'charge',
            createCredential: async () => 'credential',
        }

        const pair = createMppMcpClientPair(
            mcpClient,
            fakeMethod as unknown as Parameters<typeof createMppMcpClientPair>[1],
            async () => {},
        )

        expect(pair.sdkClient).toBe(mcpClient)
        expect(pair.sdkClient.connect).toBeInstanceOf(Function)
        expect(pair.sdkClient.listTools).toBeInstanceOf(Function)
        expect(pair.sdkClient.close).toBeInstanceOf(Function)
        expect(pair.paymentClient.callTool).toBeInstanceOf(Function)
        expect('connect' in pair.paymentClient).toBe(false)
        expect('listTools' in pair.paymentClient).toBe(false)
        expect('close' in pair.paymentClient).toBe(false)
    })
})
