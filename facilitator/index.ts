/**
 * Standalone EVM-only x402 facilitator.
 *
 * Based on the official x402 TypeScript facilitator/basic example:
 * https://github.com/x402-foundation/x402/tree/main/examples/typescript/facilitator/basic
 *
 * Local changes:
 * - SVM support removed.
 * - Standalone npm dependencies instead of workspace:* packages.
 * - Network fixed to Optimism Sepolia for the local Permit2 test flow.
 */

import { x402Facilitator } from "@x402/core/facilitator";
import {
  type PaymentPayload,
  type PaymentRequirements,
  type SettleResponse,
  type VerifyResponse,
} from "@x402/core/types";
import { toFacilitatorEvmSigner } from "@x402/evm";
import { ExactEvmScheme } from "@x402/evm/exact/facilitator";
import dotenv from "dotenv";
import express from "express";
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { optimismSepolia } from "viem/chains";

dotenv.config();

const PORT = process.env.PORT || "4022";
const EVM_NETWORK = process.env.EVM_NETWORK || "eip155:11155420";
const EVM_RPC_URL = process.env.EVM_RPC_URL;
const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}` | undefined;

if (!evmPrivateKey) {
  console.error("❌ EVM_PRIVATE_KEY environment variable is required");
  process.exit(1);
}

if (!EVM_RPC_URL) {
  console.error("❌ EVM_RPC_URL environment variable is required");
  process.exit(1);
}

if (EVM_NETWORK !== "eip155:11155420") {
  console.error(
    `❌ This local facilitator is configured for OP Sepolia only; got ${EVM_NETWORK}`,
  );
  process.exit(1);
}

const evmAccount = privateKeyToAccount(evmPrivateKey);
console.info(`EVM Facilitator account: ${evmAccount.address}`);
console.info(`EVM Network: ${EVM_NETWORK}`);

const viemClient = createWalletClient({
  account: evmAccount,
  chain: optimismSepolia,
  transport: http(EVM_RPC_URL),
}).extend(publicActions);

const evmSigner = toFacilitatorEvmSigner({
  getCode: (args: { address: `0x${string}` }) => viemClient.getCode(args),
  address: evmAccount.address,
  readContract: (args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }) =>
    viemClient.readContract({
      ...args,
      args: args.args || [],
    }),
  verifyTypedData: (args: {
    address: `0x${string}`;
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    message: Record<string, unknown>;
    signature: `0x${string}`;
  }) => viemClient.verifyTypedData(args as never),
  writeContract: (args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args: readonly unknown[];
  }) =>
    viemClient.writeContract({
      ...args,
      args: args.args || [],
    } as never),
  sendTransaction: (args: { to: `0x${string}`; data: `0x${string}` }) =>
    viemClient.sendTransaction(args),
  waitForTransactionReceipt: (args: { hash: `0x${string}` }) =>
    viemClient.waitForTransactionReceipt(args),
});

const facilitator = new x402Facilitator()
  .onBeforeVerify(async (context) => {
    console.log("Before verify", context);
  })
  .onAfterVerify(async (context) => {
    console.log("After verify", context);
  })
  .onVerifyFailure(async (context) => {
    console.log("Verify failure", context);
  })
  .onBeforeSettle(async (context) => {
    console.log("Before settle", context);
  })
  .onAfterSettle(async (context) => {
    console.log("After settle", context);
  })
  .onSettleFailure(async (context) => {
    console.log("Settle failure", context);
  });

facilitator.register(
  EVM_NETWORK,
  new ExactEvmScheme(evmSigner, {
    eip6492AllowedFactories: [],
  }),
);

const app = express();
app.use(express.json());

app.post("/verify", async (req, res) => {
  const endpointT0 = performance.now();
  try {
    const { paymentPayload, paymentRequirements } = req.body as {
      paymentPayload: PaymentPayload;
      paymentRequirements: PaymentRequirements;
    };

    if (!paymentPayload || !paymentRequirements) {
      return res.status(400).json({
        error: "Missing paymentPayload or paymentRequirements",
      });
    }

    const response: VerifyResponse = await facilitator.verify(
      paymentPayload,
      paymentRequirements,
    );

    res.json(response);
  } catch (error) {
    console.error("Verify error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    console.log(
      `/verify completed in ${((performance.now() - endpointT0) / 1000).toFixed(3)}s`,
    );
  }
});

app.post("/settle", async (req, res) => {
  const endpointT0 = performance.now();
  try {
    const { paymentPayload, paymentRequirements } = req.body as {
      paymentPayload: PaymentPayload;
      paymentRequirements: PaymentRequirements;
    };

    if (!paymentPayload || !paymentRequirements) {
      return res.status(400).json({
        error: "Missing paymentPayload or paymentRequirements",
      });
    }

    const response: SettleResponse = await facilitator.settle(
      paymentPayload,
      paymentRequirements,
    );

    res.json(response);
  } catch (error) {
    console.error("Settle error:", error);

    if (
      error instanceof Error &&
      error.message.includes("Settlement aborted:")
    ) {
      return res.json({
        success: false,
        errorReason: error.message.replace("Settlement aborted: ", ""),
        network: req.body?.paymentPayload?.accepted?.network || "unknown",
        transaction: "",
      } as SettleResponse);
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    console.log(
      `/settle completed in ${((performance.now() - endpointT0) / 1000).toFixed(3)}s`,
    );
  }
});

app.get("/supported", (_req, res) => {
  try {
    res.json(facilitator.getSupported());
  } catch (error) {
    console.error("Supported error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.listen(Number.parseInt(PORT, 10), () => {
  console.log(`🚀 Facilitator listening on http://localhost:${PORT}`);
});
