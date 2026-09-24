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
import {
    ExactEvmScheme as ExactEvmClientScheme,
    createPermit2ApprovalTx,
} from '@x402/evm/exact/client'
import { ExactEvmScheme as ExactEvmServerScheme } from '@x402/evm/exact/server'
import { paymentMiddleware } from '@x402/express'
import { declareErc20ApprovalGasSponsoringExtension } from '@x402/extensions'
import { wrapFetchWithPayment } from '@x402/fetch'
import { ExactSvmScheme as ExactSvmClientScheme } from '@x402/svm/exact/client'
import { ExactSvmScheme as ExactSvmServerScheme } from '@x402/svm/exact/server'
import express from 'express'
import { styleText } from 'node:util'
import { createPublicClient, createWalletClient, http, isAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrumSepolia, baseSepolia, optimismSepolia } from 'viem/chains'
import { withEip712Logging } from './eip712.js'
import { createLoggingFacilitatorClient } from './facilitator-log.js'
import {
    printDecodedX402RequestHeaders,
    printDecodedX402ResponseHeaders,
} from './headers.js'
import { createHttpTraceFetch } from './http-trace.js'
import { printBlock, printJson } from './output.js'
import {
    getProtocolProfiles,
    isEvmPaymentProfile,
    isSvmPaymentProfile,
    parseSolanaNetwork,
    profileAssetMetadata,
    type EvmApproveProfile,
    type EvmChain,
    type EvmPaymentProfile,
    type EvmProfile,
    type SvmPaymentProfile,
    type X402PaymentProfile,
} from './profiles.js'
import { requiredEnv } from './runtime.js'
import { closeServer, listen } from './server.js'

const STABLECOIN_AMOUNT = '10000'
const X402_EVM_ENV_PREFIX_BY_CHAIN: Record<EvmChain, string> = {
    'base-sepolia': 'X402_EVM_BASE_SEPOLIA',
    'arbitrum-sepolia': 'X402_EVM_ARBITRUM_SEPOLIA',
    'op-sepolia': 'X402_EVM_OP_SEPOLIA',
}
const EVM_NETWORK_PATTERN = /^eip155:[1-9]\d*$/
const VIEM_CHAIN_BY_NETWORK = {
    'eip155:84532': baseSepolia,
    'eip155:421614': arbitrumSepolia,
    'eip155:11155420': optimismSepolia,
} as const
const SVM_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export type X402Accept = {
    scheme: string
    network: Network
    payTo: string
    price: Price
    maxTimeoutSeconds: number
}

export function configureX402EvmChain(chain: EvmChain): void {
    const prefix = X402_EVM_ENV_PREFIX_BY_CHAIN[chain]
    process.env.X402_EVM_NETWORK = requiredEnv(`${prefix}_NETWORK`)
    process.env.X402_EVM_RPC_URL = requiredEnv(`${prefix}_RPC_URL`)
    process.env.X402_EVM_USDT_ADDRESS = requiredEnv(`${prefix}_USDT_ADDRESS`)
    process.env.X402_FACILITATOR_URL = requiredEnv(`${prefix}_FACILITATOR_URL`)

    const facilitatorApiKey = process.env[`${prefix}_FACILITATOR_API_KEY`]
    if (facilitatorApiKey) process.env.X402_FACILITATOR_API_KEY = facilitatorApiKey
    else delete process.env.X402_FACILITATOR_API_KEY

    const usdcAddress = process.env[`${prefix}_USDC_ADDRESS`]
    if (usdcAddress) process.env.X402_EVM_USDC_ADDRESS = usdcAddress
    else delete process.env.X402_EVM_USDC_ADDRESS
}

function getEvmNetwork(): Network {
    const network = requiredEnv('X402_EVM_NETWORK')
    if (!EVM_NETWORK_PATTERN.test(network)) {
        throw new Error(`Invalid X402_EVM_NETWORK: ${network}. Expected eip155:<chainId>`)
    }
    return network as Network
}

function getEvmAssetEnvName(profile: EvmProfile): string {
    return profile.startsWith('usdc-')
        ? 'X402_EVM_USDC_ADDRESS'
        : 'X402_EVM_USDT_ADDRESS'
}

function getEvmAsset(profile: EvmProfile): `0x${string}` {
    const envName = getEvmAssetEnvName(profile)
    const address = requiredEnv(envName)
    if (!isAddress(address)) {
        throw new Error(`Invalid ${envName}: expected an EVM address`)
    }
    return address
}

function getConfiguredViemChain() {
    const network = getEvmNetwork()
    const chain = VIEM_CHAIN_BY_NETWORK[network as keyof typeof VIEM_CHAIN_BY_NETWORK]
    if (!chain) {
        throw new Error(`Unsupported configured EVM network for approve: ${network}`)
    }
    return chain
}

export function createX402Permit2ApprovalTx(profile: EvmApproveProfile) {
    const asset = getEvmAsset(profile)
    return {
        asset,
        ...createPermit2ApprovalTx(asset),
    }
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

export function createX402Accept(profile: X402PaymentProfile): X402Accept {
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

    const asset = getEvmAsset(profile)
    const metadata = profileAssetMetadata[profile]
    const extra = (() => {
        if (metadata.assetTransferMethod === 'eip3009') {
            if (metadata.version === undefined) {
                throw new Error(`Profile ${profile} is missing an EIP-3009 token version`)
            }

            return {
                assetTransferMethod: metadata.assetTransferMethod,
                name: metadata.name,
                version: metadata.version,
            }
        }

        return {
            assetTransferMethod: metadata.assetTransferMethod,
        }
    })()

    return {
        scheme: 'exact',
        network: getEvmNetwork(),
        payTo: requiredEnv('X402_SERVER_ADDRESS'),
        price: {
            asset,
            amount: STABLECOIN_AMOUNT,
            extra,
        },
        maxTimeoutSeconds: 60,
    }
}

export function getConfiguredX402ServerProfiles(): X402PaymentProfile[] {
    const hasEvmBaseConfig = Boolean(
        process.env.X402_EVM_NETWORK && process.env.X402_SERVER_ADDRESS,
    )
    const hasSvmBaseConfig = Boolean(
        process.env.X402_SVM_NETWORK && process.env.X402_SVM_SERVER_ADDRESS,
    )

    return getProtocolProfiles('x402').filter((profile) => {
        if (isEvmPaymentProfile(profile)) {
            return hasEvmBaseConfig && Boolean(process.env[getEvmAssetEnvName(profile)])
        }
        if (!hasSvmBaseConfig) return false

        return profile === 'usdc-transfer-checked'
            ? Boolean(process.env.X402_SVM_USDC_MINT)
            : Boolean(process.env.X402_SVM_USDT_MINT)
    })
}

export function createX402RouteExtensions(
    profiles: readonly X402PaymentProfile[] = getProtocolProfiles('x402'),
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
    profiles: readonly X402PaymentProfile[] = getProtocolProfiles('x402'),
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
        resourceServer.register(getEvmNetwork(), new ExactEvmServerScheme())
    }
    if (profiles.some(isSvmPaymentProfile)) {
        resourceServer.register(getSvmNetwork(), new ExactSvmServerScheme())
    }

    return resourceServer
}

function createX402App(
    profiles: readonly X402PaymentProfile[] = getProtocolProfiles('x402'),
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
    profile: X402PaymentProfile,
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

    const network = getEvmNetwork()
    const asset = getEvmAsset(profile)
    const metadata = profileAssetMetadata[profile]
    const selectedRequirement = paymentRequirements.find((requirement) => (
        requirement.network === network &&
        requirement.asset.toLowerCase() === asset.toLowerCase() &&
        requirement.extra.assetTransferMethod === metadata.assetTransferMethod
    ))

    if (!selectedRequirement) {
        throw new Error(`Server did not offer x402 payment profile ${profile}`)
    }

    return selectedRequirement
}

export async function createX402PaymentClient(profile: X402PaymentProfile) {
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
    const metadata = profileAssetMetadata[profile]
    const exactScheme = metadata.assetTransferMethod === 'permit2'
        ? new ExactEvmClientScheme(account, { rpcUrl: requiredEnv('X402_EVM_RPC_URL') })
        : new ExactEvmClientScheme(account)

    client.register(getEvmNetwork(), exactScheme)
    return client
}

async function runX402Client(port: number, profile: X402PaymentProfile) {
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

export async function runX402Permit2Approval(profile: EvmApproveProfile) {
    const chain = getConfiguredViemChain()
    const rpcUrl = requiredEnv('X402_EVM_RPC_URL')
    const account = privateKeyToAccount(
        requiredEnv('X402_CLIENT_PRIVATE_KEY') as `0x${string}`,
    )
    const walletClient = createWalletClient({
        account,
        chain,
        transport: http(rpcUrl),
    })
    const publicClient = createPublicClient({
        chain,
        transport: http(rpcUrl),
    })
    const approval = createX402Permit2ApprovalTx(profile)

    await printBlock(
        'PERMIT2 APPROVAL',
        [
            {
                title: 'TRANSACTION',
                print: () => {
                    printJson({
                        profile,
                        network: getEvmNetwork(),
                        owner: account.address,
                        token: approval.asset,
                        to: approval.to,
                    })
                },
            },
        ],
        'magenta',
        `[approve(Permit2, MaxUint256) generated using ${styleText('underline', '@x402/evm')}]`,
    )

    const hash = await walletClient.sendTransaction({
        to: approval.to,
        data: approval.data,
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })

    await printBlock(
        'APPROVAL RESULT',
        [
            {
                title: 'RECEIPT',
                print: () => {
                    printJson({
                        hash,
                        status: receipt.status,
                        blockNumber: receipt.blockNumber.toString(),
                    })
                },
            },
        ],
        'cyan',
    )

    if (receipt.status !== 'success') {
        throw new Error(`Permit2 approval transaction reverted: ${hash}`)
    }
}

export async function runX402(profile: X402PaymentProfile, port: number) {
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
