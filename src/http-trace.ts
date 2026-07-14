import {
    type Color,
    printBlock,
    printRawRequest,
    printRawResponse,
} from './output.js'

type HttpTraceConfig = {
    requestTitlePrefix: string
    responseTitlePrefix: string
    requestColor: Color
    responseColor: Color
    shouldTraceRequest?: (request: Request) => boolean
    getResponseTitleSuffix?: (request: Request, response: Response) => string | undefined
    printDecodedRequestHeaders: (headers: Headers) => void
    printDecodedResponseHeaders: (response: Response) => void
}

export function createHttpTraceFetch(config: HttpTraceConfig): typeof fetch {
    const nativeFetch = globalThis.fetch
    let requestCounter = 0

    const tracedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const request = new Request(input, init)

        if (config.shouldTraceRequest && !config.shouldTraceRequest(request)) {
            return await nativeFetch(request)
        }

        const requestId = ++requestCounter

        await printBlock(
            `${config.requestTitlePrefix} REQUEST #${requestId}`,
            [
                {
                    title: 'RAW REQUEST',
                    print: async () => {
                        await printRawRequest(request.clone())
                    },
                },
                {
                    title: 'DECODED REQUEST HEADERS',
                    print: () => {
                        config.printDecodedRequestHeaders(request.headers)
                    },
                },
            ],
            config.requestColor,
        )

        let response: Response

        try {
            response = await nativeFetch(request.clone())
        } catch (error) {
            await printBlock(
                `${config.requestTitlePrefix} REQUEST #${requestId} FETCH ERROR`,
                [
                    {
                        title: 'ERROR',
                        print: () => {
                            console.log(error)
                        },
                    },
                ],
                config.requestColor,
            )

            throw error
        }

        const responseTitleSuffix = config.getResponseTitleSuffix?.(
            request.clone(),
            response.clone(),
        )

        await printBlock(
            `${config.responseTitlePrefix} RESPONSE #${requestId}`,
            [
                {
                    title: 'RAW RESPONSE',
                    print: async () => {
                        await printRawResponse(response.clone())
                    },
                },
                {
                    title: 'DECODED RESPONSE HEADERS',
                    print: () => {
                        config.printDecodedResponseHeaders(response.clone())
                    },
                },
            ],
            config.responseColor,
            responseTitleSuffix,
        )

        return response
    }

    tracedFetch.preconnect = globalThis.fetch.preconnect.bind(globalThis.fetch)
    return tracedFetch
}
