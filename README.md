# payment-protocol-debug

Single-entry Bun/TypeScript tool for printing x402 and MPP payment protocol debug fields.

## Setup

```sh
bun install
cp .env.example .env
```

Fill the `.env` values with Base Sepolia wallets, RPC URLs, and server addresses.

## Run A Full Flow

```sh
bun src/payment-debug.ts --mode run --protocol x402 --profile usdc-eip3009
bun src/payment-debug.ts --mode run --protocol x402 --profile usdc-permit2
bun src/payment-debug.ts --mode run --protocol x402 --profile usdt-permit2
bun src/payment-debug.ts --mode run --protocol x402 --server mcp --profile usdc-eip3009
bun src/payment-debug.ts --mode run --protocol mpp --profile usdc-eip3009
bun src/payment-debug.ts --mode run --protocol mpp --server mcp --profile usdc-eip3009
bun src/payment-debug.ts --mode run --protocol mpp --profile usdc-permit2
bun src/payment-debug.ts --mode run --protocol mpp --profile usdt-permit2
```

`run` starts the matching local server, runs the client request, prints the decoded protocol fields, and closes the server.

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

## Supported Profiles

`x402` supports:

- `usdc-eip3009`
- `usdc-permit2`
- `usdt-permit2`

`mpp` supports:

- `usdc-eip3009`
- `usdc-permit2`
- `usdt-permit2`

`mpp --server mcp` supports:

- `usdc-eip3009`
