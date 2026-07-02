import { format, styleText } from 'node:util'

export type Color = Parameters<typeof styleText>[0]

export function stringifyJson(value: unknown): string {
    return JSON.stringify(value, (_, val) => typeof val === 'bigint' ? val.toString() : val, 2)
}

export function printJson(value: unknown) {
    console.log(stringifyJson(value))
}

export async function printBlock(
    title: string,
    sections: Array<{
        title: string
        print: () => void | Promise<void>
    }>,
    color?: Color,
    titleSuffix?: string,
) {
    const originalLog = console.log

    if (color) {
        console.log = (...args: any[]) => {
            originalLog(styleText(color, format(...args)))
        }
    }

    try {
        if (titleSuffix) {
            console.log(`${styleText('inverse', title)} ${titleSuffix}`)
        } else {
            console.log(styleText('inverse', title))
        }

        for (const section of sections) {
            console.log('')
            console.log(styleText('underline', section.title))
            await section.print()
        }

        console.log('')
    } finally {
        if (color) console.log = originalLog
    }
}

export function parseBodyForLog(body: string): unknown {
    if (body === '') return '(empty body)'

    try {
        return JSON.parse(body)
    } catch {
        return body
    }
}

export function headersForLog(headers: Headers): Record<string, string> {
    const output: Record<string, string> = {}

    for (const [key, value] of headers) {
        output[key] = value
    }

    return output
}

export async function printRawRequest(request: Request) {
    console.log(styleText('bold', `${request.method} ${request.url}`))

    for (const [name, value] of request.headers) {
        console.log(styleText('bold', `${name}: ${value}`))
    }

    console.log('')
    console.log(styleText('underline', 'BODY'))
    printJson(parseBodyForLog(await request.clone().text()))
}

export async function printRawResponse(response: Response) {
    console.log(styleText('bold', `HTTP ${response.status} ${response.statusText}`))

    for (const [name, value] of response.headers) {
        console.log(styleText('bold', `${name}: ${value}`))
    }

    console.log('')
    console.log(styleText('underline', 'BODY'))
    printJson(parseBodyForLog(await response.clone().text()))
}
