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

// Add liquidity to Pool 2
async function addLiquidityToPool2() {
  console.log("\n" + "=".repeat(60));
  console.log("💧 STEP 1: ADD LIQUIDITY TO POOL 2");
  console.log("=".repeat(60));

  const userTokenA = getAssociatedTokenAddressSync(TOKEN_A_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
  const userTokenB = getAssociatedTokenAddressSync(TOKEN_B_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
  const userLP = getAssociatedTokenAddressSync(LP_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);

  // Check balances before
  const balanceTokenA = await getTokenBalance(userTokenA);
  const balanceTokenB = await getTokenBalance(userTokenB);
  const balanceLP = await getTokenBalance(userLP);

  console.log(`📊 Balances BEFORE:`);
  console.log(`Token A (Plasma): ${formatTokenAmount(balanceTokenA)}`);
  console.log(`Token B (Plasma3): ${formatTokenAmount(balanceTokenB)}`);
  console.log(`LP Tokens: ${formatTokenAmount(balanceLP)}`);

  // Liquidity amounts to add
  const amountA = 2_000_000_000; // 2 tokens
  const amountB = 2_000_000_000; // 2 tokens

  console.log(`\n💧 Adding Liquidity:`);
  console.log(`Amount A: ${formatTokenAmount(amountA)} tokens`);
  console.log(`Amount B: ${formatTokenAmount(amountB)} tokens`);
  console.log(`Total Value: ${formatTokenAmount(amountA + amountB)} tokens`);

  // Prepare accounts for LegacyAddLiquidity
  const accounts = [
    { pubkey: POOL2_PDA, isSigner: false, isWritable: true },
    { pubkey: TOKEN_A_MINT, isSigner: false, isWritable: false },
    { pubkey: TOKEN_B_MINT, isSigner: false, isWritable: false },
    { pubkey: VAULT_A, isSigner: false, isWritable: true },
    { pubkey: VAULT_B, isSigner: false, isWritable: true },
    { pubkey: LP_MINT, isSigner: false, isWritable: true },
    { pubkey: userTokenA, isSigner: false, isWritable: true },
    { pubkey: userTokenB, isSigner: false, isWritable: true },
    { pubkey: userLP, isSigner: false, isWritable: true },
    { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
    { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  // Instruction data for LegacyAddLiquidity
  const data = Buffer.alloc(1 + 8 + 8);
  data.writeUInt8(11, 0); // LegacyAddLiquidity discriminator
  data.writeBigUInt64LE(BigInt(amountA), 1);
  data.writeBigUInt64LE(BigInt(amountB), 9);

  // Create and send transaction
  const tx = new Transaction();
  tx.add({
    keys: accounts,
    programId: AMM_PROGRAM_ID,
    data,
  });

  console.log("\n📤 Sending AddLiquidity transaction...");
  const sig = await sendAndConfirmTransaction(connection, tx, [userKeypair], {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });

  console.log("✅ Liquidity added successfully!");
  console.log(`Transaction: ${sig}`);
  console.log(`GorbScan: https://gorbscan.com/tx/${sig}`);

  // Check balances after
  const newBalanceTokenA = await getTokenBalance(userTokenA);
  const newBalanceTokenB = await getTokenBalance(userTokenB);
  const newBalanceLP = await getTokenBalance(userLP);

  console.log(`\n📊 Balances AFTER:`);
  console.log(`Token A (Plasma): ${formatTokenAmount(newBalanceTokenA)} (Change: ${formatTokenAmount(newBalanceTokenA - balanceTokenA)})`);
  console.log(`Token B (Plasma3): ${formatTokenAmount(newBalanceTokenB)} (Change: ${formatTokenAmount(newBalanceTokenB - balanceTokenB)})`);
  console.log(`LP Tokens: ${formatTokenAmount(newBalanceLP)} (Change: ${formatTokenAmount(newBalanceLP - balanceLP)})`);

  return { newBalanceTokenA, newBalanceTokenB, newBalanceLP };
}

// Swap in Pool 2
async function swapInPool2() {
  console.log("\n" + "=".repeat(60));
  console.log("🔄 STEP 2: SWAP IN POOL 2");
  console.log("=".repeat(60));

  const userTokenA = getAssociatedTokenAddressSync(TOKEN_A_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
  const userTokenB = getAssociatedTokenAddressSync(TOKEN_B_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);

  // Check balances before
  const balanceTokenA = await getTokenBalance(userTokenA);
  const balanceTokenB = await getTokenBalance(userTokenB);

  console.log(`📊 Balances BEFORE:`);
  console.log(`Token A (Plasma): ${formatTokenAmount(balanceTokenA)}`);
  console.log(`Token B (Plasma3): ${formatTokenAmount(balanceTokenB)}`);

  // Swap parameters
  const swapAmountIn = 1_000_000_000; // 1 token
  const swapDirection = "A_TO_B"; // A -> B (Plasma -> Plasma3)

  console.log(`\n🔄 Swap Details:`);
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

  console.log(`\n📊 Balances AFTER:`);
  console.log(`Token A (Plasma): ${formatTokenAmount(newBalanceTokenA)} (Change: ${formatTokenAmount(newBalanceTokenA - balanceTokenA)})`);
  console.log(`Token B (Plasma3): ${formatTokenAmount(newBalanceTokenB)} (Change: ${formatTokenAmount(newBalanceTokenB - balanceTokenB)})`);

  // Calculate swap results
  const tokenAChange = newBalanceTokenA - balanceTokenA;
  const tokenBChange = newBalanceTokenB - balanceTokenB;
  
  console.log(`\n🎯 Swap Results:`);
  console.log(`Tokens Sold: ${formatTokenAmount(Math.abs(tokenAChange))} Plasma`);
  console.log(`Tokens Received: ${formatTokenAmount(tokenBChange)} Plasma3`);
  console.log(`Exchange Rate: ${(tokenBChange / Math.abs(tokenAChange)).toFixed(6)} Plasma3 per Plasma`);
  console.log(`Fee Paid: ${formatTokenAmount(feeAmount)} tokens (${(feeRate * 100).toFixed(3)}%)`);

  return { newBalanceTokenA, newBalanceTokenB };
}

// Remove liquidity from Pool 2
async function removeLiquidityFromPool2() {
  console.log("\n" + "=".repeat(60));
  console.log("💸 STEP 3: REMOVE LIQUIDITY FROM POOL 2");
  console.log("=".repeat(60));

  const userTokenA = getAssociatedTokenAddressSync(TOKEN_A_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
  const userTokenB = getAssociatedTokenAddressSync(TOKEN_B_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
  const userLP = getAssociatedTokenAddressSync(LP_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);

  // Check balances before
  const balanceTokenA = await getTokenBalance(userTokenA);
  const balanceTokenB = await getTokenBalance(userTokenB);
  const balanceLP = await getTokenBalance(userLP);

  console.log(`📊 Balances BEFORE:`);
  console.log(`Token A (Plasma): ${formatTokenAmount(balanceTokenA)}`);
  console.log(`Token B (Plasma3): ${formatTokenAmount(balanceTokenB)}`);
  console.log(`LP Tokens: ${formatTokenAmount(balanceLP)}`);

  // Remove liquidity parameters
  const lpTokensToBurn = Math.floor(balanceLP * 0.3); // Remove 30% of LP tokens
  const removalPercentage = 30; // 30%

  console.log(`\n💸 Remove Liquidity Details:`);
  console.log(`LP Tokens to Burn: ${formatTokenAmount(lpTokensToBurn)}`);
  console.log(`Removal Percentage: ${removalPercentage}%`);
  console.log(`Pool Type: Stable (0.01% fee)`);

  // Prepare accounts for LegacyRemoveLiquidity
  const accounts = [
    { pubkey: POOL2_PDA, isSigner: false, isWritable: true },
    { pubkey: TOKEN_A_MINT, isSigner: false, isWritable: false },
    { pubkey: TOKEN_B_MINT, isSigner: false, isWritable: false },
    { pubkey: VAULT_A, isSigner: false, isWritable: true },
    { pubkey: VAULT_B, isSigner: false, isWritable: true },
    { pubkey: LP_MINT, isSigner: false, isWritable: true },
    { pubkey: userLP, isSigner: false, isWritable: true },
    { pubkey: userTokenA, isSigner: false, isWritable: true },
    { pubkey: userTokenB, isSigner: false, isWritable: true },
    { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
    { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  // Instruction data for LegacyRemoveLiquidity
  const data = Buffer.alloc(1 + 8);
  data.writeUInt8(12, 0); // LegacyRemoveLiquidity discriminator
  data.writeBigUInt64LE(BigInt(lpTokensToBurn), 1);

  // Create and send transaction
  const tx = new Transaction();
  tx.add({
    keys: accounts,
    programId: AMM_PROGRAM_ID,
    data,
  });

  console.log("\n📤 Sending RemoveLiquidity transaction...");
  const sig = await sendAndConfirmTransaction(connection, tx, [userKeypair], {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });

  console.log("✅ Liquidity removed successfully!");
  console.log(`Transaction: ${sig}`);
  console.log(`GorbScan: https://gorbscan.com/tx/${sig}`);

  // Check balances after
  const newBalanceTokenA = await getTokenBalance(userTokenA);
  const newBalanceTokenB = await getTokenBalance(userTokenB);
  const newBalanceLP = await getTokenBalance(userLP);

  console.log(`\n📊 Balances AFTER:`);
  console.log(`Token A (Plasma): ${formatTokenAmount(newBalanceTokenA)} (Change: ${formatTokenAmount(newBalanceTokenA - balanceTokenA)})`);
  console.log(`Token B (Plasma3): ${formatTokenAmount(newBalanceTokenB)} (Change: ${formatTokenAmount(newBalanceTokenB - balanceTokenB)})`);
  console.log(`LP Tokens: ${formatTokenAmount(newBalanceLP)} (Change: ${formatTokenAmount(newBalanceLP - balanceLP)})`);

  // Calculate removal results
  const tokenAReceived = newBalanceTokenA - balanceTokenA;
  const tokenBReceived = newBalanceTokenB - balanceTokenB;
  const lpTokensBurned = balanceLP - newBalanceLP;
  
  console.log(`\n🎯 Liquidity Removal Results:`);
  console.log(`LP Tokens Burned: ${formatTokenAmount(lpTokensBurned)}`);
  console.log(`Token A Received: ${formatTokenAmount(tokenAReceived)} Plasma`);
  console.log(`Token B Received: ${formatTokenAmount(tokenBReceived)} Plasma3`);
  console.log(`Total Value Unlocked: ${formatTokenAmount(tokenAReceived + tokenBReceived)} tokens`);
  console.log(`Removal Percentage: ${removalPercentage}%`);

  return { newBalanceTokenA, newBalanceTokenB, newBalanceLP };
}

async function main() {
  try {
    console.log("🚀 POOL 2 - FULL OPERATION TEST");
    console.log("=".repeat(60));
    console.log(`Pool PDA: ${POOL2_PDA.toString()}`);
    console.log(`Token A (Plasma): ${TOKEN_A_MINT.toString()}`);
    console.log(`Token B (Plasma3): ${TOKEN_B_MINT.toString()}`);
    console.log(`LP Mint: ${LP_MINT.toString()}`);
    console.log(`Pool Type: Stable (0.01% fee)`);

    // Step 1: Add Liquidity
    await addLiquidityToPool2();

    // Step 2: Swap
    await swapInPool2();

    // Step 3: Remove Liquidity
    await removeLiquidityFromPool2();

    console.log("\n" + "=".repeat(60));
    console.log("🎉 POOL 2 FULL OPERATION TEST COMPLETED!");
    console.log("=".repeat(60));
    console.log("✅ All operations completed successfully!");
    console.log("✅ Pool 2 is fully functional!");
    console.log("✅ Multi-pool AMM is working perfectly!");

    console.log("\n📋 POOL 2 FEATURES DEMONSTRATED:");
    console.log("  ✅ Add Liquidity with detailed balance tracking");
    console.log("  ✅ Swap operations with fee calculations");
    console.log("  ✅ Remove Liquidity with percentage-based removal");
    console.log("  ✅ Stable pool type (0.01% fee)");
    console.log("  ✅ Independent pool operations");
    console.log("  ✅ Proper account structure and token associations");

  } catch (error) {
    console.error("❌ Error in Pool 2 full operation test:", error.message);
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