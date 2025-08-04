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
    console.log("🚀 Starting Pool Registry Initialization...");
    console.log(`AMM Program ID: ${AMM_PROGRAM_ID.toString()}`);

    // 1. Derive registry PDA
    const [registryPDA, registryBump] = await PublicKey.findProgramAddress(
      [Buffer.from("pool_registry"), AMM_PROGRAM_ID.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`Registry PDA: ${registryPDA.toString()}`);
    console.log(`Registry Bump: ${registryBump}`);

    // 2. Prepare accounts for InitializeRegistry
    // [registry, user, token_program, system_program, rent]
    const accounts = [
      { pubkey: registryPDA, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ];

    // 3. Instruction data (Borsh: InitializeRegistry { bump })
    // Create the instruction data with discriminator and bump
    const data = Buffer.alloc(1 + 1); // 1 byte discriminator + 1 byte bump
    data.writeUInt8(5, 0); // InitializeRegistry discriminator
    data.writeUInt8(registryBump, 1); // Registry bump seed
    
    console.log(`Instruction data: ${data.toString('hex')}`);

    // 4. Create transaction
    const tx = new Transaction();

    // Add InitializeRegistry instruction
    console.log("📝 Adding InitializeRegistry instruction...");
    
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
    
    console.log("✅ Pool Registry initialization successful!");
    console.log(`Transaction signature: ${sig}`);
    console.log(`View on GorbScan: https://gorbscan.com/tx/${sig}`);
    
    // Print registry info
    console.log("\n📋 Pool Registry Information:");
    console.log(`Registry Address: ${registryPDA.toString()}`);
    console.log(`Next Pool ID: 1`);
    console.log(`Total Pools: 0`);
    console.log(`Total TVL: 0`);
    
  } catch (error) {
    console.error("❌ Error in InitializeRegistry:", error.message);
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