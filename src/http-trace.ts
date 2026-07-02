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
    printDecodedRequestHeaders: (headers: Headers) => void
    printDecodedResponseHeaders: (response: Response) => void
}

export function createHttpTraceFetch(config: HttpTraceConfig): typeof fetch {
    const nativeFetch = globalThis.fetch
    let requestCounter = 0

    const tracedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const requestId = ++requestCounter
        const request = new Request(input, init)

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
        )

        return response
    }

    tracedFetch.preconnect = globalThis.fetch.preconnect.bind(globalThis.fetch)
    return tracedFetch
}
