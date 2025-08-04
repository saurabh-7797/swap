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
} = require("@solana/spl-token");
const fs = require("fs");

// --- CONFIG ---
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";
const AMM_PROGRAM_ID = new PublicKey("CurLpsFfiH9GujAQu13nTjqpasTtFpRkMTZhcS6oyLwi");
const SPL_TOKEN_PROGRAM_ID = new PublicKey("G22oYgZ6LnVcy7v8eSNi2xpNk1NcZiPD8CVKSTut7oZ6");
const ATA_PROGRAM_ID = new PublicKey("GoATGVNeSXerFerPqTJ8hcED1msPWHHLxao2vwBYqowm");

// Token mints for the new pool
const TOKEN_A_MINT = new PublicKey("4nUfaDDYBfBaCovmnci5hZdbBe5gazRt8SSczmeMJ51P"); // Plasma
const TOKEN_B_MINT = new PublicKey("AtZBwYcxgP2c9KYL1iezZrf8t7bbXTssSt6Aoz3h9wbH"); // Plasma2

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
    console.log("🚀 Starting Create Pool transaction...");
    console.log(`Token A: ${TOKEN_A_MINT.toString()}`);
    console.log(`Token B: ${TOKEN_B_MINT.toString()}`);

    // 1. Derive registry PDA
    const [registryPDA, registryBump] = await PublicKey.findProgramAddress(
      [Buffer.from("pool_registry"), AMM_PROGRAM_ID.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`Registry PDA: ${registryPDA.toString()}`);

    // 2. Derive pool PDA
    const [poolPDA, poolBump] = await PublicKey.findProgramAddress(
      [Buffer.from("pool"), TOKEN_A_MINT.toBuffer(), TOKEN_B_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`Pool PDA: ${poolPDA.toString()}`);

    // 3. Prepare accounts for CreatePool
    // [registry, user, token_program, system_program, rent]
    const accounts = [
      { pubkey: registryPDA, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ];

    // 4. Instruction data (Borsh: CreatePool { token_a, token_b, pool_type })
    const data = Buffer.alloc(1 + 32 + 32 + 1); // 1 byte discriminator + 2x Pubkey + 1 byte enum
    data.writeUInt8(0, 0); // CreatePool discriminator
    data.set(TOKEN_A_MINT.toBytes(), 1);
    data.set(TOKEN_B_MINT.toBytes(), 33);
    data.writeUInt8(poolType, 65);
    
    console.log(`Instruction data: ${data.toString('hex')}`);
    console.log(`Pool Type: ${poolType === 0 ? 'Standard (0.3% fee)' : poolType === 1 ? 'Stable (0.01% fee)' : 'Concentrated'}`);

    // 5. Create transaction
    const tx = new Transaction();

    // Add CreatePool instruction
    console.log("📝 Adding CreatePool instruction...");
    
    tx.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });

    // Send transaction
    console.log("📤 Sending transaction...");
    const sig = await sendAndConfirmTransaction(connection, tx, [userKeypair], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    
    console.log("✅ Create Pool transaction successful!");
    console.log(`Transaction signature: ${sig}`);
    console.log(`View on GorbScan: https://gorbscan.com/tx/${sig}`);
    
    // Print pool info
    console.log("\n🏊 New Pool Information:");
    console.log(`Pool Address: ${poolPDA.toString()}`);
    console.log(`Token A: ${TOKEN_A_MINT.toString()}`);
    console.log(`Token B: ${TOKEN_B_MINT.toString()}`);
    console.log(`Pool Type: ${poolType === 0 ? 'Standard' : poolType === 1 ? 'Stable' : 'Concentrated'}`);
    console.log(`Fee Rate: ${poolType === 0 ? '0.3%' : poolType === 1 ? '0.01%' : '0.3%'}`);
    console.log(`Status: Created (needs initialization)`);
    
  } catch (error) {
    console.error("❌ Error in CreatePool:", error.message);
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