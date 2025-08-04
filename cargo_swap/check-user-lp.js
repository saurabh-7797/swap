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
  createAssociatedTokenAccountInstruction,
} = require("@solana/spl-token");
const fs = require("fs");

// --- CONFIG ---
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";
const SPL_TOKEN_PROGRAM_ID = new PublicKey("G22oYgZ6LnVcy7v8eSNi2xpNk1NcZiPD8CVKSTut7oZ6");
const ATA_PROGRAM_ID = new PublicKey("GoATGVNeSXerFerPqTJ8hcED1msPWHHLxao2vwBYqowm");

// Pool 2 LP Mint
const LP_MINT = new PublicKey("6nuCL6mkubETUx9jTEf98ZgDpoPHR5bNjaph91AvoR59");

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
    console.log("🔍 CHECKING USER LP ACCOUNT");
    console.log("=".repeat(50));
    console.log(`LP Mint: ${LP_MINT.toString()}`);

    // Get correct user LP ATA
    const userLP = getAssociatedTokenAddressSync(
      LP_MINT,
      userKeypair.publicKey,
      false,
      SPL_TOKEN_PROGRAM_ID,
      ATA_PROGRAM_ID
    );

    console.log(`Correct User LP ATA: ${userLP.toString()}`);

    // Check if user LP account exists
    try {
      const userLPAccount = await getAccount(connection, userLP, "confirmed", SPL_TOKEN_PROGRAM_ID);
      console.log(`✅ User LP account exists`);
      console.log(`Mint: ${userLPAccount.mint.toString()}`);
      console.log(`Owner: ${userLPAccount.owner.toString()}`);
      console.log(`Amount: ${userLPAccount.amount}`);
      console.log(`Balance: ${formatTokenAmount(userLPAccount.amount)} LP tokens`);
    } catch (error) {
      console.log(`❌ User LP account does not exist: ${error.message}`);
      console.log(`📝 Creating user LP ATA...`);

      // Create user LP ATA
      const tx = new Transaction();
      tx.add(
        createAssociatedTokenAccountInstruction(
          userKeypair.publicKey,
          userLP,
          userKeypair.publicKey,
          LP_MINT,
          SPL_TOKEN_PROGRAM_ID,
          ATA_PROGRAM_ID
        )
      );

      const sig = await sendAndConfirmTransaction(connection, tx, [userKeypair], {
        commitment: "confirmed",
        preflightCommitment: "confirmed",
      });

      console.log(`✅ User LP ATA created successfully!`);
      console.log(`Transaction: ${sig}`);
      console.log(`GorbScan: https://gorbscan.com/tx/${sig}`);

      // Check balance after creation
      const newBalance = await getTokenBalance(userLP);
      console.log(`New LP Balance: ${formatTokenAmount(newBalance)}`);
    }

  } catch (error) {
    console.error("❌ Error checking user LP account:", error.message);
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