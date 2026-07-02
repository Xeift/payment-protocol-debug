import { styleText } from 'node:util'
import { evm as quicknodeClientEvm } from '@quicknode/mpp/client'
import {
    Mppx as QuicknodeServerMppx,
    Store,
    evm as quicknodeServerEvm,
    type ChargeStore,
} from '@quicknode/mpp/server'
import express, {
    type NextFunction,
    type Request as ExpressRequest,
    type Response as ExpressResponse,
} from 'express'
import { Mppx as MppxClient, evm as mppxClientEvm } from 'mppx/client'
import { Mppx as MppxServer, evm as mppxServerEvm } from 'mppx/server'
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import { withEip712Logging } from './eip712.js'
import {
    printDecodedMppRequestHeaders,
    printDecodedMppResponseHeaders,
} from './headers.js'
import { createHttpTraceFetch } from './http-trace.js'
import { printBlock, printJson } from './output.js'
import {
    BASE_SEPOLIA_USDC,
    BASE_SEPOLIA_USDT,
    type PaymentProfile,
} from './profiles.js'
import { requiredEnv } from './runtime.js'
import { closeServer, listen } from './server.js'

const PREMIUM_AMOUNT = '0.01'
const PREMIUM_DESCRIPTION = 'Access to paid MPP protocol debug content'
const STABLECOIN_DECIMALS = 6
const EIP3009_ABI = parseAbi([
    'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature)',
])

type MppPaymentProfile = PaymentProfile

const mppPaths = {
    'usdc-eip3009': '/premium/usdc-eip3009',
    'usdc-permit2': '/premium/usdc-permit2',
    'usdt-permit2': '/premium/usdt-permit2',
} as const satisfies Record<MppPaymentProfile, string>

type QuicknodeChargeAccount = NonNullable<Parameters<typeof quicknodeClientEvm.charge>[0]['account']>
type WithReceipt = {
    (): globalThis.Response
    (response: globalThis.Response): globalThis.Response
}
type PaymentResult = {
    status: 402
    challenge: globalThis.Response
} | {
    status: number
    withReceipt: WithReceipt
}
type PaymentHandler = (request: Request) => Promise<PaymentResult>

function assertMppPaymentProfile(profile: PaymentProfile): asserts profile is MppPaymentProfile {
    if (profile !== 'usdc-eip3009' && profile !== 'usdc-permit2' && profile !== 'usdt-permit2') {
        throw new Error(`Protocol mpp does not support profile ${profile}`)
    }
}

function toFetchHeaders(req: ExpressRequest): Headers {
    const headers = new Headers()

    for (const [name, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) {
            for (const item of value) headers.append(name, item)
        } else if (value !== undefined) {
            headers.set(name, value)
        }
    }

    return headers
}

function toFetchRequest(req: ExpressRequest): Request {
    const host = req.get('host') ?? req.hostname
    return new Request(`${req.protocol}://${host}${req.originalUrl}`, {
        method: req.method,
        headers: toFetchHeaders(req),
    })
}

function copyResponseHeaders(
    from: globalThis.Response,
    to: ExpressResponse,
) {
    for (const [key, value] of from.headers) {
        to.setHeader(key, value)
    }
}

function paymentMiddleware(handler: PaymentHandler): express.RequestHandler {
    return async (
        req: ExpressRequest,
        res: ExpressResponse,
        next: NextFunction,
    ) => {
        const result = await handler(toFetchRequest(req))

        if (result.status === 402 && 'challenge' in result) {
            const challenge = result.challenge
            res.status(challenge.status)
            copyResponseHeaders(challenge, res)
            res.send(await challenge.text())
            return
        }

        if (!('withReceipt' in result)) {
            throw new Error(`MPP handler returned status ${result.status} without a receipt wrapper`)
        }

        const managementResponse = (() => {
            try {
                return result.withReceipt()
            } catch (error) {
                if (MppxServer.isMissingReceiptResponseError(error)) return null
                throw error
            }
        })()

        if (managementResponse) {
            res.status(managementResponse.status)
            copyResponseHeaders(managementResponse, res)
            if (managementResponse.body === null) {
                res.end()
                return
            }
            res.send(Buffer.from(await managementResponse.arrayBuffer()))
            return
        }

        const originalJson = res.json.bind(res)
        res.json = (body: unknown) => {
            const wrapped = result.withReceipt(globalThis.Response.json(body))
            copyResponseHeaders(wrapped, res)
            return originalJson(body)
        }

        next()
    }
}

function createMppApp() {
    const app = express()
    app.use(express.json())

    const secretKey = requiredEnv('MPP_SECRET_KEY')
    const recipient = requiredEnv('MPP_SERVER_ADDRESS') as `0x${string}`
    const submitterPrivateKey = requiredEnv('MPP_SERVER_PRIVATE_KEY') as `0x${string}`
    const account = privateKeyToAccount(submitterPrivateKey)
    const rpcUrl = requiredEnv('MPP_EVM_RPC_URL')
    const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) })
    const walletClient = createWalletClient({ chain: baseSepolia, transport: http(rpcUrl), account })
    const quicknodeStore = Store.memory() as ChargeStore

    const usdcEip3009Mppx = MppxServer.create({
        secretKey,
        methods: [
            mppxServerEvm({
                currency: mppxServerEvm.assets.baseSepolia.USDC,
                recipient,
                settle: async ({ payload, request }) => {
                    const { request: simulatedRequest } = await publicClient.simulateContract({
                        account,
                        address: request.currency as `0x${string}`,
                        abi: EIP3009_ABI,
                        functionName: 'transferWithAuthorization',
                        args: [
                            payload.from as `0x${string}`,
                            payload.to as `0x${string}`,
                            BigInt(payload.value),
                            BigInt(payload.validAfter),
                            BigInt(payload.validBefore),
                            payload.nonce as `0x${string}`,
                            payload.signature as `0x${string}`,
                        ],
                    })
                    const hash = await walletClient.writeContract(simulatedRequest)
                    const receipt = await publicClient.waitForTransactionReceipt({ hash })

                    if (receipt.status !== 'success') {
                        throw new Error('EVM authorization transfer reverted')
                    }

                    return { reference: hash }
                },
            }),
        ],
    })

    usdcEip3009Mppx.onChallengeCreated(({ challenge }) => {
        console.log('MPP challenge created')
        console.log(JSON.stringify(challenge, null, 2))
    })
    usdcEip3009Mppx.onPaymentFailed(({ error }) => {
        console.error('MPP payment failed')
        console.error(error)
    })
    usdcEip3009Mppx.onPaymentSuccess(({ receipt }) => {
        console.log('MPP payment success')
        console.log(JSON.stringify(receipt, null, 2))
    })

    const usdcPermit2Mppx = QuicknodeServerMppx.create({
        secretKey,
        methods: [
            quicknodeServerEvm.charge({
                chain: 'base-sepolia',
                rpcUrl,
                recipient,
                submitter: { privateKey: submitterPrivateKey },
                store: quicknodeStore,
                customToken: {
                    address: BASE_SEPOLIA_USDC,
                    decimals: STABLECOIN_DECIMALS,
                    symbol: 'USDC',
                    credentialTypes: ['permit2'],
                },
                credentialTypes: ['permit2'],
            }),
        ],
    })

    const usdtPermit2Mppx = QuicknodeServerMppx.create({
        secretKey,
        methods: [
            quicknodeServerEvm.charge({
                chain: 'base-sepolia',
                rpcUrl,
                recipient,
                submitter: { privateKey: submitterPrivateKey },
                store: quicknodeStore,
                customToken: {
                    address: BASE_SEPOLIA_USDT,
                    decimals: STABLECOIN_DECIMALS,
                    symbol: 'USDT',
                    credentialTypes: ['permit2'],
                },
                credentialTypes: ['permit2'],
            }),
        ],
    })

    const premiumUsdcEip3009Charge = usdcEip3009Mppx.evm.charge({
        amount: PREMIUM_AMOUNT,
        description: PREMIUM_DESCRIPTION,
    })
    const premiumUsdcPermit2Charge = usdcPermit2Mppx.evm.charge({
        amount: PREMIUM_AMOUNT,
        description: PREMIUM_DESCRIPTION,
    })
    const premiumUsdtPermit2Charge = usdtPermit2Mppx.evm.charge({
        amount: PREMIUM_AMOUNT,
        description: PREMIUM_DESCRIPTION,
    })

    app.get('/health', (_req, res) => {
        res.json({
            ok: true,
            protocol: 'mpp',
            profiles: ['usdc-eip3009', 'usdc-permit2', 'usdt-permit2'],
        })
    })

    app.get('/premium/usdc-eip3009', paymentMiddleware(premiumUsdcEip3009Charge), (_req, res) => {
        res.json({ data: 'paid MPP USDC EIP-3009 protocol debug content' })
    })

    app.get('/premium/usdc-permit2', paymentMiddleware(premiumUsdcPermit2Charge), (_req, res) => {
        res.json({ data: 'paid MPP USDC Permit2 protocol debug content' })
    })

    app.get('/premium/usdt-permit2', paymentMiddleware(premiumUsdtPermit2Charge), (_req, res) => {
        res.json({ data: 'paid MPP USDT Permit2 protocol debug content' })
    })

    return app
}

function createMppPaymentClient(profile: MppPaymentProfile) {
    const baseAccount = privateKeyToAccount(
        requiredEnv('MPP_CLIENT_PRIVATE_KEY') as `0x${string}`,
    )
    const account = withEip712Logging(baseAccount)
    const fetch = createHttpTraceFetch({
        requestTitlePrefix: 'MPP',
        responseTitlePrefix: 'MPP',
        requestColor: 'green',
        responseColor: 'cyan',
        printDecodedRequestHeaders: printDecodedMppRequestHeaders,
        printDecodedResponseHeaders: printDecodedMppResponseHeaders,
    })

    if (profile === 'usdc-permit2' || profile === 'usdt-permit2') {
        return MppxClient.create({
            methods: [
                quicknodeClientEvm.charge({
                    account: account as unknown as QuicknodeChargeAccount,
                    prefer: ['permit2'],
                }),
            ],
            polyfill: false,
            fetch,
        })
    }

    return MppxClient.create({
        methods: [
            mppxClientEvm.charge({
                account: account as any,
                currencies: [mppxClientEvm.assets.baseSepolia.USDC],
                networks: [mppxClientEvm.chains.baseSepolia],
            }),
        ],
        polyfill: false,
        fetch,
    })
}

async function runMppClient(port: number, profile: PaymentProfile) {
    assertMppPaymentProfile(profile)
    const path = mppPaths[profile]
    const mppx = createMppPaymentClient(profile)
    const response = await mppx.fetch(`http://localhost:${port}${path}`)

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

export async function runMpp(profile: PaymentProfile, port: number) {
    const titleSuffix = profile === 'usdc-eip3009'
        ? `[EIP-3009 generated using ${styleText('underline', 'mppx')}]`
        : `[Permit2 generated using ${styleText('underline', '@quicknode/mpp')} (very unstable)]`

    await printBlock(
        'PAYMENT DEBUG SELECTION',
        [
            {
                title: 'OPTIONS',
                print: () => {
                    printJson({
                        mode: 'run',
                        protocol: 'mpp',
                        profile,
                        port,
                    })
                },
            },
        ],
        'magenta',
        titleSuffix,
    )

    const server = await listen(createMppApp(), port, 'MPP debug server')

    try {
        await runMppClient(port, profile)
    } finally {
        await closeServer(server)
    }
}

export async function serveMpp(port: number) {
    await printBlock(
        'PAYMENT DEBUG SELECTION',
        [
            {
                title: 'OPTIONS',
                print: () => {
                    printJson({
                        mode: 'server',
                        protocol: 'mpp',
                        profiles: ['usdc-eip3009', 'usdc-permit2', 'usdt-permit2'],
                        port,
                    })
                },
            },
        ],
        'magenta',
        `[EIP-3009 generated using ${styleText('underline', 'mppx')}, Permit2 generated using ${styleText('underline', '@quicknode/mpp')} (very unstable)]`,
    )

    await listen(createMppApp(), port, 'MPP debug server')
}
