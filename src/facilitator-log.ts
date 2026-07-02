import type { FacilitatorClient } from '@x402/core/server'
import type { PaymentPayload, PaymentRequirements } from '@x402/core/types'
import { stringifyJson } from './output.js'

function buildFacilitatorRequest(
    url: string,
    endpoint: 'verify' | 'settle',
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
) {
    return {
        method: 'POST',
        url: `${url.replace(/\/+$/, '')}/${endpoint}`,
        headers: {
            'Content-Type': 'application/json',
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
): FacilitatorClient {
    return {
        async verify(paymentPayload, paymentRequirements) {
            console.log('x402 facilitator verify request:')
            console.log(stringifyJson(buildFacilitatorRequest(
                url,
                'verify',
                paymentPayload,
                paymentRequirements,
            )))
            const response = await facilitatorClient.verify(paymentPayload, paymentRequirements)
            console.log('x402 facilitator verify response:')
            console.log(stringifyJson(response))
            return response
        },
        async settle(paymentPayload, paymentRequirements) {
            console.log('x402 facilitator settle request:')
            console.log(stringifyJson(buildFacilitatorRequest(
                url,
                'settle',
                paymentPayload,
                paymentRequirements,
            )))
            const response = await facilitatorClient.settle(paymentPayload, paymentRequirements)
            console.log('x402 facilitator settle response:')
            console.log(stringifyJson(response))
            return response
        },
        getSupported() {
            return facilitatorClient.getSupported()
        },
    }
}
