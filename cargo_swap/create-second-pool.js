const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  SYSVAR_RENT_PUBKEY,
} = require("@solana/web3.js");
const {
  getAssociatedTokenAddressSync,
  getAccount,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
} = require("@solana/spl-token");
const fs = require("fs");

// --- CONFIG ---
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";
const AMM_PROGRAM_ID = new PublicKey("CurLpsFfiH9GujAQu13nTjqpasTtFpRkMTZhcS6oyLwi");
const SPL_TOKEN_PROGRAM_ID = new PublicKey("G22oYgZ6LnVcy7v8eSNi2xpNk1NcZiPD8CVKSTut7oZ6");
const ATA_PROGRAM_ID = new PublicKey("GoATGVNeSXerFerPqTJ8hcED1msPWHHLxao2vwBYqowm");

// Token addresses
const TOKEN_A_MINT = new PublicKey("4nUfaDDYBfBaCovmnci5hZdbBe5gazRt8SSczmeMJ51P");
const TOKEN_B_MINT = new PublicKey("AtZBwYcxgP2c9KYL1iezZrf8t7bbXTssSt6Aoz3h9wbH");

// Create a third token for the second pool
const TOKEN_C_MINT = new PublicKey("EVA4hAVHVzqASfXpWhRrPcGo62RQ9htLY5YYMQV9bExM"); // Newly created Plasma3 token

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

// Multi-Pool Registry (Client-side)
class MultiPoolRegistry {
  constructor() {
    this.pools = new Map();
    this.nextPoolId = 1;
  }

  // Add existing pool to registry
  addExistingPool(poolId, poolInfo) {
    this.pools.set(poolId, poolInfo);
    if (poolId >= this.nextPoolId) {
      this.nextPoolId = poolId + 1;
    }
  }

  // Create a new pool entry
  createPool(tokenA, tokenB, poolType = "Standard") {
    const poolId = this.nextPoolId++;
    const poolInfo = {
      poolId,
      tokenA: tokenA.toString(),
      tokenB: tokenB.toString(),
      poolType,
      feeRate: poolType === "Standard" ? 30 : poolType === "Stable" ? 1 : 30, // basis points
      isActive: true,
      createdAt: Date.now(),
      poolPDA: null,
      lpMint: null,
      vaultA: null,
      vaultB: null,
      tvl: 0
    };
    
    this.pools.set(poolId, poolInfo);
    return poolInfo;
  }

  // Get pool by ID
  getPool(poolId) {
    return this.pools.get(poolId);
  }

  // List all pools
  listPools() {
    return Array.from(this.pools.values());
  }

  // Update pool info
  updatePool(poolId, updates) {
    const pool = this.pools.get(poolId);
    if (pool) {
      Object.assign(pool, updates);
    }
  }

  // Get total TVL
  getTotalTVL() {
    return Array.from(this.pools.values()).reduce((total, pool) => total + (parseFloat(pool.tvl) || 0), 0);
  }
}

// Initialize a new pool
async function initializeNewPool(registry, tokenA, tokenB, poolType = "Standard") {
  console.log(`\n🏊 Initializing New Pool ${registry.nextPoolId}...`);
  console.log(`Token A: ${tokenA.toString()}`);
  console.log(`Token B: ${tokenB.toString()}`);
  console.log(`Pool Type: ${poolType}`);

  // Create pool entry in registry
  const poolInfo = registry.createPool(tokenA, tokenB, poolType);
  
  // Derive pool PDA with unique seeds for second pool
  const [poolPDA, poolBump] = await PublicKey.findProgramAddress(
    [Buffer.from("pool"), tokenA.toBuffer(), tokenB.toBuffer()],
    AMM_PROGRAM_ID
  );

  console.log(`Pool PDA: ${poolPDA.toString()}`);

  // Prepare accounts for InitPool
  // Create vault accounts (these will be created by the contract)
  const vaultA = Keypair.generate();
  const vaultB = Keypair.generate();

  // Create LP mint keypair
  const LP_MINT = Keypair.generate();

  // Derive LP mint for the new pool
  const [lpMint, lpBump] = await PublicKey.findProgramAddress(
    [Buffer.from("lp_mint"), poolPDA.toBuffer()],
    AMM_PROGRAM_ID
  );

  const userTokenA = getAssociatedTokenAddressSync(tokenA, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
  const userTokenB = getAssociatedTokenAddressSync(tokenB, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
  const userLP = getAssociatedTokenAddressSync(LP_MINT.publicKey, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);

  // Check balances
  const balanceTokenA = await getTokenBalance(userTokenA);
  const balanceTokenB = await getTokenBalance(userTokenB);
  
  console.log(`\n📊 Balances:`);
  console.log(`Token A: ${formatTokenAmount(balanceTokenA)}`);
  console.log(`Token B: ${formatTokenAmount(balanceTokenB)}`);

  // Initial liquidity amounts
  const amountA = 500_000_000; // 0.5 tokens
  const amountB = 500_000_000; // 0.5 tokens

  // Prepare accounts for LegacyInitPool
  const accounts = [
    { pubkey: poolPDA, isSigner: false, isWritable: true },
    { pubkey: tokenA, isSigner: false, isWritable: false },
    { pubkey: tokenB, isSigner: false, isWritable: false },
    { pubkey: vaultA.publicKey, isSigner: true, isWritable: true },
    { pubkey: vaultB.publicKey, isSigner: true, isWritable: true },
    { pubkey: LP_MINT.publicKey, isSigner: false, isWritable: true },
    { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
    { pubkey: userTokenA, isSigner: false, isWritable: true },
    { pubkey: userTokenB, isSigner: false, isWritable: true },
    { pubkey: userLP, isSigner: false, isWritable: true },
    { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
  ];

  // Instruction data for LegacyInitPool
  const data = Buffer.alloc(1 + 8 + 8);
  data.writeUInt8(10, 0); // LegacyInitPool discriminator
  data.writeBigUInt64LE(BigInt(amountA), 1);
  data.writeBigUInt64LE(BigInt(amountB), 9);

  // Create and send transaction
  const tx = new Transaction();

  // Create LP mint account
  console.log("📝 Creating LP mint account...");
  tx.add(SystemProgram.createAccount({
    fromPubkey: userKeypair.publicKey,
    newAccountPubkey: LP_MINT.publicKey,
    lamports: await connection.getMinimumBalanceForRentExemption(82),
    space: 82,
    programId: SPL_TOKEN_PROGRAM_ID,
  }));

  // Initialize LP mint
  console.log("📝 Initializing LP mint...");
  tx.add(
    createInitializeMintInstruction(
      LP_MINT.publicKey,
      9, // decimals
      poolPDA, // mint authority (pool PDA)
      poolPDA, // freeze authority (pool PDA)
      SPL_TOKEN_PROGRAM_ID
    )
  );

  // Create user LP ATA if needed
  const userLPAccount = await connection.getAccountInfo(userLP);
  if (!userLPAccount) {
    console.log("📝 Creating user LP ATA...");
    tx.add(createAssociatedTokenAccountInstruction(
      userKeypair.publicKey,
      userLP,
      userKeypair.publicKey,
      LP_MINT.publicKey,
      SPL_TOKEN_PROGRAM_ID,
      ATA_PROGRAM_ID
    ));
  } else {
    console.log("✅ User LP ATA already exists");
  }

  tx.add({
    keys: accounts,
    programId: AMM_PROGRAM_ID,
    data,
  });

  console.log("📤 Sending InitPool transaction...");
  const sig = await sendAndConfirmTransaction(connection, tx, [userKeypair, vaultA, vaultB, LP_MINT], {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });

  console.log("✅ New Pool initialized successfully!");
  console.log(`Transaction: ${sig}`);
  console.log(`GorbScan: https://gorbscan.com/tx/${sig}`);

  // Update registry with pool details
  registry.updatePool(poolInfo.poolId, {
    poolPDA: poolPDA.toString(),
    lpMint: lpMint.toString(),
    vaultA: vaultA.publicKey.toString(),
    vaultB: vaultB.publicKey.toString(),
    tvl: formatTokenAmount(amountA + amountB)
  });

  return poolInfo;
}

// Add liquidity to new pool
async function addLiquidityToNewPool(registry, poolId, amountA, amountB) {
  const pool = registry.getPool(poolId);
  if (!pool) {
    throw new Error(`Pool ${poolId} not found`);
  }

  console.log(`\n💧 Adding Liquidity to New Pool ${poolId}...`);
  console.log(`Amount A: ${formatTokenAmount(amountA)}`);
  console.log(`Amount B: ${formatTokenAmount(amountB)}`);

  const poolPDA = new PublicKey(pool.poolPDA);
  const tokenA = new PublicKey(pool.tokenA);
  const tokenB = new PublicKey(pool.tokenB);
  const vaultA = new PublicKey(pool.vaultA);
  const vaultB = new PublicKey(pool.vaultB);
  const lpMint = new PublicKey(pool.lpMint);

  const userTokenA = getAssociatedTokenAddressSync(tokenA, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
  const userTokenB = getAssociatedTokenAddressSync(tokenB, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
  const userLP = getAssociatedTokenAddressSync(lpMint, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);

  // Check balances before
  const balanceTokenA = await getTokenBalance(userTokenA);
  const balanceTokenB = await getTokenBalance(userTokenB);
  const balanceLP = await getTokenBalance(userLP);
  
  console.log(`\n📊 Balances BEFORE:`);
  console.log(`Token A: ${formatTokenAmount(balanceTokenA)}`);
  console.log(`Token B: ${formatTokenAmount(balanceTokenB)}`);
  console.log(`LP Tokens: ${formatTokenAmount(balanceLP)}`);

  // Prepare accounts for LegacyAddLiquidity
  const accounts = [
    { pubkey: poolPDA, isSigner: false, isWritable: true },
    { pubkey: tokenA, isSigner: false, isWritable: false },
    { pubkey: tokenB, isSigner: false, isWritable: false },
    { pubkey: vaultA, isSigner: false, isWritable: true },
    { pubkey: vaultB, isSigner: false, isWritable: true },
    { pubkey: lpMint, isSigner: false, isWritable: true },
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

  console.log("📤 Sending AddLiquidity transaction...");
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
  console.log(`Token A: ${formatTokenAmount(newBalanceTokenA)} (Change: ${formatTokenAmount(newBalanceTokenA - balanceTokenA)})`);
  console.log(`Token B: ${formatTokenAmount(newBalanceTokenB)} (Change: ${formatTokenAmount(newBalanceTokenB - balanceTokenB)})`);
  console.log(`LP Tokens: ${formatTokenAmount(newBalanceLP)} (Change: ${formatTokenAmount(newBalanceLP - balanceLP)})`);

  // Update TVL
  const newTVL = parseFloat(pool.tvl) + parseFloat(formatTokenAmount(amountA + amountB));
  registry.updatePool(poolId, { tvl: newTVL.toFixed(6) });

  return sig;
}

async function main() {
  try {
    console.log("🚀 Creating Second Multi-Pool...");
    console.log(`AMM Program ID: ${AMM_PROGRAM_ID.toString()}`);

    // Initialize multi-pool registry
    const registry = new MultiPoolRegistry();
    console.log("\n📋 Multi-Pool Registry initialized");

    // Add existing pool to registry
    const existingPoolInfo = {
      poolId: 1,
      tokenA: TOKEN_A_MINT.toString(),
      tokenB: TOKEN_B_MINT.toString(),
      poolType: "Standard",
      feeRate: 30,
      isActive: true,
      createdAt: Date.now(),
      poolPDA: "DSRs4QwZBsAD7e9Ak12z1RF2V5Waq3qQ2S4xjtgCPMJy",
      lpMint: "4uBNB1rHRRZQFdWkZTTZfJCN5PZWX5r9tk92eD4F4Foo",
      vaultA: "FFDJKq4zg3xirX3Wom2225Fv3tQmq3L8JTfWs7XjocLc",
      vaultB: "7Pyra1CoJTrqB3rUhiGkrxaCBz2f93koNqzZzK9yBNR4",
      tvl: "2.600000"
    };
    
    registry.addExistingPool(1, existingPoolInfo);
    console.log("✅ Added existing pool to registry");

    // Create second pool with different tokens
    console.log("\n" + "=".repeat(60));
    console.log("🏊 CREATING SECOND POOL");
    console.log("=".repeat(60));

    // Create second pool (Token A + Token C)
    const pool2 = await initializeNewPool(registry, TOKEN_A_MINT, TOKEN_C_MINT, "Stable");
    console.log(`✅ Pool 2 created: ${pool2.poolId}`);

    // Add liquidity to second pool
    await addLiquidityToNewPool(registry, 2, 200_000_000, 200_000_000); // 0.2 + 0.2 tokens

    // Display registry status
    console.log("\n" + "=".repeat(60));
    console.log("📊 MULTI-POOL REGISTRY STATUS");
    console.log("=".repeat(60));
    
    const pools = registry.listPools();
    console.log(`Total Pools: ${pools.length}`);
    console.log(`Total TVL: ${registry.getTotalTVL()} tokens`);
    
    pools.forEach(pool => {
      console.log(`\nPool ${pool.poolId}:`);
      console.log(`  Token A: ${pool.tokenA}`);
      console.log(`  Token B: ${pool.tokenB}`);
      console.log(`  Type: ${pool.poolType}`);
      console.log(`  Fee Rate: ${pool.feeRate} basis points`);
      console.log(`  TVL: ${pool.tvl} tokens`);
      console.log(`  Status: ${pool.isActive ? 'Active' : 'Inactive'}`);
      console.log(`  Pool PDA: ${pool.poolPDA}`);
      console.log(`  LP Mint: ${pool.lpMint}`);
    });

    console.log("\n✅ Second Multi-Pool created successfully!");
    console.log("🎉 Your AMM now has TWO active pools!");
    console.log("\n📋 Multi-Pool Features Demonstrated:");
    console.log("  ✅ Multiple Pool Creation");
    console.log("  ✅ Different Pool Types (Standard vs Stable)");
    console.log("  ✅ Independent Pool Operations");
    console.log("  ✅ Separate TVL Tracking");
    console.log("  ✅ Pool Registry Management");

  } catch (error) {
    console.error("❌ Error in Second Pool Creation:", error.message);
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