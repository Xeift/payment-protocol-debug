import {
    decodePaymentRequiredHeader,
    decodePaymentResponseHeader,
    decodePaymentSignatureHeader,
} from '@x402/core/http'
import { Challenge } from 'mppx'
import { Buffer } from 'node:buffer'
import { styleText } from 'node:util'
import { parseSignature } from 'viem'
import { printJson } from './output.js'

export function base64urlToString(value: string): string {
    return Buffer.from(value, 'base64url').toString('utf8')
}

export function decodeBase64urlJson(value: string): unknown {
    return JSON.parse(base64urlToString(value))
}

export function decodeMaybeBase64urlJson(value: string): unknown {
    try {
        return decodeBase64urlJson(value)
    } catch {
        return value
    }
}

export function splitScheme(value: string): {
    scheme: string | undefined
    value: string
} {
    const trimmed = value.trim()
    const index = trimmed.indexOf(' ')

    if (index === -1) {
        return {
            scheme: undefined,
            value: trimmed,
        }
    }

    return {
        scheme: trimmed.slice(0, index),
        value: trimmed.slice(index + 1).trim(),
    }
}

function parsePaymentParams(value: string) {
    const { scheme, value: rest } = splitScheme(value)
    const params: Record<string, string> = {}
    let index = 0

    while (index < rest.length) {
        while (rest[index] === ' ' || rest[index] === ',') index++

        let key = ''
        while (index < rest.length && rest[index] !== '=') {
            key += rest[index]
            index++
        }

        key = key.trim()
        if (rest[index] !== '=') break
        index++

        let parsedValue = ''
        if (rest[index] === '"') {
            index++

            while (index < rest.length) {
                const char = rest[index]

                if (char === '\\') {
                    parsedValue += rest[index + 1] ?? ''
                    index += 2
                    continue
                }

                if (char === '"') {
                    index++
                    break
                }

                parsedValue += char
                index++
            }
        } else {
            while (index < rest.length && rest[index] !== ',') {
                parsedValue += rest[index]
                index++
            }

            parsedValue = parsedValue.trim()
        }

        if (key !== '') params[key] = parsedValue

        while (index < rest.length && rest[index] !== ',') index++
        if (rest[index] === ',') index++
    }

    return {
        scheme,
        params,
    }
}

function decodeAcceptPayment(value: string) {
    return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
}

function decodeWwwAuthenticate(value: string) {
    const parsed = parsePaymentParams(value)
    const request = parsed.params.request

    return {
        scheme: parsed.scheme,
        params: parsed.params,
        requestDecoded:
            typeof request === 'string'
                ? decodeMaybeBase64urlJson(request)
                : undefined,
    }
}

function decodeAuthorization(value: string) {
    const { scheme, value: encoded } = splitScheme(value)
    const decoded = decodeMaybeBase64urlJson(encoded)
    let requestDecoded: unknown
    let payloadDecoded: unknown
    let signatureDecoded: unknown

    if (decoded && typeof decoded === 'object') {
        if (
            'challenge' in decoded &&
            decoded.challenge &&
            typeof decoded.challenge === 'object' &&
            'request' in decoded.challenge &&
            typeof decoded.challenge.request === 'string'
        ) {
            requestDecoded = decodeMaybeBase64urlJson(decoded.challenge.request)
        }

        if (
            'payload' in decoded &&
            decoded.payload &&
            typeof decoded.payload === 'object'
        ) {
            if ('payload' in decoded.payload && typeof decoded.payload.payload === 'string') {
                payloadDecoded = decodeMaybeBase64urlJson(decoded.payload.payload)
            }

            if ('signature' in decoded.payload && typeof decoded.payload.signature === 'string') {
                signatureDecoded = parseSignature(decoded.payload.signature as `0x${string}`)
            }
        }
    }

    return {
        scheme,
        decoded,
        requestDecoded,
        payloadDecoded,
        signatureDecoded,
    }
}

function decodePaymentReceipt(value: string) {
    const { scheme, value: encoded } = splitScheme(value)

    return {
        scheme,
        decoded: decodeMaybeBase64urlJson(encoded),
    }
}

export function printDecodedX402RequestHeaders(headers: Headers) {
    const paymentSignature = headers.get('payment-signature')

    if (paymentSignature === null) {
        console.log('(no decodable x402 request headers)')
        return
    }

    console.log('payment-signature:')
    const decoded = decodePaymentSignatureHeader(paymentSignature)
    printJson(decoded)

    const signature = decoded.payload.signature
    if (typeof signature === 'string') {
        console.log('')
        console.log(styleText('underline', 'DECODED PAYMENT-SIGNATURE SIGNATURE'))
        printJson(parseSignature(signature as `0x${string}`))
    }
}

export function printDecodedX402ResponseHeaders(headers: Headers) {
    const paymentRequired = headers.get('payment-required')
    const paymentResponse = headers.get('payment-response')
    let printed = false

    if (paymentRequired !== null) {
        printed = true
        console.log('payment-required:')
        printJson(decodePaymentRequiredHeader(paymentRequired))
    }

    if (paymentResponse !== null) {
        printed = true
        console.log('payment-response:')
        printJson(decodePaymentResponseHeader(paymentResponse))
    }

    if (!printed) {
        console.log('(no decodable x402 response headers)')
    }
}

export function printDecodedMppRequestHeaders(headers: Headers) {
    const acceptPayment = headers.get('accept-payment')
    const authorization = headers.get('authorization')
    let printed = false
    let authorizationDecoded: ReturnType<typeof decodeAuthorization> | undefined

    if (acceptPayment !== null) {
        printed = true
        console.log('accept-payment:')
        printJson(decodeAcceptPayment(acceptPayment))
    }

    if (authorization !== null) {
        printed = true
        console.log('authorization:')
        authorizationDecoded = decodeAuthorization(authorization)
        const output = typeof authorizationDecoded.decoded === 'object' && authorizationDecoded.decoded !== null
            ? { scheme: authorizationDecoded.scheme, ...authorizationDecoded.decoded }
            : { scheme: authorizationDecoded.scheme, decoded: authorizationDecoded.decoded }
        printJson(output)
    }

    if (!printed) {
        console.log('(no decodable MPP request headers)')
    }

    if (authorizationDecoded?.requestDecoded) {
        console.log('')
        console.log(styleText('underline', 'DECODED AUTHORIZATION CHALLENGE REQUEST'))
        printJson(authorizationDecoded.requestDecoded)
    }

    if (authorizationDecoded?.payloadDecoded) {
        console.log('')
        console.log(styleText('underline', 'DECODED AUTHORIZATION PAYLOAD PAYLOAD'))
        printJson(authorizationDecoded.payloadDecoded)
    }

    if (authorizationDecoded?.signatureDecoded) {
        console.log('')
        console.log(styleText('underline', 'DECODED AUTHORIZATION PAYLOAD SIGNATURE'))
        printJson(authorizationDecoded.signatureDecoded)
    }
}

export function printDecodedMppResponseHeaders(response: Response) {
    const wwwAuthenticate = response.headers.get('www-authenticate')
    const paymentReceipt = response.headers.get('payment-receipt')
    let printed = false

    if (wwwAuthenticate !== null) {
        printed = true
        console.log('www-authenticate:')
        try {
            printJson(Challenge.fromResponseList(response))
        } catch {
            const decoded = decodeWwwAuthenticate(wwwAuthenticate)
            printJson({ scheme: decoded.scheme, ...decoded.params })

            if (decoded.requestDecoded) {
                console.log('')
                console.log(styleText('underline', 'DECODED WWW-AUTHENTICATE REQUEST'))
                printJson(decoded.requestDecoded)
            }
        }
    }

    if (paymentReceipt !== null) {
        printed = true
        console.log('payment-receipt:')
        printJson(decodePaymentReceipt(paymentReceipt))
    }

    if (!printed) {
        console.log('(no decodable MPP response headers)')
    }
}
