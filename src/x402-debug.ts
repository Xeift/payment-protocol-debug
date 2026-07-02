import type { PaymentOption } from '@x402/core/http'
import { HTTPFacilitatorClient, x402ResourceServer, type RoutesConfig } from '@x402/core/server'
import type { PaymentRequirements } from '@x402/core/types'
import { ExactEvmScheme as ExactEvmClientScheme } from '@x402/evm/exact/client'
import { ExactEvmScheme as ExactEvmServerScheme } from '@x402/evm/exact/server'
import { paymentMiddleware } from '@x402/express'
import { declareErc20ApprovalGasSponsoringExtension } from '@x402/extensions'
import { wrapFetchWithPayment, x402Client } from '@x402/fetch'
import express from 'express'
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
    type PaymentProfile,
    profileAssets,
} from './profiles.js'
import { requiredEnv } from './runtime.js'
import { closeServer, listen } from './server.js'

const STABLECOIN_AMOUNT = '10000'

function createX402Accept(profile: PaymentProfile): PaymentOption {
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

function createX402App() {
    const app = express()
    app.use(express.json())

    const facilitatorUrl = requiredEnv('X402_FACILITATOR_URL')
    const httpFacilitatorClient = new HTTPFacilitatorClient({
        url: facilitatorUrl,
    })
    const facilitatorClient = createLoggingFacilitatorClient(
        httpFacilitatorClient,
        facilitatorUrl,
    )
    const resourceServer = new x402ResourceServer(facilitatorClient)
    resourceServer.register(BASE_SEPOLIA_NETWORK, new ExactEvmServerScheme())

    const routes = {
        'GET /premium': {
            accepts: [
                createX402Accept('usdc-eip3009'),
                createX402Accept('usdc-permit2'),
                createX402Accept('usdt-permit2'),
            ],
            description: 'Access to paid x402 protocol debug content',
            extensions: {
                ...declareErc20ApprovalGasSponsoringExtension(),
            },
            mimeType: 'application/json',
        },
    } satisfies RoutesConfig

    app.use(paymentMiddleware(routes, resourceServer))

    app.get('/health', (_req, res) => {
        res.json({
            ok: true,
            protocol: 'x402',
            profiles: ['usdc-eip3009', 'usdc-permit2', 'usdt-permit2'],
        })
    })

    app.get('/premium', (_req, res) => {
        res.json({ data: 'paid x402 protocol debug content' })
    })

    return app
}

function selectX402PaymentRequirement(
    profile: PaymentProfile,
    paymentRequirements: PaymentRequirements[],
): PaymentRequirements {
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

async function runX402Client(port: number, profile: PaymentProfile) {
    const baseAccount = privateKeyToAccount(
        requiredEnv('X402_CLIENT_PRIVATE_KEY') as `0x${string}`,
    )
    const account = withEip712Logging(baseAccount)
    const client = new x402Client((_version, paymentRequirements) => (
        selectX402PaymentRequirement(profile, paymentRequirements)
    ))
    const asset = profileAssets[profile]
    const exactScheme = asset.assetTransferMethod === 'permit2'
        ? new ExactEvmClientScheme(account, { rpcUrl: requiredEnv('X402_EVM_RPC_URL') })
        : new ExactEvmClientScheme(account)

    client.register(BASE_SEPOLIA_NETWORK, exactScheme)

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
    )

    const server = await listen(createX402App(), port, 'x402 debug server')

    try {
        await runX402Client(port, profile)
    } finally {
        await closeServer(server)
    }
}

export async function serveX402(port: number) {
    await printBlock(
        'PAYMENT DEBUG SELECTION',
        [
            {
                title: 'OPTIONS',
                print: () => {
                    printJson({
                        mode: 'server',
                        protocol: 'x402',
                        profiles: ['usdc-eip3009', 'usdc-permit2', 'usdt-permit2'],
                        port,
                    })
                },
            },
        ],
        'magenta',
    )

    await listen(createX402App(), port, 'x402 debug server')
}
