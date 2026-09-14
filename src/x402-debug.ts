import { base58 } from '@scure/base'
import { createKeyPairSignerFromBytes } from '@solana/kit'
import { x402Client } from '@x402/core/client'
import {
    HTTPFacilitatorClient,
    x402ResourceServer,
    type FacilitatorConfig,
    type RoutesConfig,
} from '@x402/core/server'
import type { Network, PaymentRequirements, Price } from '@x402/core/types'
import { ExactEvmScheme as ExactEvmClientScheme } from '@x402/evm/exact/client'
import { ExactEvmScheme as ExactEvmServerScheme } from '@x402/evm/exact/server'
import { paymentMiddleware } from '@x402/express'
import { declareErc20ApprovalGasSponsoringExtension } from '@x402/extensions'
import { wrapFetchWithPayment } from '@x402/fetch'
import { ExactSvmScheme as ExactSvmClientScheme } from '@x402/svm/exact/client'
import { ExactSvmScheme as ExactSvmServerScheme } from '@x402/svm/exact/server'
import express from 'express'
import { styleText } from 'node:util'
import { privateKeyToAccount } from 'viem/accounts'
import { withEip712Logging } from './eip712.js'
import { createLoggingFacilitatorClient } from './facilitator-log.js'
import {
    printDecodedX402RequestHeaders,
    printDecodedX402ResponseHeaders,
} from './headers.js'
import { createHttpTraceFetch } from './http-trace.js'
import { printBlock, printJson } from './output.js'
import {
    BASE_SEPOLIA_NETWORK,
    getProtocolProfiles,
    isEvmPaymentProfile,
    isSvmPaymentProfile,
    parseSolanaNetwork,
    profileAssets,
    type PaymentProfile,
    type SvmPaymentProfile,
} from './profiles.js'
import { requiredEnv } from './runtime.js'
import { closeServer, listen } from './server.js'

const STABLECOIN_AMOUNT = '10000'
const SVM_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export type X402Accept = {
    scheme: string
    network: Network
    payTo: string
    price: Price
    maxTimeoutSeconds: number
}

function getSvmNetwork(): Network {
    return parseSolanaNetwork(requiredEnv('X402_SVM_NETWORK'))
}

function requiredSvmAddress(name: string): string {
    const value = requiredEnv(name)
    if (!SVM_ADDRESS_PATTERN.test(value)) {
        throw new Error(`Invalid ${name}: expected a base58 Solana address`)
    }
    return value
}

function getSvmAsset(profile: SvmPaymentProfile): string {
    return requiredSvmAddress(
        profile === 'usdc-transfer-checked'
            ? 'X402_SVM_USDC_MINT'
            : 'X402_SVM_USDT_MINT',
    )
}

function getSvmProfileName(profile: SvmPaymentProfile): 'USDC' | 'USDT' {
    return profile === 'usdc-transfer-checked' ? 'USDC' : 'USDT'
}

export function createX402Accept(profile: PaymentProfile): X402Accept {
    if (isSvmPaymentProfile(profile)) {
        return {
            scheme: 'exact',
            network: getSvmNetwork(),
            payTo: requiredSvmAddress('X402_SVM_SERVER_ADDRESS'),
            price: {
                asset: getSvmAsset(profile),
                amount: STABLECOIN_AMOUNT,
                extra: {},
            },
            maxTimeoutSeconds: 60,
        }
    }

    const asset = profileAssets[profile]
    const extra = (() => {
        if (asset.assetTransferMethod === 'eip3009') {
            if (asset.version === undefined) {
                throw new Error(`Profile ${profile} is missing an EIP-3009 token version`)
            }

            return {
                assetTransferMethod: asset.assetTransferMethod,
                name: asset.name,
                version: asset.version,
            }
        }

        return {
            assetTransferMethod: asset.assetTransferMethod,
        }
    })()

    return {
        scheme: 'exact',
        network: BASE_SEPOLIA_NETWORK,
        payTo: requiredEnv('X402_SERVER_ADDRESS'),
        price: {
            asset: asset.asset,
            amount: STABLECOIN_AMOUNT,
            extra,
        },
        maxTimeoutSeconds: 60,
    }
}

export function getConfiguredX402ServerProfiles(): PaymentProfile[] {
    const hasSvmBaseConfig = Boolean(
        process.env.X402_SVM_NETWORK && process.env.X402_SVM_SERVER_ADDRESS,
    )

    return getProtocolProfiles('x402').filter((profile) => {
        if (isEvmPaymentProfile(profile)) return true
        if (!hasSvmBaseConfig) return false

        return profile === 'usdc-transfer-checked'
            ? Boolean(process.env.X402_SVM_USDC_MINT)
            : Boolean(process.env.X402_SVM_USDT_MINT)
    })
}

export function createX402RouteExtensions(
    profiles: readonly PaymentProfile[] = getProtocolProfiles('x402'),
) {
    return profiles.some(isEvmPaymentProfile)
        ? declareErc20ApprovalGasSponsoringExtension()
        : {}
}

export function createX402FacilitatorConfig(): FacilitatorConfig & { url: string } {
    const url = requiredEnv('X402_FACILITATOR_URL')
    const apiKey = process.env.X402_FACILITATOR_API_KEY

    return {
        url,
        ...(apiKey
            ? {
                createAuthHeaders: async () => {
                    const headers = { 'X-API-Key': apiKey }
                    return {
                        verify: headers,
                        settle: headers,
                        supported: headers,
                    }
                },
            }
            : {}),
    }
}

export function createX402ResourceServer(
    profiles: readonly PaymentProfile[] = getProtocolProfiles('x402'),
) {
    const facilitatorConfig = createX402FacilitatorConfig()
    const httpFacilitatorClient = new HTTPFacilitatorClient(facilitatorConfig)
    const facilitatorClient = createLoggingFacilitatorClient(
        httpFacilitatorClient,
        facilitatorConfig.url,
        Boolean(facilitatorConfig.createAuthHeaders),
    )
    const resourceServer = new x402ResourceServer(facilitatorClient)

    if (profiles.some(isEvmPaymentProfile)) {
        resourceServer.register(BASE_SEPOLIA_NETWORK, new ExactEvmServerScheme())
    }
    if (profiles.some(isSvmPaymentProfile)) {
        resourceServer.register(getSvmNetwork(), new ExactSvmServerScheme())
    }

    return resourceServer
}

function createX402App(
    profiles: readonly PaymentProfile[] = getProtocolProfiles('x402'),
) {
    const app = express()
    app.use(express.json())

    const resourceServer = createX402ResourceServer(profiles)

    const routes = {
        'GET /premium': {
            accepts: profiles.map(createX402Accept),
            description: 'Access to paid x402 protocol debug content',
            extensions: createX402RouteExtensions(profiles),
            mimeType: 'application/json',
        },
    } satisfies RoutesConfig

    app.use(paymentMiddleware(routes, resourceServer))

    app.get('/health', (_req, res) => {
        res.json({
            ok: true,
            protocol: 'x402',
            profiles,
        })
    })

    app.get('/premium', (_req, res) => {
        res.json({ data: 'paid x402 protocol debug content' })
    })

    return app
}

export function selectX402PaymentRequirement(
    profile: PaymentProfile,
    paymentRequirements: PaymentRequirements[],
): PaymentRequirements {
    if (isSvmPaymentProfile(profile)) {
        const network = getSvmNetwork()
        const asset = getSvmAsset(profile)
        const selectedRequirement = paymentRequirements.find((requirement) => (
            requirement.scheme === 'exact' &&
            requirement.network === network &&
            requirement.asset === asset
        ))

        if (!selectedRequirement) {
            throw new Error(`Server did not offer x402 payment profile ${profile}`)
        }

        return selectedRequirement
    }

    const asset = profileAssets[profile]
    const selectedRequirement = paymentRequirements.find((requirement) => (
        requirement.asset.toLowerCase() === asset.asset.toLowerCase() &&
        requirement.extra.assetTransferMethod === asset.assetTransferMethod
    ))

    if (!selectedRequirement) {
        throw new Error(`Server did not offer x402 payment profile ${profile}`)
    }

    return selectedRequirement
}

export async function createX402PaymentClient(profile: PaymentProfile) {
    const client = new x402Client((_version, paymentRequirements) => (
        selectX402PaymentRequirement(profile, paymentRequirements)
    ))

    if (isSvmPaymentProfile(profile)) {
        let privateKeyBytes: Uint8Array
        try {
            privateKeyBytes = base58.decode(requiredEnv('SVM_PRIVATE_KEY'))
        } catch {
            throw new Error('Invalid SVM_PRIVATE_KEY: expected base58')
        }
        if (privateKeyBytes.length !== 64) {
            throw new Error(
                `Invalid SVM_PRIVATE_KEY: expected a 64-byte Solana keypair, got ${privateKeyBytes.length}`,
            )
        }

        const signer = await createKeyPairSignerFromBytes(privateKeyBytes)
        client.register(getSvmNetwork(), new ExactSvmClientScheme(signer))
        return client
    }

    const baseAccount = privateKeyToAccount(
        requiredEnv('X402_CLIENT_PRIVATE_KEY') as `0x${string}`,
    )
    const account = withEip712Logging(baseAccount)
    const asset = profileAssets[profile]
    const exactScheme = asset.assetTransferMethod === 'permit2'
        ? new ExactEvmClientScheme(account, { rpcUrl: requiredEnv('X402_EVM_RPC_URL') })
        : new ExactEvmClientScheme(account)

    client.register(BASE_SEPOLIA_NETWORK, exactScheme)
    return client
}

async function runX402Client(port: number, profile: PaymentProfile) {
    const client = await createX402PaymentClient(profile)
    const fetchWithPayment = wrapFetchWithPayment(
        createHttpTraceFetch({
            requestTitlePrefix: 'X402',
            responseTitlePrefix: 'X402',
            requestColor: 'green',
            responseColor: 'cyan',
            printDecodedRequestHeaders: printDecodedX402RequestHeaders,
            printDecodedResponseHeaders: (response) => {
                printDecodedX402ResponseHeaders(response.headers)
            },
        }),
        client,
    )
    const response = await fetchWithPayment(`http://localhost:${port}/premium`)

    await printBlock(
        'FINAL RESPONSE',
        [
            {
                title: 'STATUS',
                print: () => {
                    console.log(response.status)
                },
            },
            {
                title: 'BODY',
                print: async () => {
                    printJson(await response.clone().json())
                },
            },
        ],
        'cyan',
    )
}

export async function runX402(profile: PaymentProfile, port: number) {
    const titleSuffix = isSvmPaymentProfile(profile)
        ? `[${getSvmProfileName(profile)} TransferChecked generated using ${styleText('underline', '@x402/svm')}]`
        : profile === 'usdc-eip3009'
            ? `[EIP-3009 generated using ${styleText('underline', '@x402/evm')}]`
            : `[Permit2 generated using ${styleText('underline', '@x402/evm')}]`

    await printBlock(
        'PAYMENT DEBUG SELECTION',
        [
            {
                title: 'OPTIONS',
                print: () => {
                    printJson({
                        mode: 'run',
                        protocol: 'x402',
                        profile,
                        port,
                    })
                },
            },
        ],
        'magenta',
        titleSuffix,
    )

    const server = await listen(createX402App([profile]), port, 'x402 debug server')

    try {
        await runX402Client(port, profile)
    } finally {
        await closeServer(server)
    }
}

export async function serveX402(port: number) {
    const profiles = getConfiguredX402ServerProfiles()

    await printBlock(
        'PAYMENT DEBUG SELECTION',
        [
            {
                title: 'OPTIONS',
                print: () => {
                    printJson({
                        mode: 'server',
                        protocol: 'x402',
                        profiles,
                        port,
                    })
                },
            },
        ],
        'magenta',
        `[EVM generated using ${styleText('underline', '@x402/evm')}, SVM TransferChecked generated using ${styleText('underline', '@x402/svm')}]`,
    )

    await listen(createX402App(profiles), port, 'x402 debug server')
}
