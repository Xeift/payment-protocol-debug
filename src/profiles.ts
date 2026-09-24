export const protocols = ['x402', 'mpp'] as const
export type Protocol = typeof protocols[number]

export const evmPaymentProfiles = ['usdc-eip3009', 'usdc-permit2', 'usdt-permit2'] as const
export type EvmPaymentProfile = typeof evmPaymentProfiles[number]

export const evmApproveProfiles = ['usdc-permit2-approve', 'usdt-permit2-approve'] as const
export type EvmApproveProfile = typeof evmApproveProfiles[number]
export type EvmProfile = EvmPaymentProfile | EvmApproveProfile

export const evmChains = ['base-sepolia', 'arbitrum-sepolia', 'op-sepolia'] as const
export type EvmChain = typeof evmChains[number]

export const svmPaymentProfiles = ['usdc-transfer-checked', 'usdt-transfer-checked'] as const
export type SvmPaymentProfile = typeof svmPaymentProfiles[number]

export const x402PaymentProfiles = [...evmPaymentProfiles, ...svmPaymentProfiles] as const
export const paymentProfiles = [...x402PaymentProfiles, ...evmApproveProfiles] as const
export type PaymentProfile = typeof paymentProfiles[number]
export type X402PaymentProfile = typeof x402PaymentProfiles[number]

const protocolProfiles = {
    x402: x402PaymentProfiles,
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

export const profileAssetMetadata: Record<EvmPaymentProfile, {
    assetTransferMethod: 'eip3009' | 'permit2'
    name: 'USDC' | 'USDT'
    version?: string
}> = {
    'usdc-eip3009': {
        assetTransferMethod: 'eip3009',
        name: 'USDC',
        version: '2',
    },
    'usdc-permit2': {
        assetTransferMethod: 'permit2',
        name: 'USDC',
    },
    'usdt-permit2': {
        assetTransferMethod: 'permit2',
        name: 'USDT',
    },
}

export function isEvmPaymentProfile(profile: PaymentProfile): profile is EvmPaymentProfile {
    return evmPaymentProfiles.includes(profile as EvmPaymentProfile)
}

export function isEvmApproveProfile(profile: PaymentProfile): profile is EvmApproveProfile {
    return evmApproveProfiles.includes(profile as EvmApproveProfile)
}

export function isEvmProfile(profile: PaymentProfile): profile is EvmProfile {
    return isEvmPaymentProfile(profile) || isEvmApproveProfile(profile)
}

export function isSvmPaymentProfile(profile: PaymentProfile): profile is SvmPaymentProfile {
    return svmPaymentProfiles.includes(profile as SvmPaymentProfile)
}

export function isX402PaymentProfile(profile: PaymentProfile): profile is X402PaymentProfile {
    return isEvmPaymentProfile(profile) || isSvmPaymentProfile(profile)
}

export function parseProtocol(value: string): Protocol {
    if (protocols.includes(value as Protocol)) return value as Protocol
    throw new Error(`Unsupported protocol ${value}. Expected x402 or mpp.`)
}

export function parseEvmChain(value: string): EvmChain {
    if (evmChains.includes(value as EvmChain)) return value as EvmChain
    throw new Error(
        `Unsupported chain ${value}. Expected ${evmChains.join(', ')}.`,
    )
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

export function getProtocolProfiles(protocol: 'x402'): X402PaymentProfile[]
export function getProtocolProfiles(protocol: 'mpp'): EvmPaymentProfile[]
export function getProtocolProfiles(protocol: Protocol): PaymentProfile[] {
    return [...protocolProfiles[protocol]]
}

export function assertProtocolProfile(
    protocol: Protocol,
    profile: PaymentProfile,
) {
    if (protocol === 'x402' && isEvmApproveProfile(profile)) return

    const supportedProfiles = protocolProfiles[protocol] as readonly PaymentProfile[]
    if (!supportedProfiles.includes(profile)) {
        throw new Error(`Protocol ${protocol} does not support profile ${profile}`)
    }
}
