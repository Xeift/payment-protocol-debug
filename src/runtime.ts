import type { Protocol } from './profiles.js'

const portEnvByProtocol = {
    x402: 'X402_PORT',
    mpp: 'MPP_PORT',
} as const satisfies Record<Protocol, string>

export function requiredEnv(name: string): string {
    const value = process.env[name]
    if (!value) throw new Error(`Missing ${name}`)
    return value
}

function parsePort(name: string, value: string): number {
    const port = Number(value)
    if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
        throw new Error(`Invalid ${name}: ${value}`)
    }
    return port
}

export function resolvePort(protocol: Protocol, explicitPort: number | undefined): number {
    if (explicitPort !== undefined) return explicitPort

    const envName = portEnvByProtocol[protocol]
    return parsePort(envName, requiredEnv(envName))
}
