# Local x402 EVM Facilitator

Standalone EVM-only facilitator derived from the official x402 TypeScript `facilitator/basic` example at commit `0cb1a1f0f4c2163357e255c824d319674e1db43f`.

Changes from upstream:

- Removed all SVM/Solana code and dependencies.
- Removed `workspace:*` monorepo dependencies; `@x402/core` and `@x402/evm` are pinned to `2.27.0`.
- Configured the facilitator for Optimism Sepolia (`eip155:11155420`).
- Registers the EVM `exact` scheme, which supports `assetTransferMethod: "permit2"` for ERC-20 tokens such as the local test USDT.
- Uses Bun scripts so this directory can be installed and run independently.

## Setup

```bash
cp .env.example .env
bun install
bun run typecheck
bun run start
```

Required environment variables:

- `EVM_PRIVATE_KEY`: facilitator signer private key. It needs OP Sepolia ETH for settlement gas.
- `EVM_RPC_URL`: OP Sepolia RPC URL.
- `EVM_NETWORK`: must be `eip155:11155420`.
- `PORT`: optional; defaults to `4022`.

The facilitator exposes:

```text
GET  /supported
POST /verify
POST /settle
```

For this repository, point the OP Sepolia resource server at:

```env
X402_EVM_OP_SEPOLIA_FACILITATOR_URL=http://127.0.0.1:4022
```
