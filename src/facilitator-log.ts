import type { FacilitatorClient } from '@x402/core/server'
import type { PaymentPayload, PaymentRequirements } from '@x402/core/types'
import { printJson } from './output.js'

function buildFacilitatorRequest(
    url: string,
    endpoint: 'verify' | 'settle',
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
    hasApiKey: boolean,
) {
    return {
        method: 'POST',
        url: `${url.replace(/\/+$/, '')}/${endpoint}`,
        headers: {
            'Content-Type': 'application/json',
            ...(hasApiKey ? { 'X-API-Key': '<redacted>' } : {}),
        },
        body: {
            x402Version: paymentPayload.x402Version,
            paymentPayload,
            paymentRequirements,
        },
    }
}

export function createLoggingFacilitatorClient(
    facilitatorClient: FacilitatorClient,
    url: string,
    hasApiKey: boolean,
): FacilitatorClient {
    return {
        async verify(paymentPayload, paymentRequirements) {
            console.log('x402 facilitator verify request:')
            printJson(buildFacilitatorRequest(
                url,
                'verify',
                paymentPayload,
                paymentRequirements,
                hasApiKey,
            ), 'green')
            const response = await facilitatorClient.verify(paymentPayload, paymentRequirements)
            console.log('x402 facilitator verify response:')
            printJson(response, 'cyan')
            return response
        },
        async settle(paymentPayload, paymentRequirements) {
            console.log('x402 facilitator settle request:')
            printJson(buildFacilitatorRequest(
                url,
                'settle',
                paymentPayload,
                paymentRequirements,
                hasApiKey,
            ), 'green')
            const response = await facilitatorClient.settle(paymentPayload, paymentRequirements)
            console.log('x402 facilitator settle response:')
            printJson(response, 'cyan')
            return response
        },
        getSupported() {
            return facilitatorClient.getSupported()
        },
    }
}
