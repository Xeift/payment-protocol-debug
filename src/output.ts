import { AsyncLocalStorage } from 'node:async_hooks'
import { styleText } from 'node:util'

export type Color = Parameters<typeof styleText>[0]

type Rgb = readonly [red: number, green: number, blue: number]

type JsonPalette = {
    key: Rgb
    string: Rgb
    number: Rgb
    boolean: Rgb
    null: Rgb
}

const outputColor = new AsyncLocalStorage<Color | undefined>()

const DEFAULT_JSON_PALETTE: JsonPalette = {
    key: [103, 232, 249],
    string: [134, 239, 172],
    number: [250, 204, 21],
    boolean: [232, 121, 249],
    null: [148, 163, 184],
}

const JSON_PALETTES: Partial<Record<string, JsonPalette>> = {
    green: {
        key: [110, 231, 183],
        string: [187, 247, 208],
        number: [163, 230, 53],
        boolean: [45, 212, 191],
        null: [107, 114, 128],
    },
    cyan: {
        key: [103, 232, 249],
        string: [186, 230, 253],
        number: [96, 165, 250],
        boolean: [129, 140, 248],
        null: [100, 116, 139],
    },
    red: {
        key: [248, 113, 113],
        string: [254, 202, 202],
        number: [251, 113, 133],
        boolean: [244, 63, 94],
        null: [120, 113, 108],
    },
    yellow: {
        key: [253, 224, 71],
        string: [254, 240, 138],
        number: [251, 146, 60],
        boolean: [245, 158, 11],
        null: [120, 113, 108],
    },
    blue: {
        key: [96, 165, 250],
        string: [191, 219, 254],
        number: [129, 140, 248],
        boolean: [99, 102, 241],
        null: [100, 116, 139],
    },
    magenta: {
        key: [232, 121, 249],
        string: [245, 208, 254],
        number: [244, 114, 182],
        boolean: [217, 70, 239],
        null: [113, 113, 122],
    },
}

function getPalette(color?: Color): JsonPalette {
    const styles = Array.isArray(color) ? color : color ? [color] : []
    const paletteName = styles.find((style) => style in JSON_PALETTES)
    return paletteName ? JSON_PALETTES[paletteName]! : DEFAULT_JSON_PALETTE
}

function styleRgb(rgb: Rgb, text: string): string {
    const [red, green, blue] = rgb
    return `\u001B[38;2;${red};${green};${blue}m${text}\u001B[39m`
}

function highlightJson(json: string, palette: JsonPalette): string {
    return json.replace(
        /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false)\b|\b(null)\b/g,
        (match, quoted: string | undefined, keySuffix: string | undefined, number: string | undefined, boolean: string | undefined, nullValue: string | undefined) => {
            if (quoted !== undefined) {
                const color = keySuffix === undefined ? palette.string : palette.key
                return `${styleRgb(color, quoted)}${keySuffix ?? ''}`
            }
            if (number !== undefined) return styleRgb(palette.number, number)
            if (boolean !== undefined) return styleRgb(palette.boolean, boolean)
            if (nullValue !== undefined) return styleRgb(palette.null, nullValue)
            return match
        },
    )
}

function withColor(color: Color | undefined, text: string): string {
    return color ? styleText(color, text) : text
}

export function stringifyJson(value: unknown): string {
    return JSON.stringify(value, (_, val) => typeof val === 'bigint' ? val.toString() : val, 2)
}

export function printJson(value: unknown, color?: Color) {
    const json = stringifyJson(value)
    console.log(highlightJson(json, getPalette(color ?? outputColor.getStore())))
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
    await outputColor.run(color, async () => {
        const styledTitle = withColor(color, styleText('inverse', title))

        if (titleSuffix) {
            console.log(`${styledTitle} ${titleSuffix}`)
        } else {
            console.log(styledTitle)
        }

        for (const section of sections) {
            console.log('')
            console.log(withColor(color, styleText('underline', section.title)))
            await section.print()
        }

        console.log('')
    })
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
    const color = outputColor.getStore()

    console.log(
        `${withColor(color, styleText('bold', 'HTTP'))} ${styleText('yellow', String(response.status))} ${styleText('bold', response.statusText)}`,
    )

    for (const [name, value] of response.headers) {
        console.log(`${withColor(color, styleText('bold', name))}: ${styleText('white', value)}`)
    }

    console.log('')
    console.log(styleText('underline', 'BODY'))
    printJson(parseBodyForLog(await response.clone().text()))
}
