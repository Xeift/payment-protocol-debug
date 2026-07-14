import { randomUUID } from 'node:crypto'
import { styleText } from 'node:util'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import express, {
    type Request as ExpressRequest,
    type Response as ExpressResponse,
} from 'express'
import { McpClient as MppxMcpClient } from 'mppx/mcp-sdk/client'
import { evm as mppxClientEvm } from 'mppx/client'
import {
    Mppx as MppxServer,
    Transport as mppxServerTransport,
    evm as mppxServerEvm,
} from 'mppx/server'
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import { withEip712Logging } from './eip712.js'
import { createHttpTraceFetch } from './http-trace.js'
import { printBlock, printJson, stringifyJson } from './output.js'
import { type PaymentProfile } from './profiles.js'
import { requiredEnv } from './runtime.js'
import { closeServer, listen } from './server.js'

const MCP_ENDPOINT = '/mcp'
const PAID_TOOL_NAME = 'paid_tool'
const MPP_MCP_AMOUNT = '0.01'
const MPP_MCP_DESCRIPTION = 'Access to paid MPP MCP protocol debug content'
const MPP_MCP_SUPPORTED_PROFILES = ['usdc-eip3009'] as const satisfies readonly PaymentProfile[]
const EIP3009_ABI = parseAbi([
    'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature)',
])

type MppMcpPaymentProfile = typeof MPP_MCP_SUPPORTED_PROFILES[number]
type MppxEvmChargeMethod = ReturnType<typeof mppxServerEvm.charge>

function assertMppMcpPaymentProfile(
    profile: PaymentProfile,
): asserts profile is MppMcpPaymentProfile {
    if (profile !== 'usdc-eip3009') {
        throw new Error('Protocol mpp server mcp supports profile usdc-eip3009 only')
    }
}

function printMppMcpTransportNote() {
    console.log('(MPP MCP payment data is encoded in JSON-RPC errors and _meta, not HTTP headers)')
}

function getMppMcpResponseTitleSuffix(request: Request, response: Response): string | undefined {
    const acceptsEventStream = request.headers.get('accept') === 'text/event-stream'

    if (request.method === 'GET' && acceptsEventStream && response.status === 405) {
        return '（Server does not support text/event-stream）'
    }

    return undefined
}

function createMppMcpTraceFetch(port: number): typeof fetch {
    return createHttpTraceFetch({
        requestTitlePrefix: 'MCP',
        responseTitlePrefix: 'MCP',
        requestColor: 'green',
        responseColor: 'cyan',
        shouldTraceRequest: (request) => {
            const url = new URL(request.url)
            return url.origin === `http://localhost:${port}` && url.pathname === MCP_ENDPOINT
        },
        getResponseTitleSuffix: getMppMcpResponseTitleSuffix,
        printDecodedRequestHeaders: printMppMcpTransportNote,
        printDecodedResponseHeaders: printMppMcpTransportNote,
    })
}

function stripMppxHttpTransport(method: MppxEvmChargeMethod): Omit<MppxEvmChargeMethod, 'transport'> {
    const { transport: _httpTransport, ...mcpMethod } = method
    return mcpMethod
}

function createMppMcpPaymentServer() {
    const secretKey = requiredEnv('MPP_SECRET_KEY')
    const recipient = requiredEnv('MPP_SERVER_ADDRESS') as `0x${string}`
    const submitterPrivateKey = requiredEnv('MPP_SERVER_PRIVATE_KEY') as `0x${string}`
    const account = privateKeyToAccount(submitterPrivateKey)
    const rpcUrl = requiredEnv('MPP_EVM_RPC_URL')
    const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) })
    const walletClient = createWalletClient({ chain: baseSepolia, transport: http(rpcUrl), account })

    const payment = MppxServer.create({
        secretKey,
        methods: [
            stripMppxHttpTransport(mppxServerEvm.charge({
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
            })),
        ],
        transport: mppxServerTransport.mcpSdk(),
    })

    payment.onChallengeCreated(async ({ challenge }) => {
        await printBlock(
            'MPP MCP SERVER PAYMENT CHALLENGE',
            [
                {
                    title: 'CHALLENGE',
                    print: () => {
                        printJson(challenge)
                    },
                },
            ],
            'yellow',
        )
    })
    payment.onPaymentFailed(async ({ error }) => {
        await printBlock(
            'MPP MCP SERVER PAYMENT FAILED',
            [
                {
                    title: 'ERROR',
                    print: () => {
                        console.log(error)
                    },
                },
            ],
            'red',
        )
    })
    payment.onPaymentSuccess(async ({ receipt }) => {
        await printBlock(
            'MPP MCP SERVER PAYMENT SUCCESS',
            [
                {
                    title: 'RECEIPT',
                    print: () => {
                        printJson(receipt)
                    },
                },
            ],
            'cyan',
        )
    })

    return payment
}

function createMppMcpPaymentClient() {
    const baseAccount = privateKeyToAccount(
        requiredEnv('MPP_CLIENT_PRIVATE_KEY') as `0x${string}`,
    )
    const account = withEip712Logging(baseAccount)

    return mppxClientEvm.charge({
        account,
        currencies: [mppxClientEvm.assets.baseSepolia.USDC],
        networks: [mppxClientEvm.chains.baseSepolia],
    })
}

export function createMppMcpClientPair(
    sdkClient: Client,
    paymentMethod: ReturnType<typeof createMppMcpPaymentClient>,
    onPaymentRequired: (challenge: unknown) => void | Promise<void> = printPaymentRequired,
) {
    return {
        sdkClient,
        paymentClient: MppxMcpClient.wrap(sdkClient, {
            methods: [paymentMethod],
            onPaymentRequired: async (challenge) => {
                await onPaymentRequired(challenge)
                return true
            },
        }),
    }
}

async function createPaidMppMcpServer() {
    const mcpServer = new McpServer({
        name: 'mpp-mcp-debug',
        version: '1.0.0',
    })
    const payment = createMppMcpPaymentServer()

    mcpServer.registerTool(
        PAID_TOOL_NAME,
        {
            description: 'Paid MPP MCP protocol debug tool',
        },
        async (extra) => {
            const result = await payment.charge({
                amount: MPP_MCP_AMOUNT,
                description: MPP_MCP_DESCRIPTION,
            })(extra)

            if (result.status === 402) throw result.challenge

            return result.withReceipt({
                content: [
                    {
                        type: 'text',
                        text: stringifyJson({
                            data: 'paid MPP MCP protocol debug content',
                        }),
                    },
                ],
            })
        },
    )

    return mcpServer
}

async function createMppMcpApp() {
    const app = express()
    app.use(express.json())

    const transports = new Map<string, StreamableHTTPServerTransport>()

    const handleMcpRequest = async (req: ExpressRequest, res: ExpressResponse) => {
        try {
            const header = req.headers['mcp-session-id']
            const sessionId = Array.isArray(header) ? header[0] : header
            let transport: StreamableHTTPServerTransport

            if (sessionId && transports.has(sessionId)) {
                transport = transports.get(sessionId) as StreamableHTTPServerTransport
            } else if (!sessionId && isInitializeRequest(req.body)) {
                let initializedSessionId: string | undefined

                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    enableJsonResponse: true,
                    onsessioninitialized: (newSessionId) => {
                        initializedSessionId = newSessionId
                        transports.set(newSessionId, transport)
                    },
                })
                transport.onclose = () => {
                    if (initializedSessionId !== undefined) {
                        transports.delete(initializedSessionId)
                    }
                }

                const mcpServer = await createPaidMppMcpServer()
                await mcpServer.connect(
                    transport as unknown as Parameters<typeof mcpServer.connect>[0],
                )
            } else {
                res.status(400).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32000,
                        message: 'Bad Request: No valid MCP session ID provided',
                    },
                    id: null,
                })
                return
            }

            await transport.handleRequest(req, res, req.body)
        } catch (error) {
            console.error('Error handling MCP request:')
            console.error(error)

            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: 'Internal server error',
                    },
                    id: null,
                })
            }
        }
    }

    app.post(MCP_ENDPOINT, handleMcpRequest)
    app.delete(MCP_ENDPOINT, handleMcpRequest)

    app.get(MCP_ENDPOINT, (_req, res) => {
        res.status(405).set('Allow', 'POST').send('Method Not Allowed')
    })

    app.get('/health', (_req, res) => {
        res.json({
            ok: true,
            protocol: 'mpp',
            server: 'mcp',
            transport: 'streamable-http',
            contentType: 'application/json',
            profiles: MPP_MCP_SUPPORTED_PROFILES,
            tools: [PAID_TOOL_NAME],
        })
    })

    return app
}

async function printPaymentRequired(challenge: unknown) {
    await printBlock(
        'MPP MCP CLIENT PAYMENT REQUIRED',
        [
            {
                title: 'CHALLENGE',
                print: () => {
                    printJson(challenge)
                },
            },
        ],
        'yellow',
    )
}

async function runMppMcpClient(port: number) {
    const nativeFetch = globalThis.fetch
    const mcpClient = new Client({
        name: 'mpp-mcp-debug-client',
        version: '1.0.0',
    })
    const { sdkClient, paymentClient } = createMppMcpClientPair(
        mcpClient,
        createMppMcpPaymentClient(),
    )

    globalThis.fetch = createMppMcpTraceFetch(port)
    let connected = false

    try {
        const transport = new StreamableHTTPClientTransport(
            new URL(`http://localhost:${port}${MCP_ENDPOINT}`),
        )

        await sdkClient.connect(transport as unknown as Parameters<typeof sdkClient.connect>[0])
        connected = true

        await sdkClient.listTools()

        const result = await paymentClient.callTool(
            { name: PAID_TOOL_NAME, arguments: {} },
            { timeout: 120_000 },
        )

        await printBlock(
            'FINAL MCP RESPONSE',
            [
                {
                    title: 'PAYMENT RECEIPT',
                    print: () => {
                        printJson(result.receipt)
                    },
                },
                {
                    title: 'TOOL RESULT',
                    print: () => {
                        printJson({
                            content: result.content,
                            isError: result.isError,
                        })
                    },
                },
            ],
            'cyan',
        )
    } finally {
        try {
            if (connected) await sdkClient.close()
        } finally {
            globalThis.fetch = nativeFetch
        }
    }
}

export async function runMppMcp(profile: PaymentProfile, port: number) {
    assertMppMcpPaymentProfile(profile)

    await printBlock(
        'PAYMENT DEBUG SELECTION',
        [
            {
                title: 'OPTIONS',
                print: () => {
                    printJson({
                        mode: 'run',
                        protocol: 'mpp',
                        server: 'mcp',
                        profile,
                        port,
                    })
                },
            },
        ],
        'magenta',
        `[EIP-3009 generated using ${styleText('underline', 'mppx')}, MCP payment wrapper using ${styleText('underline', 'mppx/mcp-sdk')}]`,
    )

    const server = await listen(await createMppMcpApp(), port, 'MPP MCP debug server')

    try {
        await runMppMcpClient(port)
    } finally {
        await closeServer(server)
    }
}

export async function serveMppMcp(port: number) {
    await printBlock(
        'PAYMENT DEBUG SELECTION',
        [
            {
                title: 'OPTIONS',
                print: () => {
                    printJson({
                        mode: 'server',
                        protocol: 'mpp',
                        server: 'mcp',
                        profiles: MPP_MCP_SUPPORTED_PROFILES,
                        port,
                    })
                },
            },
        ],
        'magenta',
        `[EIP-3009 generated using ${styleText('underline', 'mppx')}, MCP payment wrapper using ${styleText('underline', 'mppx/mcp-sdk')}]`,
    )

    await listen(await createMppMcpApp(), port, 'MPP MCP debug server')
}
