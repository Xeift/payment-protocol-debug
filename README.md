# payment-protocol-debug

Single-entry Bun/TypeScript tool for printing x402 and MPP payment protocol debug fields.

## Setup

```sh
bun install
cp .env.example .env
```

Fill the `.env` values with the Base Sepolia and/or Solana wallets, RPC URLs, token mints, and server addresses required by the profiles you want to run. `X402_FACILITATOR_API_KEY` is optional; when set, x402 facilitator requests to `/supported`, `/verify`, and `/settle` include it as the `X-API-Key` header.

## Run A Full Flow

```sh
bun src/payment-debug.ts --mode run --protocol x402 --profile usdc-eip3009
bun src/payment-debug.ts --mode run --protocol x402 --profile usdc-permit2
bun src/payment-debug.ts --mode run --protocol x402 --profile usdt-permit2
bun src/payment-debug.ts --mode run --protocol x402 --profile usdc-transfer-checked
bun src/payment-debug.ts --mode run --protocol x402 --profile usdt-transfer-checked
bun src/payment-debug.ts --mode run --protocol x402 --server mcp --profile usdc-eip3009
bun src/payment-debug.ts --mode run --protocol mpp --profile usdc-eip3009
bun src/payment-debug.ts --mode run --protocol mpp --server mcp --profile usdc-eip3009
bun src/payment-debug.ts --mode run --protocol mpp --profile usdc-permit2
bun src/payment-debug.ts --mode run --protocol mpp --profile usdt-permit2
```

`run` starts the matching local server, runs the client request, prints the decoded protocol fields, and closes the server. The SVM profiles use `@x402/svm` exact payments, which construct SPL Token `TransferChecked` transactions and use the facilitator as the Solana fee payer.

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
bun src/payment-debug.ts --mode server --protocol x402
bun src/payment-debug.ts --mode server --protocol x402 --server mcp
bun src/payment-debug.ts --mode server --protocol mpp
bun src/payment-debug.ts --mode server --protocol mpp --server mcp
```

Use `--port` to override the protocol port:

```sh
bun src/payment-debug.ts --mode server --protocol x402 --port 48123
```

### Curl Commands

```sh
bun src/payment-debug.ts --mode server --protocol x402
curl -i http://localhost:3000/premium

bun src/payment-debug.ts --mode server --protocol x402 --server mcp
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
- `usdc-transfer-checked`
- `usdt-transfer-checked`

`mpp` supports:

- `usdc-eip3009`
- `usdc-permit2`
- `usdt-permit2`

`mpp --server mcp` supports:

- `usdc-eip3009`
