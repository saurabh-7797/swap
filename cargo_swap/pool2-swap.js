const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");
const {
  getAssociatedTokenAddressSync,
  getAccount,
} = require("@solana/spl-token");
const fs = require("fs");

// --- CONFIG ---
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";
const AMM_PROGRAM_ID = new PublicKey("CurLpsFfiH9GujAQu13nTjqpasTtFpRkMTZhcS6oyLwi");
const SPL_TOKEN_PROGRAM_ID = new PublicKey("G22oYgZ6LnVcy7v8eSNi2xpNk1NcZiPD8CVKSTut7oZ6");
const ATA_PROGRAM_ID = new PublicKey("GoATGVNeSXerFerPqTJ8hcED1msPWHHLxao2vwBYqowm");

// Pool 2 Details
const POOL2_PDA = new PublicKey("2Sh5TfcyCqK9rfscLExJurJv7MNkSa3XkQPJSbajD5vR");
const TOKEN_A_MINT = new PublicKey("4nUfaDDYBfBaCovmnci5hZdbBe5gazRt8SSczmeMJ51P"); // Plasma
const TOKEN_B_MINT = new PublicKey("EVA4hAVHVzqASfXpWhRrPcGo62RQ9htLY5YYMQV9bExM"); // Plasma3
const LP_MINT = new PublicKey("6nuCL6mkubETUx9jTEf98ZgDpoPHR5bNjaph91AvoR59"); // Actual created Pool 2 LP Mint
const VAULT_A = new PublicKey("DZ8tfbn8ga5hMN6rVe4vyYS6Sw4b1TJdqDP4iuTdrcdV"); // Vault A holds Token A (Plasma)
const VAULT_B = new PublicKey("621oj66u1ZdWY4FgF3EBxJE8ZbzpRDdtkSpcMyo26QZU"); // Vault B holds Token B (Plasma3)

const USER_KEYPAIR_PATH = "/home/saurabh/.config/solana/id.json";
const userKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(USER_KEYPAIR_PATH, "utf-8")))
);

const connection = new Connection(RPC_ENDPOINT, {
  commitment: "confirmed",
  wsEndpoint: WS_ENDPOINT,
});

// Helper function to get token balance
async function getTokenBalance(tokenAccount) {
  try {
    const account = await getAccount(connection, tokenAccount, "confirmed", SPL_TOKEN_PROGRAM_ID);
    return Number(account.amount);
  } catch (error) {
    return 0;
  }
}

// Helper function to format token amounts
function formatTokenAmount(amount, decimals = 9) {
  return (amount / Math.pow(10, decimals)).toFixed(6);
}

async function main() {
  try {
    console.log("🔄 POOL 2 - SWAP");
    console.log("=".repeat(50));
    console.log(`Pool PDA: ${POOL2_PDA.toString()}`);
    console.log(`Token A (Plasma): ${TOKEN_A_MINT.toString()}`);
    console.log(`Token B (Plasma3): ${TOKEN_B_MINT.toString()}`);
    console.log(`LP Mint: ${LP_MINT.toString()}`);
    console.log(`Vault A: ${VAULT_A.toString()}`);
    console.log(`Vault B: ${VAULT_B.toString()}`);

    // Get user token accounts
    const userTokenA = getAssociatedTokenAddressSync(TOKEN_A_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenB = getAssociatedTokenAddressSync(TOKEN_B_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);

    // Check balances before
    const balanceTokenA = await getTokenBalance(userTokenA);
    const balanceTokenB = await getTokenBalance(userTokenB);

    console.log(`\n📊 BALANCES BEFORE:`);
    console.log(`Token A (Plasma): ${formatTokenAmount(balanceTokenA)}`);
    console.log(`Token B (Plasma3): ${formatTokenAmount(balanceTokenB)}`);

    // Swap parameters
    const swapAmountIn = 500_000_000; // 0.5 tokens
    const swapDirection = "A_TO_B"; // A -> B (Plasma -> Plasma3)

    console.log(`\n🔄 SWAP DETAILS:`);
    console.log(`Direction: ${swapDirection}`);
    console.log(`Amount In: ${formatTokenAmount(swapAmountIn)} tokens`);
    console.log(`Pool Type: Stable (0.01% fee)`);

    // Calculate expected fee (0.01% for stable pool)
    const feeRate = 0.0001; // 0.01%
    const feeAmount = Math.floor(swapAmountIn * feeRate);
    const amountAfterFee = swapAmountIn - feeAmount;
    
    console.log(`Fee Rate: ${(feeRate * 100).toFixed(3)}%`);
    console.log(`Fee Amount: ${formatTokenAmount(feeAmount)} tokens`);
    console.log(`Amount After Fee: ${formatTokenAmount(amountAfterFee)} tokens`);

    // Prepare accounts for LegacySwap
    const accounts = [
      { pubkey: POOL2_PDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_A_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_B_MINT, isSigner: false, isWritable: false },
      { pubkey: VAULT_A, isSigner: false, isWritable: true },
      { pubkey: VAULT_B, isSigner: false, isWritable: true },
      { pubkey: userTokenA, isSigner: false, isWritable: true },
      { pubkey: userTokenB, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    // Instruction data for LegacySwap
    const data = Buffer.alloc(1 + 8 + 1);
    data.writeUInt8(13, 0); // LegacySwap discriminator
    data.writeBigUInt64LE(BigInt(swapAmountIn), 1);
    data.writeUInt8(1, 9); // 1 for A->B, 0 for B->A

    // Create and send transaction
    const tx = new Transaction();
    tx.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });

    console.log("\n📤 Sending Swap transaction...");
    const sig = await sendAndConfirmTransaction(connection, tx, [userKeypair], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    console.log("✅ Swap completed successfully!");
    console.log(`Transaction: ${sig}`);
    console.log(`GorbScan: https://gorbscan.com/tx/${sig}`);

    // Check balances after
    const newBalanceTokenA = await getTokenBalance(userTokenA);
    const newBalanceTokenB = await getTokenBalance(userTokenB);

    console.log(`\n📊 BALANCES AFTER:`);
    console.log(`Token A (Plasma): ${formatTokenAmount(newBalanceTokenA)} (Change: ${formatTokenAmount(newBalanceTokenA - balanceTokenA)})`);
    console.log(`Token B (Plasma3): ${formatTokenAmount(newBalanceTokenB)} (Change: ${formatTokenAmount(newBalanceTokenB - balanceTokenB)})`);

    // Calculate swap results
    const tokenAChange = newBalanceTokenA - balanceTokenA;
    const tokenBChange = newBalanceTokenB - balanceTokenB;
    
    console.log(`\n🎯 SWAP RESULTS:`);
    console.log(`Tokens Sold: ${formatTokenAmount(Math.abs(tokenAChange))} Plasma`);
    console.log(`Tokens Received: ${formatTokenAmount(tokenBChange)} Plasma3`);
    console.log(`Exchange Rate: ${(tokenBChange / Math.abs(tokenAChange)).toFixed(6)} Plasma3 per Plasma`);
    console.log(`Fee Paid: ${formatTokenAmount(feeAmount)} tokens (${(feeRate * 100).toFixed(3)}%)`);

    // Calculate price impact (simplified)
    const priceImpact = (feeAmount / swapAmountIn) * 100;
    console.log(`Price Impact: ${priceImpact.toFixed(4)}%`);

  } catch (error) {
    console.error("❌ Error performing swap in Pool 2:", error.message);
    if (error.logs) {
      console.error("Transaction logs:");
      error.logs.forEach((log, index) => {
        console.error(`  ${index + 1}: ${log}`);
      });
    }
    throw error;
  }
}

main().catch(console.error); 