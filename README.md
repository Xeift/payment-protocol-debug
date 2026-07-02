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
bun src/payment-debug.ts --mode run --protocol mpp --profile usdc-eip3009
bun src/payment-debug.ts --mode run --protocol mpp --profile usdt-permit2
```

`run` starts the matching local server, runs the client request, prints the decoded protocol fields, and closes the server.

## Run Only A Server

```sh
bun src/payment-debug.ts --mode server --protocol x402
bun src/payment-debug.ts --mode server --protocol mpp
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
- `usdt-permit2`

`mpp` with `usdc-permit2` is rejected directly.
