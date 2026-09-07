export const protocols = ['x402', 'mpp'] as const
export type Protocol = typeof protocols[number]

export const evmPaymentProfiles = ['usdc-eip3009', 'usdc-permit2', 'usdt-permit2'] as const
export type EvmPaymentProfile = typeof evmPaymentProfiles[number]

export const svmPaymentProfiles = ['usdc-transfer-checked', 'usdt-transfer-checked'] as const
export type SvmPaymentProfile = typeof svmPaymentProfiles[number]

export const paymentProfiles = [...evmPaymentProfiles, ...svmPaymentProfiles] as const
export type PaymentProfile = typeof paymentProfiles[number]

const protocolProfiles = {
    x402: paymentProfiles,
    mpp: evmPaymentProfiles,
} as const satisfies Record<Protocol, readonly PaymentProfile[]>

export const BASE_SEPOLIA_NETWORK = 'eip155:84532'
export const BASE_SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
export const BASE_SEPOLIA_USDT = '0x323e78f944A9a1FcF3a10efcC5319DBb0bB6e673'

export const SOLANA_MAINNET_NETWORK = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'
export const SOLANA_DEVNET_NETWORK = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'
export const SOLANA_TESTNET_NETWORK = 'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z'
export const solanaNetworks = [
    SOLANA_MAINNET_NETWORK,
    SOLANA_DEVNET_NETWORK,
    SOLANA_TESTNET_NETWORK,
] as const
export type SolanaNetwork = typeof solanaNetworks[number]

export const profileAssets: Record<EvmPaymentProfile, {
    asset: `0x${string}`
    assetTransferMethod: 'eip3009' | 'permit2'
    name: 'USDC' | 'USDT'
    version?: string
}> = {
    'usdc-eip3009': {
        asset: BASE_SEPOLIA_USDC,
        assetTransferMethod: 'eip3009',
        name: 'USDC',
        version: '2',
    },
    'usdc-permit2': {
        asset: BASE_SEPOLIA_USDC,
        assetTransferMethod: 'permit2',
        name: 'USDC',
    },
    'usdt-permit2': {
        asset: BASE_SEPOLIA_USDT,
        assetTransferMethod: 'permit2',
        name: 'USDT',
    },
}

export function isEvmPaymentProfile(profile: PaymentProfile): profile is EvmPaymentProfile {
    return evmPaymentProfiles.includes(profile as EvmPaymentProfile)
}

export function isSvmPaymentProfile(profile: PaymentProfile): profile is SvmPaymentProfile {
    return svmPaymentProfiles.includes(profile as SvmPaymentProfile)
}

export function parseProtocol(value: string): Protocol {
    if (protocols.includes(value as Protocol)) return value as Protocol
    throw new Error(`Unsupported protocol ${value}. Expected x402 or mpp.`)
}

export function parsePaymentProfile(value: string): PaymentProfile {
    if (paymentProfiles.includes(value as PaymentProfile)) return value as PaymentProfile
    throw new Error(
        `Unsupported profile ${value}. Expected ${paymentProfiles.join(', ')}.`,
    )
}

export function parseSolanaNetwork(value: string): SolanaNetwork {
    if (solanaNetworks.includes(value as SolanaNetwork)) return value as SolanaNetwork
    throw new Error(
        `Unsupported Solana network ${value}. Expected ${solanaNetworks.join(', ')}.`,
    )
}

export function getProtocolProfiles(protocol: Protocol): PaymentProfile[] {
    return [...protocolProfiles[protocol]]
}

export function assertProtocolProfile(
    protocol: Protocol,
    profile: PaymentProfile,
) {
    const supportedProfiles = protocolProfiles[protocol] as readonly PaymentProfile[]
    if (!supportedProfiles.includes(profile)) {
        throw new Error(`Protocol ${protocol} does not support profile ${profile}`)
    }
}
