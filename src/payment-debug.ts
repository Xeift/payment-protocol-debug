import { parseCliArgs, usage } from './cli.js'
import { isEvmApproveProfile, isX402PaymentProfile } from './profiles.js'
import { serveLocalX402Facilitator } from './local-facilitator.js'
import { runMpp, serveMpp } from './mpp-debug.js'
import { runMppMcp, serveMppMcp } from './mpp-mcp-debug.js'
import { resolvePort } from './runtime.js'
import {
    configureX402EvmChain,
    runX402,
    runX402Permit2Approval,
    serveX402,
} from './x402-debug.js'
import { runX402Mcp, serveX402Mcp } from './x402-mcp-debug.js'

async function main() {
    const options = parseCliArgs(process.argv.slice(2))

    if (options.mode === 'facilitator') {
        await serveLocalX402Facilitator(options.chain!, options.port)
        return
    }

    if (options.protocol === 'x402' && options.chain !== undefined) {
        configureX402EvmChain(options.chain)
    }

    if (
        options.mode === 'run' &&
        options.protocol === 'x402' &&
        options.profile !== undefined &&
        isEvmApproveProfile(options.profile)
    ) {
        await runX402Permit2Approval(options.profile)
        return
    }

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

        if (options.server === 'mcp') {
            await serveMppMcp(port)
            return
        }

        await serveMpp(port)
        return
    }

    if (options.profile === undefined) {
        throw new Error('Missing --profile for --mode run')
    }

    if (options.protocol === 'x402') {
        if (!isX402PaymentProfile(options.profile)) {
            throw new Error(`Unsupported x402 payment profile ${options.profile}`)
        }

        if (options.server === 'mcp') {
            await runX402Mcp(options.profile, port)
            return
        }

        await runX402(options.profile, port)
        return
    }

    if (options.server === 'mcp') {
        await runMppMcp(options.profile, port)
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
