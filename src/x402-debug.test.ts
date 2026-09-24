import { describe, expect, test } from 'bun:test'
import type { PaymentRequirements } from '@x402/core/types'
import {
    configureX402EvmChain,
    createX402Accept,
    createX402Permit2ApprovalTx,
    createX402FacilitatorConfig,
    createX402RouteExtensions,
    getConfiguredX402ServerProfiles,
    selectX402PaymentRequirement,
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
    test('loads the selected EVM chain configuration', () => {
        const names = [
            'X402_EVM_ARBITRUM_SEPOLIA_NETWORK',
            'X402_EVM_ARBITRUM_SEPOLIA_FACILITATOR_URL',
            'X402_EVM_ARBITRUM_SEPOLIA_FACILITATOR_API_KEY',
            'X402_EVM_ARBITRUM_SEPOLIA_RPC_URL',
            'X402_EVM_ARBITRUM_SEPOLIA_USDC_ADDRESS',
            'X402_EVM_ARBITRUM_SEPOLIA_USDT_ADDRESS',
            'X402_EVM_NETWORK',
            'X402_EVM_RPC_URL',
            'X402_EVM_USDC_ADDRESS',
            'X402_EVM_USDT_ADDRESS',
            'X402_FACILITATOR_URL',
            'X402_FACILITATOR_API_KEY',
        ] as const
        const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]))

        try {
            process.env.X402_EVM_ARBITRUM_SEPOLIA_NETWORK = 'eip155:421614'
            process.env.X402_EVM_ARBITRUM_SEPOLIA_FACILITATOR_URL = 'https://facilitator.payai.network'
            process.env.X402_EVM_ARBITRUM_SEPOLIA_FACILITATOR_API_KEY = 'chain-api-key'
            process.env.X402_EVM_ARBITRUM_SEPOLIA_RPC_URL = 'https://arbitrum.example'
            delete process.env.X402_EVM_ARBITRUM_SEPOLIA_USDC_ADDRESS
            process.env.X402_EVM_ARBITRUM_SEPOLIA_USDT_ADDRESS = '0xE30928528f52CAEeB75fB07837e22d77D47e9c07'

            configureX402EvmChain('arbitrum-sepolia')

            expect(process.env.X402_EVM_NETWORK).toBe('eip155:421614')
            expect(process.env.X402_EVM_RPC_URL).toBe('https://arbitrum.example')
            expect(process.env.X402_FACILITATOR_URL).toBe('https://facilitator.payai.network')
            expect(process.env.X402_FACILITATOR_API_KEY).toBe('chain-api-key')
            expect(process.env.X402_EVM_USDC_ADDRESS).toBeUndefined()
            expect(process.env.X402_EVM_USDT_ADDRESS).toBe(
                '0xE30928528f52CAEeB75fB07837e22d77D47e9c07',
            )
        } finally {
            for (const name of names) {
                const value = previous[name]
                if (value === undefined) delete process.env[name]
                else process.env[name] = value
            }
        }
    })

    test('keeps legacy EVM server mode working without SVM env', () => {
        const previous = {
            evmNetwork: process.env.X402_EVM_NETWORK,
            evmServerAddress: process.env.X402_SERVER_ADDRESS,
            evmUsdcAddress: process.env.X402_EVM_USDC_ADDRESS,
            evmUsdtAddress: process.env.X402_EVM_USDT_ADDRESS,
            network: process.env.X402_SVM_NETWORK,
            serverAddress: process.env.X402_SVM_SERVER_ADDRESS,
            usdcMint: process.env.X402_SVM_USDC_MINT,
            usdtMint: process.env.X402_SVM_USDT_MINT,
        }

        try {
            process.env.X402_EVM_NETWORK = 'eip155:84532'
            process.env.X402_SERVER_ADDRESS = '0x0000000000000000000000000000000000000001'
            process.env.X402_EVM_USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
            process.env.X402_EVM_USDT_ADDRESS = '0x4D7646B9eE3D68F4b0F135B5cbc66B00819F6b61'
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
            if (previous.evmNetwork === undefined) delete process.env.X402_EVM_NETWORK
            else process.env.X402_EVM_NETWORK = previous.evmNetwork
            if (previous.evmServerAddress === undefined) delete process.env.X402_SERVER_ADDRESS
            else process.env.X402_SERVER_ADDRESS = previous.evmServerAddress
            if (previous.evmUsdcAddress === undefined) delete process.env.X402_EVM_USDC_ADDRESS
            else process.env.X402_EVM_USDC_ADDRESS = previous.evmUsdcAddress
            if (previous.evmUsdtAddress === undefined) delete process.env.X402_EVM_USDT_ADDRESS
            else process.env.X402_EVM_USDT_ADDRESS = previous.evmUsdtAddress
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
            evmNetwork: process.env.X402_EVM_NETWORK,
            evmServerAddress: process.env.X402_SERVER_ADDRESS,
            evmUsdcAddress: process.env.X402_EVM_USDC_ADDRESS,
            evmUsdtAddress: process.env.X402_EVM_USDT_ADDRESS,
            network: process.env.X402_SVM_NETWORK,
            serverAddress: process.env.X402_SVM_SERVER_ADDRESS,
            usdcMint: process.env.X402_SVM_USDC_MINT,
            usdtMint: process.env.X402_SVM_USDT_MINT,
        }

        try {
            delete process.env.X402_EVM_NETWORK
            delete process.env.X402_SERVER_ADDRESS
            delete process.env.X402_EVM_USDC_ADDRESS
            delete process.env.X402_EVM_USDT_ADDRESS
            process.env.X402_SVM_NETWORK = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'
            process.env.X402_SVM_SERVER_ADDRESS = '11111111111111111111111111111111'
            process.env.X402_SVM_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
            delete process.env.X402_SVM_USDT_MINT

            expect(getConfiguredX402ServerProfiles()).toEqual([
                'usdc-transfer-checked',
            ])
        } finally {
            if (previous.evmNetwork === undefined) delete process.env.X402_EVM_NETWORK
            else process.env.X402_EVM_NETWORK = previous.evmNetwork
            if (previous.evmServerAddress === undefined) delete process.env.X402_SERVER_ADDRESS
            else process.env.X402_SERVER_ADDRESS = previous.evmServerAddress
            if (previous.evmUsdcAddress === undefined) delete process.env.X402_EVM_USDC_ADDRESS
            else process.env.X402_EVM_USDC_ADDRESS = previous.evmUsdcAddress
            if (previous.evmUsdtAddress === undefined) delete process.env.X402_EVM_USDT_ADDRESS
            else process.env.X402_EVM_USDT_ADDRESS = previous.evmUsdtAddress
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
    test('builds a Permit2 approve-only transaction for the configured token', () => {
        const previous = process.env.X402_EVM_USDT_ADDRESS

        try {
            process.env.X402_EVM_USDT_ADDRESS = '0xE30928528f52CAEeB75fB07837e22d77D47e9c07'

            const approval = createX402Permit2ApprovalTx('usdt-permit2-approve')
            expect(approval.asset).toBe('0xE30928528f52CAEeB75fB07837e22d77D47e9c07')
            expect(approval.to).toBe('0xE30928528f52CAEeB75fB07837e22d77D47e9c07')
            expect(approval.data.slice(0, 10)).toBe('0x095ea7b3')
            expect(approval.data.toLowerCase()).toContain(
                '000000000000000000000000000000000022d473030f116ddee9f6b43ac78ba3',
            )
        } finally {
            if (previous === undefined) delete process.env.X402_EVM_USDT_ADDRESS
            else process.env.X402_EVM_USDT_ADDRESS = previous
        }
    })

    test('uses the configured EVM network and USDT address for Permit2', () => {
        const previous = {
            network: process.env.X402_EVM_NETWORK,
            serverAddress: process.env.X402_SERVER_ADDRESS,
            usdtAddress: process.env.X402_EVM_USDT_ADDRESS,
        }

        try {
            process.env.X402_EVM_NETWORK = 'eip155:421614'
            process.env.X402_SERVER_ADDRESS = '0x0000000000000000000000000000000000000001'
            process.env.X402_EVM_USDT_ADDRESS = '0xE30928528f52CAEeB75fB07837e22d77D47e9c07'

            const accept = createX402Accept('usdt-permit2')
            expect(accept.network).toBe('eip155:421614')
            expect(accept.price).toEqual({
                asset: '0xE30928528f52CAEeB75fB07837e22d77D47e9c07',
                amount: '10000',
                extra: { assetTransferMethod: 'permit2' },
            })

            const requirement: PaymentRequirements = {
                scheme: 'exact',
                network: 'eip155:421614',
                asset: '0xE30928528f52CAEeB75fB07837e22d77D47e9c07',
                amount: '10000',
                payTo: '0x0000000000000000000000000000000000000001',
                maxTimeoutSeconds: 60,
                extra: { assetTransferMethod: 'permit2' },
            }
            expect(selectX402PaymentRequirement('usdt-permit2', [requirement]))
                .toBe(requirement)
        } finally {
            if (previous.network === undefined) delete process.env.X402_EVM_NETWORK
            else process.env.X402_EVM_NETWORK = previous.network
            if (previous.serverAddress === undefined) delete process.env.X402_SERVER_ADDRESS
            else process.env.X402_SERVER_ADDRESS = previous.serverAddress
            if (previous.usdtAddress === undefined) delete process.env.X402_EVM_USDT_ADDRESS
            else process.env.X402_EVM_USDT_ADDRESS = previous.usdtAddress
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
