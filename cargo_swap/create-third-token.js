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
  createInitializeMintInstruction,
  createInitializeMetadataPointerInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ExtensionType,
} = require("@solana/spl-token");
const fs = require("fs");

// --- CONFIG ---
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";
const TOKEN22_PROGRAM = new PublicKey("G22oYgZ6LnVcy7v8eSNi2xpNk1NcZiPD8CVKSTut7oZ6");
const ASSOCIATED_TOKEN_PROGRAM = new PublicKey("GoATGVNeSXerFerPqTJ8hcED1msPWHHLxao2vwBYqowm");

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
    console.log("🚀 Creating Third Token (Plasma3)...");

    // Create mint account for Plasma3
    const mintKeypair = Keypair.generate();
    console.log(`Mint Address: ${mintKeypair.publicKey.toString()}`);

    // Create ATA for the user
    const userATA = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      userKeypair.publicKey,
      false,
      TOKEN22_PROGRAM,
      ASSOCIATED_TOKEN_PROGRAM
    );

    console.log(`User ATA: ${userATA.toString()}`);

    // Create transaction
    const tx = new Transaction();

    // Create mint account
    console.log("📝 Creating mint account...");
    tx.add(SystemProgram.createAccount({
      fromPubkey: userKeypair.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(82),
      space: 82,
      programId: TOKEN22_PROGRAM,
    }));

    // Initialize mint
    console.log("📝 Initializing mint...");
    tx.add(
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        9, // decimals
        userKeypair.publicKey, // mint authority
        userKeypair.publicKey, // freeze authority
        TOKEN22_PROGRAM
      )
    );

    // Create user ATA
    console.log("📝 Creating user ATA...");
    tx.add(
      createAssociatedTokenAccountInstruction(
        userKeypair.publicKey,
        userATA,
        userKeypair.publicKey,
        mintKeypair.publicKey,
        TOKEN22_PROGRAM,
        ASSOCIATED_TOKEN_PROGRAM
      )
    );

    // Mint tokens to user
    console.log("📝 Minting tokens to user...");
    const mintAmount = 1_000_000_000_000; // 1,000 tokens
    tx.add(
      createMintToInstruction(
        mintKeypair.publicKey,
        userATA,
        userKeypair.publicKey,
        mintAmount,
        [],
        TOKEN22_PROGRAM
      )
    );

    // Send transaction
    console.log("📤 Sending transaction...");
    const sig = await sendAndConfirmTransaction(connection, tx, [userKeypair, mintKeypair], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    console.log("✅ Third Token (Plasma3) created successfully!");
    console.log(`Transaction: ${sig}`);
    console.log(`GorbScan: https://gorbscan.com/tx/${sig}`);
    console.log(`\n📋 Token Details:`);
    console.log(`Mint Address: ${mintKeypair.publicKey.toString()}`);
    console.log(`User ATA: ${userATA.toString()}`);
    console.log(`Initial Supply: 1,000 tokens`);
    console.log(`Decimals: 9`);

  } catch (error) {
    console.error("❌ Error creating third token:", error.message);
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