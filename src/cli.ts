import {
    type PaymentProfile,
    type Protocol,
    assertProtocolProfile,
    parsePaymentProfile,
    parseProtocol,
} from './profiles.js'

export type Mode = 'run' | 'server'
export type ServerKind = 'http' | 'mcp'

export type CliOptions = {
    mode: Mode
    protocol: Protocol
    profile: PaymentProfile | undefined
    port: number | undefined
    server: ServerKind
}

const argumentNames = new Set(['--mode', '--protocol', '--profile', '--port', '--server'])

function parseMode(value: string): Mode {
    if (value === 'run' || value === 'server') return value
    throw new Error(`Unsupported mode ${value}. Expected run or server.`)
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
    const parsed: Partial<Record<'mode' | 'protocol' | 'profile' | 'port' | 'server', string>> = {}

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
    if (parsed.protocol === undefined) throw new Error('Missing --protocol')

    const mode = parseMode(parsed.mode)
    const protocol = parseProtocol(parsed.protocol)
    const profile = parsed.profile === undefined
        ? undefined
        : parsePaymentProfile(parsed.profile)
    const port = parsed.port === undefined ? undefined : parsePort(parsed.port)
    const server = parsed.server === undefined ? 'http' : parseServerKind(parsed.server)

    if (mode === 'run' && profile === undefined) {
        throw new Error('Missing --profile for --mode run')
    }

    if (profile !== undefined) {
        assertProtocolProfile(protocol, profile)
    }

    if (server === 'mcp' && protocol !== 'x402') {
        throw new Error(`Protocol ${protocol} does not support server ${server}`)
    }

    return {
        mode,
        protocol,
        profile,
        port,
        server,
    }
}

export function usage(): string {
    return [
        'Usage:',
        '  bun src/payment-debug.ts --mode run --protocol x402 --server mcp --profile usdc-eip3009',
        '  bun src/payment-debug.ts --mode run --protocol x402 --profile usdc-eip3009',
        '  bun src/payment-debug.ts --mode run --protocol x402 --profile usdc-permit2',
        '  bun src/payment-debug.ts --mode run --protocol x402 --profile usdt-permit2',
        '  bun src/payment-debug.ts --mode run --protocol mpp --profile usdc-eip3009',
        '  bun src/payment-debug.ts --mode run --protocol mpp --profile usdt-permit2',
        '  bun src/payment-debug.ts --mode server --protocol x402',
        '  bun src/payment-debug.ts --mode server --protocol x402 --server mcp',
        '  bun src/payment-debug.ts --mode server --protocol mpp',
        '',
        'Optional:',
        '  --server http',
        '  --server mcp',
        '  --port 48123',
    ].join('\n')
}
