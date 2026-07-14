import { parseCliArgs, usage } from './cli.js'
import { runMpp, serveMpp } from './mpp-debug.js'
import { resolvePort } from './runtime.js'
import { runX402, serveX402 } from './x402-debug.js'
import { runX402Mcp, serveX402Mcp } from './x402-mcp-debug.js'

async function main() {
    const options = parseCliArgs(process.argv.slice(2))
    const port = resolvePort(options.protocol, options.port)

    if (options.mode === 'server') {
        if (options.protocol === 'x402') {
            if (options.server === 'mcp') {
                await serveX402Mcp(port)
                return
            }

            await serveX402(port)
            return
        }

        await serveMpp(port)
        return
    }

    if (options.profile === undefined) {
        throw new Error('Missing --profile for --mode run')
    }

    if (options.protocol === 'x402') {
        if (options.server === 'mcp') {
            await runX402Mcp(options.profile, port)
            return
        }

        await runX402(options.profile, port)
        return
    }

    await runMpp(options.profile, port)
}

try {
    await main()
} catch (error) {
    console.error(error instanceof Error ? error.message : error)
    console.error('')
    console.error(usage())
    process.exit(1)
}
