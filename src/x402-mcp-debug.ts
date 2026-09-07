import { randomUUID } from 'node:crypto'
import { styleText } from 'node:util'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import {
    createPaymentWrapper,
    wrapMCPClientWithPayment,
    type PaymentRequestedContext,
} from '@x402/mcp'
import express, {
    type Request as ExpressRequest,
    type Response as ExpressResponse,
} from 'express'
import { createHttpTraceFetch } from './http-trace.js'
import { printBlock, printJson, stringifyJson } from './output.js'
import {
    getProtocolProfiles,
    isSvmPaymentProfile,
    type PaymentProfile,
} from './profiles.js'
import { closeServer, listen } from './server.js'
import {
    createX402Accept,
    createX402PaymentClient,
    createX402ResourceServer,
    createX402RouteExtensions,
    getConfiguredX402ServerProfiles,
} from './x402-debug.js'

const MCP_ENDPOINT = '/mcp'
const PAID_TOOL_NAME = 'paid_tool'

function printMcpX402TransportNote() {
    console.log('(x402 MCP payment data is encoded in JSON-RPC _meta, not HTTP headers)')
}

function getMcpResponseTitleSuffix(request: Request, response: Response): string | undefined {
    const acceptsEventStream = request.headers.get('accept') === 'text/event-stream'

    if (request.method === 'GET' && acceptsEventStream && response.status === 405) {
        return '（Server does not support text/event-stream）'
    }

    return undefined
}

function createMcpTraceFetch(port: number): typeof fetch {
    return createHttpTraceFetch({
        requestTitlePrefix: 'MCP',
        responseTitlePrefix: 'MCP',
        requestColor: 'green',
        responseColor: 'cyan',
        shouldTraceRequest: (request) => {
            const url = new URL(request.url)
            return url.origin === `http://localhost:${port}` && url.pathname === MCP_ENDPOINT
        },
        getResponseTitleSuffix: getMcpResponseTitleSuffix,
        printDecodedRequestHeaders: printMcpX402TransportNote,
        printDecodedResponseHeaders: printMcpX402TransportNote,
    })
}

async function createPaidMcpServer(
    profiles: readonly PaymentProfile[] = getProtocolProfiles('x402'),
) {
    const mcpServer = new McpServer({
        name: 'x402-mcp-debug',
        version: '1.0.0',
    })
    const resourceServer = createX402ResourceServer(profiles)
    await resourceServer.initialize()

    const accepts = (
        await Promise.all(profiles.map((profile) => (
            resourceServer.buildPaymentRequirements(createX402Accept(profile))
        )))
    ).flat()
    const paid = createPaymentWrapper(resourceServer, {
        accepts,
        resource: {
            url: `mcp://tool/${PAID_TOOL_NAME}`,
            description: 'Access to paid x402 MCP protocol debug content',
            mimeType: 'application/json',
        },
        extensions: createX402RouteExtensions(profiles),
        hooks: {
            onBeforeExecution: async ({ toolName, paymentPayload, paymentRequirements }) => {
                await printBlock(
                    'X402 MCP SERVER PAYMENT VERIFIED',
                    [
                        {
                            title: 'TOOL',
                            print: () => {
                                console.log(toolName)
                            },
                        },
                        {
                            title: 'PAYMENT PAYLOAD',
                            print: () => {
                                printJson(paymentPayload)
                            },
                        },
                        {
                            title: 'PAYMENT REQUIREMENTS',
                            print: () => {
                                printJson(paymentRequirements)
                            },
                        },
                    ],
                    'yellow',
                )
            },
            onAfterSettlement: async ({ settlement }) => {
                await printBlock(
                    'X402 MCP SERVER PAYMENT SETTLED',
                    [
                        {
                            title: 'SETTLEMENT',
                            print: () => {
                                printJson(settlement)
                            },
                        },
                    ],
                    'cyan',
                )
            },
        },
    })

    mcpServer.tool(
        PAID_TOOL_NAME,
        'Paid x402 MCP protocol debug tool',
        {},
        paid(async () => ({
            content: [
                {
                    type: 'text',
                    text: stringifyJson({
                        data: 'paid x402 MCP protocol debug content',
                    }),
                },
            ],
        })),
    )

    return mcpServer
}

async function createX402McpApp(
    profiles: readonly PaymentProfile[] = getProtocolProfiles('x402'),
) {
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

                const mcpServer = await createPaidMcpServer(profiles)
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
            protocol: 'x402',
            server: 'mcp',
            transport: 'streamable-http',
            contentType: 'application/json',
            profiles,
            tools: [PAID_TOOL_NAME],
        })
    })

    return app
}

async function printPaymentRequested(context: PaymentRequestedContext) {
    await printBlock(
        'X402 MCP CLIENT PAYMENT REQUIRED',
        [
            {
                title: 'TOOL',
                print: () => {
                    console.log(context.toolName)
                },
            },
            {
                title: 'PAYMENT REQUIRED',
                print: () => {
                    printJson(context.paymentRequired)
                },
            },
        ],
        'yellow',
    )
}

async function runX402McpClient(port: number, profile: PaymentProfile) {
    const nativeFetch = globalThis.fetch
    const mcpClient = new Client({
        name: 'x402-mcp-debug-client',
        version: '1.0.0',
    })
    const paymentClient = await createX402PaymentClient(profile)
    const client = wrapMCPClientWithPayment(
        mcpClient as unknown as Parameters<typeof wrapMCPClientWithPayment>[0],
        paymentClient,
        {
            autoPayment: true,
            onPaymentRequested: async (context) => {
                await printPaymentRequested(context)
                return true
            },
        },
    )

    client.onAfterPayment(async ({ paymentPayload, settleResponse }) => {
        await printBlock(
            'X402 MCP CLIENT PAYMENT SUBMITTED',
            [
                {
                    title: 'PAYMENT PAYLOAD',
                    print: () => {
                        printJson(paymentPayload)
                    },
                },
                {
                    title: 'SETTLE RESPONSE',
                    print: () => {
                        printJson(settleResponse)
                    },
                },
            ],
            'cyan',
        )
    })

    globalThis.fetch = createMcpTraceFetch(port)
    let connected = false

    try {
        const transport = new StreamableHTTPClientTransport(
            new URL(`http://localhost:${port}${MCP_ENDPOINT}`),
        )

        await client.connect(transport as unknown as Parameters<typeof client.connect>[0])
        connected = true

        await client.listTools()

        const result = await client.callTool(PAID_TOOL_NAME, {}, { timeout: 120_000 })

        await printBlock(
            'FINAL MCP RESPONSE',
            [
                {
                    title: 'PAYMENT MADE',
                    print: () => {
                        console.log(result.paymentMade)
                    },
                },
                {
                    title: 'PAYMENT RESPONSE',
                    print: () => {
                        printJson(result.paymentResponse)
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
            if (connected) await client.close()
        } finally {
            globalThis.fetch = nativeFetch
        }
    }
}

export async function runX402Mcp(profile: PaymentProfile, port: number) {
    await printBlock(
        'PAYMENT DEBUG SELECTION',
        [
            {
                title: 'OPTIONS',
                print: () => {
                    printJson({
                        mode: 'run',
                        protocol: 'x402',
                        server: 'mcp',
                        profile,
                        port,
                    })
                },
            },
        ],
        'magenta',
        isSvmPaymentProfile(profile)
            ? `[TransferChecked generated using ${styleText('underline', '@x402/svm')}, MCP payment wrapper using ${styleText('underline', '@x402/mcp')}]`
            : `[EIP/Permit2 generated using ${styleText('underline', '@x402/evm')}, MCP payment wrapper using ${styleText('underline', '@x402/mcp')}]`,
    )

    const server = await listen(await createX402McpApp([profile]), port, 'x402 MCP debug server')

    try {
        await runX402McpClient(port, profile)
    } finally {
        await closeServer(server)
    }
}

export async function serveX402Mcp(port: number) {
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
                        server: 'mcp',
                        profiles,
                        port,
                    })
                },
            },
        ],
        'magenta',
        `[EVM generated using ${styleText('underline', '@x402/evm')}, SVM TransferChecked generated using ${styleText('underline', '@x402/svm')}, MCP payment wrapper using ${styleText('underline', '@x402/mcp')}]`,
    )

    await listen(await createX402McpApp(profiles), port, 'x402 MCP debug server')
}
