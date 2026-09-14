import { describe, expect, test } from 'bun:test'
import {
    createX402FacilitatorConfig,
    createX402RouteExtensions,
    getConfiguredX402ServerProfiles,
} from './x402-debug.js'

describe('x402 facilitator config', () => {
    test('omits auth headers when facilitator API key is not configured', () => {
        const previousUrl = process.env.X402_FACILITATOR_URL
        const previousApiKey = process.env.X402_FACILITATOR_API_KEY

        try {
            process.env.X402_FACILITATOR_URL = 'https://facilitator.example'
            delete process.env.X402_FACILITATOR_API_KEY

            const config = createX402FacilitatorConfig()
            expect(config.url).toBe('https://facilitator.example')
            expect(config.createAuthHeaders).toBeUndefined()
        } finally {
            if (previousUrl === undefined) delete process.env.X402_FACILITATOR_URL
            else process.env.X402_FACILITATOR_URL = previousUrl
            if (previousApiKey === undefined) delete process.env.X402_FACILITATOR_API_KEY
            else process.env.X402_FACILITATOR_API_KEY = previousApiKey
        }
    })

    test('adds X-API-Key auth headers for every facilitator endpoint', async () => {
        const previousUrl = process.env.X402_FACILITATOR_URL
        const previousApiKey = process.env.X402_FACILITATOR_API_KEY

        try {
            process.env.X402_FACILITATOR_URL = 'https://facilitator.example'
            process.env.X402_FACILITATOR_API_KEY = 'test-api-key'

            const config = createX402FacilitatorConfig()
            expect(await config.createAuthHeaders?.()).toEqual({
                verify: { 'X-API-Key': 'test-api-key' },
                settle: { 'X-API-Key': 'test-api-key' },
                supported: { 'X-API-Key': 'test-api-key' },
            })
        } finally {
            if (previousUrl === undefined) delete process.env.X402_FACILITATOR_URL
            else process.env.X402_FACILITATOR_URL = previousUrl
            if (previousApiKey === undefined) delete process.env.X402_FACILITATOR_API_KEY
            else process.env.X402_FACILITATOR_API_KEY = previousApiKey
        }
    })
})

describe('x402 server profiles and route extensions', () => {
    test('keeps legacy EVM server mode working without SVM env', () => {
        const previous = {
            network: process.env.X402_SVM_NETWORK,
            serverAddress: process.env.X402_SVM_SERVER_ADDRESS,
            usdcMint: process.env.X402_SVM_USDC_MINT,
            usdtMint: process.env.X402_SVM_USDT_MINT,
        }

        try {
            delete process.env.X402_SVM_NETWORK
            delete process.env.X402_SVM_SERVER_ADDRESS
            delete process.env.X402_SVM_USDC_MINT
            delete process.env.X402_SVM_USDT_MINT

            expect(getConfiguredX402ServerProfiles()).toEqual([
                'usdc-eip3009',
                'usdc-permit2',
                'usdt-permit2',
            ])
        } finally {
            if (previous.network === undefined) delete process.env.X402_SVM_NETWORK
            else process.env.X402_SVM_NETWORK = previous.network
            if (previous.serverAddress === undefined) delete process.env.X402_SVM_SERVER_ADDRESS
            else process.env.X402_SVM_SERVER_ADDRESS = previous.serverAddress
            if (previous.usdcMint === undefined) delete process.env.X402_SVM_USDC_MINT
            else process.env.X402_SVM_USDC_MINT = previous.usdcMint
            if (previous.usdtMint === undefined) delete process.env.X402_SVM_USDT_MINT
            else process.env.X402_SVM_USDT_MINT = previous.usdtMint
        }
    })

    test('enables only SVM server profiles whose mint config is present', () => {
        const previous = {
            network: process.env.X402_SVM_NETWORK,
            serverAddress: process.env.X402_SVM_SERVER_ADDRESS,
            usdcMint: process.env.X402_SVM_USDC_MINT,
            usdtMint: process.env.X402_SVM_USDT_MINT,
        }

        try {
            process.env.X402_SVM_NETWORK = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'
            process.env.X402_SVM_SERVER_ADDRESS = '11111111111111111111111111111111'
            process.env.X402_SVM_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
            delete process.env.X402_SVM_USDT_MINT

            expect(getConfiguredX402ServerProfiles()).toEqual([
                'usdc-eip3009',
                'usdc-permit2',
                'usdt-permit2',
                'usdc-transfer-checked',
            ])
        } finally {
            if (previous.network === undefined) delete process.env.X402_SVM_NETWORK
            else process.env.X402_SVM_NETWORK = previous.network
            if (previous.serverAddress === undefined) delete process.env.X402_SVM_SERVER_ADDRESS
            else process.env.X402_SVM_SERVER_ADDRESS = previous.serverAddress
            if (previous.usdcMint === undefined) delete process.env.X402_SVM_USDC_MINT
            else process.env.X402_SVM_USDC_MINT = previous.usdcMint
            if (previous.usdtMint === undefined) delete process.env.X402_SVM_USDT_MINT
            else process.env.X402_SVM_USDT_MINT = previous.usdtMint
        }
    })
    test('does not advertise ERC-20 approval gas sponsoring for SVM-only profiles', () => {
        expect(createX402RouteExtensions(['usdc-transfer-checked'])).toEqual({})
        expect(createX402RouteExtensions(['usdt-transfer-checked'])).toEqual({})
    })

    test('advertises ERC-20 approval gas sponsoring when an EVM profile is present', () => {
        expect(createX402RouteExtensions(['usdc-permit2'])).toHaveProperty(
            'erc20ApprovalGasSponsoring',
        )
        expect(createX402RouteExtensions(['usdc-eip3009', 'usdc-transfer-checked'])).toHaveProperty(
            'erc20ApprovalGasSponsoring',
        )
    })
})
