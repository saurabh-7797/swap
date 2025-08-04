const {
  Connection,
  Keypair,
  PublicKey,
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
    console.log("🔍 CHECKING POOL 2 DETAILS");
    console.log("=".repeat(50));
    console.log(`Pool PDA: ${POOL2_PDA.toString()}`);
    console.log(`Token A (Plasma): ${TOKEN_A_MINT.toString()}`);
    console.log(`Token B (Plasma3): ${TOKEN_B_MINT.toString()}`);

    // Get user token accounts
    const userTokenA = getAssociatedTokenAddressSync(TOKEN_A_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenB = getAssociatedTokenAddressSync(TOKEN_B_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);

    console.log(`\n📊 USER BALANCES:`);
    console.log(`User Token A: ${userTokenA.toString()}`);
    console.log(`User Token B: ${userTokenB.toString()}`);

    const balanceTokenA = await getTokenBalance(userTokenA);
    const balanceTokenB = await getTokenBalance(userTokenB);

    console.log(`Token A Balance: ${formatTokenAmount(balanceTokenA)}`);
    console.log(`Token B Balance: ${formatTokenAmount(balanceTokenB)}`);

    // Check Pool 2 account
    console.log(`\n🏊 POOL 2 ACCOUNT:`);
    try {
      const poolAccount = await connection.getAccountInfo(POOL2_PDA);
      if (poolAccount) {
        console.log(`Pool 2 exists: ${poolAccount.data.length} bytes`);
        console.log(`Owner: ${poolAccount.owner.toString()}`);
        console.log(`Lamports: ${poolAccount.lamports}`);
      } else {
        console.log("❌ Pool 2 account not found");
      }
    } catch (error) {
      console.log(`❌ Error checking Pool 2: ${error.message}`);
    }

    // Check recent transactions for Pool 2
    console.log(`\n📋 RECENT POOL 2 TRANSACTIONS:`);
    try {
      const signatures = await connection.getSignaturesForAddress(POOL2_PDA, { limit: 5 });
      signatures.forEach((sig, index) => {
        console.log(`${index + 1}. ${sig.signature}`);
        console.log(`   Block: ${sig.blockTime}`);
        console.log(`   Status: ${sig.err ? 'Failed' : 'Success'}`);
      });
    } catch (error) {
      console.log(`❌ Error getting transactions: ${error.message}`);
    }

    // Check if there are any token accounts owned by the pool
    console.log(`\n🔍 SEARCHING FOR POOL 2 TOKEN ACCOUNTS:`);
    try {
      const tokenAccounts = await connection.getTokenAccountsByOwner(POOL2_PDA, {
        programId: SPL_TOKEN_PROGRAM_ID
      });
      
      console.log(`Found ${tokenAccounts.value.length} token accounts owned by Pool 2:`);
      tokenAccounts.value.forEach((account, index) => {
        console.log(`${index + 1}. ${account.pubkey.toString()}`);
        console.log(`   Data length: ${account.account.data.length}`);
      });
    } catch (error) {
      console.log(`❌ Error getting token accounts: ${error.message}`);
    }

    // Check for LP mint derivation
    console.log(`\n🎯 LP MINT DERIVATION:`);
    try {
      const [lpMint, lpBump] = await PublicKey.findProgramAddress(
        [Buffer.from("lp_mint"), POOL2_PDA.toBuffer()],
        AMM_PROGRAM_ID
      );
      console.log(`Derived LP Mint: ${lpMint.toString()}`);
      console.log(`LP Bump: ${lpBump}`);

      // Check if LP mint exists
      const lpMintAccount = await connection.getAccountInfo(lpMint);
      if (lpMintAccount) {
        console.log(`✅ LP Mint exists: ${lpMintAccount.data.length} bytes`);
        console.log(`Owner: ${lpMintAccount.owner.toString()}`);
      } else {
        console.log(`❌ LP Mint not found`);
      }
    } catch (error) {
      console.log(`❌ Error deriving LP mint: ${error.message}`);
    }

  } catch (error) {
    console.error("❌ Error checking Pool 2 details:", error.message);
    throw error;
  }
}

main().catch(console.error); 