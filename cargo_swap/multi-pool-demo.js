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
  createAssociatedTokenAccountInstruction,
  getAccount,
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

  // Update pool info after initialization
  updatePool(poolId, updates) {
    const pool = this.pools.get(poolId);
    if (pool) {
      Object.assign(pool, updates);
    }
  }

  // Get total TVL
  getTotalTVL() {
    return Array.from(this.pools.values()).reduce((total, pool) => total + pool.tvl, 0);
  }
}

// Initialize a new pool
async function initializePool(registry, tokenA, tokenB, poolType = "Standard") {
  console.log(`\n🏊 Initializing Pool ${registry.nextPoolId}...`);
  console.log(`Token A: ${tokenA.toString()}`);
  console.log(`Token B: ${tokenB.toString()}`);
  console.log(`Pool Type: ${poolType}`);

  // Create pool entry in registry
  const poolInfo = registry.createPool(tokenA, tokenB, poolType);
  
  // Derive pool PDA
  const [poolPDA, poolBump] = await PublicKey.findProgramAddress(
    [Buffer.from("pool"), tokenA.toBuffer(), tokenB.toBuffer()],
    AMM_PROGRAM_ID
  );

  console.log(`Pool PDA: ${poolPDA.toString()}`);

  // Prepare accounts for InitPool
  const userTokenA = getAssociatedTokenAddressSync(tokenA, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
  const userTokenB = getAssociatedTokenAddressSync(tokenB, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);

  // Check balances
  const balanceTokenA = await getTokenBalance(userTokenA);
  const balanceTokenB = await getTokenBalance(userTokenB);
  
  console.log(`\n📊 Balances:`);
  console.log(`Token A: ${formatTokenAmount(balanceTokenA)}`);
  console.log(`Token B: ${formatTokenAmount(balanceTokenB)}`);

  // Initial liquidity amounts
  const amountA = 1_000_000_000; // 1.0 tokens
  const amountB = 1_000_000_000; // 1.0 tokens

  // Create vault accounts (these will be created by the contract)
  const vaultA = Keypair.generate();
  const vaultB = Keypair.generate();

  // Prepare accounts for LegacyInitPool
  const accounts = [
    { pubkey: poolPDA, isSigner: false, isWritable: true },
    { pubkey: tokenA, isSigner: false, isWritable: false },
    { pubkey: tokenB, isSigner: false, isWritable: false },
    { pubkey: vaultA.publicKey, isSigner: true, isWritable: true },
    { pubkey: vaultB.publicKey, isSigner: true, isWritable: true },
    { pubkey: userTokenA, isSigner: false, isWritable: true },
    { pubkey: userTokenB, isSigner: false, isWritable: true },
    { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
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
  tx.add({
    keys: accounts,
    programId: AMM_PROGRAM_ID,
    data,
  });

  console.log("📤 Sending InitPool transaction...");
  const sig = await sendAndConfirmTransaction(connection, tx, [userKeypair, vaultA, vaultB], {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });

  console.log("✅ Pool initialized successfully!");
  console.log(`Transaction: ${sig}`);
  console.log(`GorbScan: https://gorbscan.com/tx/${sig}`);

  // Update registry with pool details
  registry.updatePool(poolInfo.poolId, {
    poolPDA: poolPDA.toString(),
    vaultA: vaultA.publicKey.toString(),
    vaultB: vaultB.publicKey.toString(),
    tvl: formatTokenAmount(amountA + amountB)
  });

  return poolInfo;
}

// Add liquidity to a pool
async function addLiquidity(registry, poolId, amountA, amountB) {
  const pool = registry.getPool(poolId);
  if (!pool) {
    throw new Error(`Pool ${poolId} not found`);
  }

  console.log(`\n💧 Adding Liquidity to Pool ${poolId}...`);
  console.log(`Amount A: ${formatTokenAmount(amountA)}`);
  console.log(`Amount B: ${formatTokenAmount(amountB)}`);

  const poolPDA = new PublicKey(pool.poolPDA);
  const tokenA = new PublicKey(pool.tokenA);
  const tokenB = new PublicKey(pool.tokenB);
  const vaultA = new PublicKey(pool.vaultA);
  const vaultB = new PublicKey(pool.vaultB);

  // Derive LP mint (this would be created during InitPool)
  const [lpMint, lpBump] = await PublicKey.findProgramAddress(
    [Buffer.from("lp_mint"), poolPDA.toBuffer()],
    AMM_PROGRAM_ID
  );

  const userTokenA = getAssociatedTokenAddressSync(tokenA, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
  const userTokenB = getAssociatedTokenAddressSync(tokenB, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
  const userLP = getAssociatedTokenAddressSync(lpMint, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);

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

  // Update TVL
  const newTVL = pool.tvl + formatTokenAmount(amountA + amountB);
  registry.updatePool(poolId, { tvl: newTVL });

  return sig;
}

// Perform a swap
async function performSwap(registry, poolId, amountIn, directionAtoB) {
  const pool = registry.getPool(poolId);
  if (!pool) {
    throw new Error(`Pool ${poolId} not found`);
  }

  console.log(`\n🔄 Performing Swap on Pool ${poolId}...`);
  console.log(`Amount In: ${formatTokenAmount(amountIn)} ${directionAtoB ? 'Token A' : 'Token B'}`);
  console.log(`Direction: ${directionAtoB ? 'A → B' : 'B → A'}`);

  const poolPDA = new PublicKey(pool.poolPDA);
  const tokenA = new PublicKey(pool.tokenA);
  const tokenB = new PublicKey(pool.tokenB);
  const vaultA = new PublicKey(pool.vaultA);
  const vaultB = new PublicKey(pool.vaultB);

  const userTokenA = getAssociatedTokenAddressSync(tokenA, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
  const userTokenB = getAssociatedTokenAddressSync(tokenB, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);

  // Prepare accounts for LegacySwap
  const accounts = [
    { pubkey: poolPDA, isSigner: false, isWritable: true },
    { pubkey: tokenA, isSigner: false, isWritable: false },
    { pubkey: tokenB, isSigner: false, isWritable: false },
    { pubkey: vaultA, isSigner: false, isWritable: true },
    { pubkey: vaultB, isSigner: false, isWritable: true },
    { pubkey: directionAtoB ? userTokenA : userTokenB, isSigner: false, isWritable: true },
    { pubkey: directionAtoB ? userTokenB : userTokenA, isSigner: false, isWritable: true },
    { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
    { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  // Instruction data for LegacySwap
  const data = Buffer.alloc(1 + 8 + 1);
  data.writeUInt8(13, 0); // LegacySwap discriminator
  data.writeBigUInt64LE(BigInt(amountIn), 1);
  data.writeUInt8(directionAtoB ? 1 : 0, 9);

  // Create and send transaction
  const tx = new Transaction();
  tx.add({
    keys: accounts,
    programId: AMM_PROGRAM_ID,
    data,
  });

  console.log("📤 Sending Swap transaction...");
  const sig = await sendAndConfirmTransaction(connection, tx, [userKeypair], {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });

  console.log("✅ Swap completed successfully!");
  console.log(`Transaction: ${sig}`);
  console.log(`GorbScan: https://gorbscan.com/tx/${sig}`);

  return sig;
}

async function main() {
  try {
    console.log("🚀 Starting Multi-Pool Demonstration...");
    console.log(`AMM Program ID: ${AMM_PROGRAM_ID.toString()}`);

    // Initialize multi-pool registry
    const registry = new MultiPoolRegistry();
    console.log("\n📋 Multi-Pool Registry initialized");

    // Create multiple pools
    console.log("\n" + "=".repeat(60));
    console.log("🏊 CREATING MULTIPLE POOLS");
    console.log("=".repeat(60));

    // Pool 1: Standard pool (Token A + Token B)
    const pool1 = await initializePool(registry, TOKEN_A_MINT, TOKEN_B_MINT, "Standard");
    console.log(`✅ Pool 1 created: ${pool1.poolId}`);

    // Add liquidity to Pool 1
    await addLiquidity(registry, 1, 500_000_000, 500_000_000); // 0.5 + 0.5 tokens

    // Perform swaps on Pool 1
    await performSwap(registry, 1, 200_000_000, true); // A → B
    await performSwap(registry, 1, 100_000_000, false); // B → A

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
    });

    console.log("\n✅ Multi-Pool demonstration completed successfully!");
    console.log("🎉 Your AMM now supports multiple pools!");

  } catch (error) {
    console.error("❌ Error in Multi-Pool Demo:", error.message);
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