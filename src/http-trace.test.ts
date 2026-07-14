import { afterEach, describe, expect, test } from 'bun:test'
import { createHttpTraceFetch } from './http-trace.js'

const nativeFetch = globalThis.fetch
const nativeConsoleLog = console.log

function createFetchStub(response: Response): typeof fetch {
    return Object.assign(
        async () => response.clone(),
        {
            preconnect: nativeFetch.preconnect.bind(nativeFetch),
        },
    ) as typeof fetch
}

describe('createHttpTraceFetch', () => {
    afterEach(() => {
        globalThis.fetch = nativeFetch
        console.log = nativeConsoleLog
    })

    test('prints a response title suffix when configured', async () => {
        const lines: string[] = []
        console.log = (...args: unknown[]) => {
            lines.push(args.map(String).join(' '))
        }
        globalThis.fetch = createFetchStub(new Response('', {
            status: 405,
            statusText: 'Method Not Allowed',
        }))

        const fetch = createHttpTraceFetch({
            requestTitlePrefix: 'MCP',
            responseTitlePrefix: 'MCP',
            requestColor: 'green',
            responseColor: 'cyan',
            printDecodedRequestHeaders: () => {},
            printDecodedResponseHeaders: () => {},
            getResponseTitleSuffix: () => '（Server does not support text/event-stream）',
        })

        await fetch('http://localhost:3456/mcp', {
            method: 'GET',
            headers: {
                accept: 'text/event-stream',
            },
        })

        expect(lines.some((line) => (
            line.includes('MCP RESPONSE #1')
            && line.includes('（Server does not support text/event-stream）')
        ))).toBe(true)
    })
})
