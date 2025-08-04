const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");
const {
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
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
const LP_MINT = new PublicKey("8DVU44CvLbhCXiF8uta33hNVvWtiTJDDs3DAguBLb9pA"); // Actual Pool 2 LP Mint

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
    console.log("🎯 CREATING POOL 2 LP MINT");
    console.log("=".repeat(50));
    console.log(`Pool PDA: ${POOL2_PDA.toString()}`);
    console.log(`LP Mint: ${LP_MINT.toString()}`);

    // Create LP mint keypair (we need to create the account first)
    const lpMintKeypair = Keypair.generate();
    console.log(`Generated LP Mint Keypair: ${lpMintKeypair.publicKey.toString()}`);

    // Create user LP ATA
    const userLP = getAssociatedTokenAddressSync(
      lpMintKeypair.publicKey,
      userKeypair.publicKey,
      false,
      SPL_TOKEN_PROGRAM_ID,
      ATA_PROGRAM_ID
    );

    console.log(`User LP ATA: ${userLP.toString()}`);

    // Create transaction
    const tx = new Transaction();

    // Create LP mint account
    console.log("📝 Creating LP mint account...");
    tx.add(SystemProgram.createAccount({
      fromPubkey: userKeypair.publicKey,
      newAccountPubkey: lpMintKeypair.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(82),
      space: 82,
      programId: SPL_TOKEN_PROGRAM_ID,
    }));

    // Initialize LP mint
    console.log("📝 Initializing LP mint...");
    tx.add(
      createInitializeMintInstruction(
        lpMintKeypair.publicKey,
        9, // decimals
        POOL2_PDA, // mint authority (pool PDA)
        POOL2_PDA, // freeze authority (pool PDA)
        SPL_TOKEN_PROGRAM_ID
      )
    );

    // Create user LP ATA
    console.log("📝 Creating user LP ATA...");
    tx.add(
      createAssociatedTokenAccountInstruction(
        userKeypair.publicKey,
        userLP,
        userKeypair.publicKey,
        lpMintKeypair.publicKey,
        SPL_TOKEN_PROGRAM_ID,
        ATA_PROGRAM_ID
      )
    );

    // Send transaction
    console.log("📤 Sending transaction...");
    const sig = await sendAndConfirmTransaction(connection, tx, [userKeypair, lpMintKeypair], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    console.log("✅ Pool 2 LP Mint created successfully!");
    console.log(`Transaction: ${sig}`);
    console.log(`GorbScan: https://gorbscan.com/tx/${sig}`);
    console.log(`\n📋 LP Mint Details:`);
    console.log(`LP Mint Address: ${lpMintKeypair.publicKey.toString()}`);
    console.log(`User LP ATA: ${userLP.toString()}`);
    console.log(`Mint Authority: ${POOL2_PDA.toString()}`);
    console.log(`Freeze Authority: ${POOL2_PDA.toString()}`);
    console.log(`Decimals: 9`);

  } catch (error) {
    console.error("❌ Error creating Pool 2 LP mint:", error.message);
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