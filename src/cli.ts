import {
    type EvmChain,
    type PaymentProfile,
    type Protocol,
    assertProtocolProfile,
    isEvmApproveProfile,
    isEvmProfile,
    parseEvmChain,
    parsePaymentProfile,
    parseProtocol,
} from './profiles.js'

export type Mode = 'run' | 'server' | 'facilitator'
export type ServerKind = 'http' | 'mcp'

export type CliOptions = {
    mode: Mode
    protocol: Protocol
    profile: PaymentProfile | undefined
    port: number | undefined
    server: ServerKind
    chain: EvmChain | undefined
}

const argumentNames = new Set(['--mode', '--protocol', '--profile', '--port', '--server', '--chain'])

function parseMode(value: string): Mode {
    if (value === 'run' || value === 'server' || value === 'facilitator') return value
    throw new Error(`Unsupported mode ${value}. Expected run, server, or facilitator.`)
}

function parsePort(value: string): number {
    const port = Number(value)
    if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
        throw new Error(`Invalid --port ${value}`)
    }
    return port
}

function parseServerKind(value: string): ServerKind {
    if (value === 'http' || value === 'mcp') return value
    throw new Error(`Unsupported server ${value}. Expected http or mcp.`)
}

export function parseCliArgs(args: string[]): CliOptions {
    const parsed: Partial<Record<'mode' | 'protocol' | 'profile' | 'port' | 'server' | 'chain', string>> = {}

    for (let index = 0; index < args.length; index += 2) {
        const name = args[index]
        const value = args[index + 1]

        if (name === undefined) break
        if (!argumentNames.has(name)) throw new Error(`Unsupported argument ${name}`)
        if (value === undefined || value.startsWith('--')) {
            throw new Error(`Missing value for ${name}`)
        }

        parsed[name.slice(2) as keyof typeof parsed] = value
    }

    if (parsed.mode === undefined) throw new Error('Missing --mode')

    const mode = parseMode(parsed.mode)
    if (mode !== 'facilitator' && parsed.protocol === undefined) {
        throw new Error('Missing --protocol')
    }

    const protocol = mode === 'facilitator'
        ? 'x402'
        : parseProtocol(parsed.protocol!)
    const profile = parsed.profile === undefined
        ? undefined
        : parsePaymentProfile(parsed.profile)
    const port = parsed.port === undefined ? undefined : parsePort(parsed.port)
    const server = parsed.server === undefined ? 'http' : parseServerKind(parsed.server)
    const chain = parsed.chain === undefined ? undefined : parseEvmChain(parsed.chain)

    if (mode === 'run' && profile === undefined) {
        throw new Error('Missing --profile for --mode run')
    }

    if (mode === 'facilitator') {
        if (parsed.protocol !== undefined && parseProtocol(parsed.protocol) !== 'x402') {
            throw new Error('--mode facilitator supports x402 only')
        }
        if (profile !== undefined) {
            throw new Error('--mode facilitator does not accept --profile')
        }
        if (server !== 'http') {
            throw new Error('--mode facilitator does not accept --server mcp')
        }
        if (chain === undefined) {
            throw new Error('Missing --chain for --mode facilitator')
        }
        if (chain !== 'op-sepolia') {
            throw new Error('--mode facilitator currently supports op-sepolia only')
        }
    }

    if (profile !== undefined) {
        assertProtocolProfile(protocol, profile)
    }

    if (chain !== undefined && protocol !== 'x402') {
        throw new Error('--chain is supported for x402 only')
    }
    if (mode === 'run' && protocol === 'x402' && profile !== undefined && isEvmProfile(profile) && chain === undefined) {
        throw new Error('Missing --chain for x402 EVM profile')
    }
    if (mode === 'run' && profile !== undefined && !isEvmProfile(profile) && chain !== undefined) {
        throw new Error('--chain is supported for x402 EVM profiles only')
    }
    if (mode === 'run' && server === 'mcp' && profile !== undefined && isEvmApproveProfile(profile)) {
        throw new Error('Permit2 approve profiles do not support --server mcp')
    }

    if (server === 'mcp' && protocol !== 'x402' && protocol !== 'mpp') {
        throw new Error(`Protocol ${protocol} does not support server ${server}`)
    }
    if (server === 'mcp' && protocol === 'mpp' && profile !== undefined && profile !== 'usdc-eip3009') {
        throw new Error('Protocol mpp server mcp supports profile usdc-eip3009 only')
    }

    return {
        mode,
        protocol,
        profile,
        port,
        server,
        chain,
    }
}

export function usage(): string {
    return [
        'Usage:',
        '  bun src/payment-debug.ts --mode facilitator --chain op-sepolia',
        '  bun src/payment-debug.ts --mode run --protocol x402 --server mcp --chain base-sepolia --profile usdc-eip3009',
        '  bun src/payment-debug.ts --mode run --protocol mpp --server mcp --profile usdc-eip3009',
        '  bun src/payment-debug.ts --mode run --protocol x402 --chain base-sepolia --profile usdc-eip3009',
        '  bun src/payment-debug.ts --mode run --protocol x402 --chain base-sepolia --profile usdc-permit2',
        '  bun src/payment-debug.ts --mode run --protocol x402 --chain base-sepolia --profile usdc-permit2-approve',
        '  bun src/payment-debug.ts --mode run --protocol x402 --chain base-sepolia --profile usdt-permit2-approve',
        '  bun src/payment-debug.ts --mode run --protocol x402 --chain base-sepolia --profile usdt-permit2',
        '  bun src/payment-debug.ts --mode run --protocol x402 --chain arbitrum-sepolia --profile usdt-permit2',
        '  bun src/payment-debug.ts --mode run --protocol x402 --chain op-sepolia --profile usdt-permit2',
        '  bun src/payment-debug.ts --mode run --protocol x402 --profile usdc-transfer-checked',
        '  bun src/payment-debug.ts --mode run --protocol x402 --profile usdt-transfer-checked',
        '  bun src/payment-debug.ts --mode run --protocol mpp --profile usdc-eip3009',
        '  bun src/payment-debug.ts --mode run --protocol mpp --profile usdt-permit2',
        '  bun src/payment-debug.ts --mode server --protocol x402 --chain base-sepolia',
        '  bun src/payment-debug.ts --mode server --protocol x402 --server mcp --chain base-sepolia',
        '  bun src/payment-debug.ts --mode server --protocol mpp --server mcp',
        '  bun src/payment-debug.ts --mode server --protocol mpp',
        '',
        'Optional:',
        '  --server http',
        '  --server mcp',
        '  --port 48123',
        '  --chain base-sepolia|arbitrum-sepolia|op-sepolia',
    ].join('\n')
}
