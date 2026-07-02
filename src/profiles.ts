export const protocols = ['x402', 'mpp'] as const
export type Protocol = typeof protocols[number]

export const paymentProfiles = ['usdc-eip3009', 'usdc-permit2', 'usdt-permit2'] as const
export type PaymentProfile = typeof paymentProfiles[number]

const protocolProfiles = {
    x402: ['usdc-eip3009', 'usdc-permit2', 'usdt-permit2'],
    mpp: ['usdc-eip3009', 'usdt-permit2'],
} as const satisfies Record<Protocol, readonly PaymentProfile[]>

export const BASE_SEPOLIA_NETWORK = 'eip155:84532'
export const BASE_SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
export const BASE_SEPOLIA_USDT = '0x323e78f944A9a1FcF3a10efcC5319DBb0bB6e673'

export const profileAssets: Record<PaymentProfile, {
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

export function parseProtocol(value: string): Protocol {
    if (protocols.includes(value as Protocol)) return value as Protocol
    throw new Error(`Unsupported protocol ${value}. Expected x402 or mpp.`)
}

export function parsePaymentProfile(value: string): PaymentProfile {
    if (paymentProfiles.includes(value as PaymentProfile)) return value as PaymentProfile
    throw new Error(
        `Unsupported profile ${value}. Expected usdc-eip3009, usdc-permit2, or usdt-permit2.`,
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
