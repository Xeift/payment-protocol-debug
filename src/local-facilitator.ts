import { fileURLToPath } from 'node:url'
import type { EvmChain } from './profiles.js'
import { requiredEnv } from './runtime.js'

const DEFAULT_FACILITATOR_PORT = 4022

export async function serveLocalX402Facilitator(
    chain: EvmChain,
    port = DEFAULT_FACILITATOR_PORT,
): Promise<void> {
    if (chain !== 'op-sepolia') {
        throw new Error('Local facilitator currently supports op-sepolia only')
    }

    const facilitatorDir = fileURLToPath(new URL('../facilitator/', import.meta.url))
    const child = Bun.spawn(['bun', 'run', 'start'], {
        cwd: facilitatorDir,
        env: {
            ...process.env,
            EVM_PRIVATE_KEY: requiredEnv('EVM_PRIVATE_KEY'),
            EVM_NETWORK: requiredEnv('X402_EVM_OP_SEPOLIA_NETWORK'),
            EVM_RPC_URL: requiredEnv('X402_EVM_OP_SEPOLIA_RPC_URL'),
            PORT: String(port),
        },
        stdin: 'inherit',
        stdout: 'inherit',
        stderr: 'inherit',
    })

    const exitCode = await child.exited
    if (exitCode !== 0) {
        throw new Error(`Local facilitator exited with code ${exitCode}`)
    }
}
