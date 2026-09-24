# payment-protocol-debug

Single-entry Bun/TypeScript tool for printing x402 and MPP payment protocol debug fields.

## Setup

```sh
bun install
cp .env.example .env
```

Fill the `.env` values with the EVM and/or Solana wallets, RPC URLs, token addresses/mints, and server addresses required by the profiles you want to run. EVM x402 settings are grouped by chain (`X402_EVM_BASE_SEPOLIA_*`, `X402_EVM_ARBITRUM_SEPOLIA_*`, `X402_EVM_OP_SEPOLIA_*`) and selected with `--chain`. Each EVM chain has its own `*_FACILITATOR_URL` and optional `*_FACILITATOR_API_KEY`; selecting a chain switches the facilitator together with the network, RPC, and token addresses.

## Run A Full Flow

```sh
bun src/payment-debug.ts --mode run --protocol x402 --chain base-sepolia --profile usdc-eip3009
bun src/payment-debug.ts --mode run --protocol x402 --chain base-sepolia --profile usdc-permit2
bun src/payment-debug.ts --mode run --protocol x402 --chain base-sepolia --profile usdc-permit2-approve
bun src/payment-debug.ts --mode run --protocol x402 --chain base-sepolia --profile usdt-permit2-approve
bun src/payment-debug.ts --mode run --protocol x402 --chain base-sepolia --profile usdt-permit2
bun src/payment-debug.ts --mode run --protocol x402 --chain arbitrum-sepolia --profile usdt-permit2
bun src/payment-debug.ts --mode run --protocol x402 --chain op-sepolia --profile usdt-permit2
bun src/payment-debug.ts --mode run --protocol x402 --profile usdc-transfer-checked
bun src/payment-debug.ts --mode run --protocol x402 --profile usdt-transfer-checked
bun src/payment-debug.ts --mode run --protocol x402 --server mcp --chain base-sepolia --profile usdc-eip3009
bun src/payment-debug.ts --mode run --protocol mpp --profile usdc-eip3009
bun src/payment-debug.ts --mode run --protocol mpp --server mcp --profile usdc-eip3009
bun src/payment-debug.ts --mode run --protocol mpp --profile usdc-permit2
bun src/payment-debug.ts --mode run --protocol mpp --profile usdt-permit2
```

`run` starts the matching local resource server, runs the client request, prints the decoded protocol fields, and closes the resource server. EVM x402 profiles require `--chain`; the selected chain loads its own network, RPC URL, USDC address (when configured), USDT address, and facilitator URL from `.env`. The `usdc-permit2-approve` and `usdt-permit2-approve` profiles are approve-only: they submit `approve(Permit2, MaxUint256)`, wait for the receipt, and exit without starting the x402 server or calling the facilitator. The SVM profiles use `@x402/svm` exact payments, which construct SPL Token `TransferChecked` transactions and use the facilitator as the Solana fee payer.

For OP Sepolia, start the standalone local facilitator in a second terminal before running the payment flow:

```sh
bun src/payment-debug.ts --mode facilitator --chain op-sepolia
```

or use the shortcut:

```sh
bun run facilitator
```

Pass `--port 44022` to override the default `4022` port. The launcher reads the facilitator signer from root `EVM_PRIVATE_KEY` and the OP Sepolia network/RPC from the existing `X402_EVM_OP_SEPOLIA_*` settings, then starts the standalone package in `./facilitator`.

Example USDT Permit2 test configurations:

| `--chain` | Network | USDT address | Facilitator |
| --- | --- | --- | --- |
| `base-sepolia` | `eip155:84532` | `0x4D7646B9eE3D68F4b0F135B5cbc66B00819F6b61` | `https://x402.org/facilitator` |
| `arbitrum-sepolia` | `eip155:421614` | `0xE30928528f52CAEeB75fB07837e22d77D47e9c07` | `https://facilitator.payai.network` |
| `op-sepolia` | `eip155:11155420` | `0x9ad0542c71c09b764cf58d38918892f3ae7ecc63` | `http://127.0.0.1:4022` (local) |

OP Sepolia uses the standalone EVM-only facilitator in `./facilitator`, derived from the official x402 TypeScript `facilitator/basic` example. It registers x402 v2 `exact` on `eip155:11155420`, including the Permit2 transfer path used by the custom USDT profile.

For SVM profiles, configure:

- `X402_SVM_NETWORK` with a supported Solana CAIP-2 network ID
- `X402_SVM_SERVER_ADDRESS`
- `SVM_PRIVATE_KEY` as a base58-encoded 64-byte Solana keypair
- `X402_SVM_USDC_MINT` / `X402_SVM_USDT_MINT` for the selected network

The public `https://x402.org/facilitator` currently supports x402 v2 `exact` on Solana devnet. `@x402/svm` defines the Circle devnet USDC mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`; it does not define a canonical devnet USDT mint, so `usdt-transfer-checked` requires a USDT mint and facilitator/network combination that actually supports it.

The x402 MCP flow starts a streamable HTTP MCP server at `/mcp`, lists tools without payment, then calls the paid `paid_tool`. The x402 payment challenge and payment payload are encoded in MCP JSON-RPC `_meta` fields by `@x402/mcp`.

The MPP MCP flow uses `mppx/mcp-sdk` with the same streamable HTTP MCP server shape. The server offers the paid `paid_tool`, the client receives an MPP challenge, retries with an EIP-3009 credential in MCP `_meta`, and the receipt is returned in MCP result `_meta`.

## Run Only A Server

```sh
bun src/payment-debug.ts --mode server --protocol x402 --chain base-sepolia
bun src/payment-debug.ts --mode server --protocol x402 --server mcp --chain base-sepolia
bun src/payment-debug.ts --mode server --protocol mpp
bun src/payment-debug.ts --mode server --protocol mpp --server mcp
```

Use `--port` to override the protocol port:

```sh
bun src/payment-debug.ts --mode server --protocol x402 --chain base-sepolia --port 48123
```

### Curl Commands

```sh
bun src/payment-debug.ts --mode server --protocol x402 --chain base-sepolia
curl -i http://localhost:3000/premium

bun src/payment-debug.ts --mode server --protocol x402 --server mcp --chain base-sepolia
curl -i -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl-client","version":"1.0.0"}}}'

bun src/payment-debug.ts --mode server --protocol mpp
curl -i http://localhost:3000/premium/usdc-eip3009

bun src/payment-debug.ts --mode server --protocol mpp --server mcp
curl -i -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl-client","version":"1.0.0"}}}'
```

## Supported Profiles

`x402` supports:

- `usdc-eip3009`
- `usdc-permit2`
- `usdt-permit2`
- `usdc-permit2-approve` (approve-only)
- `usdt-permit2-approve` (approve-only)
- `usdc-transfer-checked`
- `usdt-transfer-checked`

`mpp` supports:

- `usdc-eip3009`
- `usdc-permit2`
- `usdt-permit2`

`mpp --server mcp` supports:

- `usdc-eip3009`
