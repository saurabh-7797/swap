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
  createInitializeAccountInstruction,
} = require("@solana/spl-token");
const fs = require("fs");

// --- CONFIG ---
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";
const AMM_PROGRAM_ID = new PublicKey("DYDaQ5HZSvbqZhkJfELNtQ13pQtRSF4hNFn36eN9xMdD");
const SPL_TOKEN_PROGRAM_ID = new PublicKey("G22oYgZ6LnVcy7v8eSNi2xpNk1NcZiPD8CVKSTut7oZ6");
const ATA_PROGRAM_ID = new PublicKey("GoATGVNeSXerFerPqTJ8hcED1msPWHHLxao2vwBYqowm");
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

async function main() {
  try {
    console.log("🚀 Creating vault accounts...");

    // 1. Derive pool PDA
    const [poolPDA, poolBump] = await PublicKey.findProgramAddress(
      [Buffer.from("pool"), TOKEN_A_MINT.toBuffer(), TOKEN_B_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`Pool PDA: ${poolPDA.toString()}`);

    // 2. Derive vaults
    const [vaultA,] = await PublicKey.findProgramAddress(
      [Buffer.from("vault_a"), poolPDA.toBuffer()],
      AMM_PROGRAM_ID
    );
    const [vaultB,] = await PublicKey.findProgramAddress(
      [Buffer.from("vault_b"), poolPDA.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`Vault A: ${vaultA.toString()}`);
    console.log(`Vault B: ${vaultB.toString()}`);

    // 3. Create transaction
    const tx = new Transaction();

    // Create vault A account
    console.log("📝 Creating vault A account...");
    tx.add(SystemProgram.createAccount({
      fromPubkey: userKeypair.publicKey,
      newAccountPubkey: vaultA,
      lamports: await connection.getMinimumBalanceForRentExemption(165),
      space: 165,
      programId: SPL_TOKEN_PROGRAM_ID,
    }));

    // Initialize vault A as token account
    console.log("📝 Initializing vault A...");
    tx.add(createInitializeAccountInstruction(
      vaultA,
      TOKEN_A_MINT,
      poolPDA, // authority (pool PDA)
      SPL_TOKEN_PROGRAM_ID
    ));

    // Create vault B account
    console.log("📝 Creating vault B account...");
    tx.add(SystemProgram.createAccount({
      fromPubkey: userKeypair.publicKey,
      newAccountPubkey: vaultB,
      lamports: await connection.getMinimumBalanceForRentExemption(165),
      space: 165,
      programId: SPL_TOKEN_PROGRAM_ID,
    }));

    // Initialize vault B as token account
    console.log("📝 Initializing vault B...");
    tx.add(createInitializeAccountInstruction(
      vaultB,
      TOKEN_B_MINT,
      poolPDA, // authority (pool PDA)
      SPL_TOKEN_PROGRAM_ID
    ));

    // Send transaction
    console.log("📤 Sending transaction...");
    const sig = await sendAndConfirmTransaction(connection, tx, [userKeypair], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    
    console.log("✅ Vault creation successful!");
    console.log(`Transaction signature: ${sig}`);
    console.log(`View on GorbScan: https://gorbscan.com/tx/${sig}`);
    
    console.log("\n🏦 Vault Information:");
    console.log(`Vault A: ${vaultA.toString()}`);
    console.log(`Vault B: ${vaultB.toString()}`);
    console.log(`Pool Authority: ${poolPDA.toString()}`);
    
  } catch (error) {
    console.error("❌ Error in vault creation:", error.message);
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