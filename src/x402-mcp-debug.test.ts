import { describe, expect, test } from 'bun:test'

describe('x402 MCP debug output', () => {
    test('does not print a redundant MCP tools summary block', async () => {
        const source = await Bun.file(new URL('./x402-mcp-debug.ts', import.meta.url)).text()

        expect(source).toContain('await client.listTools()')
        expect(source).not.toContain("'MCP TOOLS'")
    })
})
