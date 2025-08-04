const {
  Connection,
  Keypair,
  PublicKey,
} = require("@solana/web3.js");
const {
  getAccount,
} = require("@solana/spl-token");
const fs = require("fs");

// --- CONFIG ---
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";
const SPL_TOKEN_PROGRAM_ID = new PublicKey("G22oYgZ6LnVcy7v8eSNi2xpNk1NcZiPD8CVKSTut7oZ6");

// Pool 2 Vaults
const VAULT_A = new PublicKey("621oj66u1ZdWY4FgF3EBxJE8ZbzpRDdtkSpcMyo26QZU");
const VAULT_B = new PublicKey("DZ8tfbn8ga5hMN6rVe4vyYS6Sw4b1TJdqDP4iuTdrcdV");

const connection = new Connection(RPC_ENDPOINT, {
  commitment: "confirmed",
  wsEndpoint: WS_ENDPOINT,
});

async function main() {
  try {
    console.log("🔍 CHECKING VAULT TOKEN ASSOCIATIONS");
    console.log("=".repeat(50));

    // Check Vault A
    console.log(`\n🏦 Vault A: ${VAULT_A.toString()}`);
    try {
      const vaultAAccount = await getAccount(connection, VAULT_A, "confirmed", SPL_TOKEN_PROGRAM_ID);
      console.log(`✅ Vault A exists`);
      console.log(`Mint: ${vaultAAccount.mint.toString()}`);
      console.log(`Owner: ${vaultAAccount.owner.toString()}`);
      console.log(`Amount: ${vaultAAccount.amount}`);
      console.log(`Delegate: ${vaultAAccount.delegate ? vaultAAccount.delegate.toString() : 'None'}`);
      console.log(`State: ${vaultAAccount.state}`);
    } catch (error) {
      console.log(`❌ Error checking Vault A: ${error.message}`);
    }

    // Check Vault B
    console.log(`\n🏦 Vault B: ${VAULT_B.toString()}`);
    try {
      const vaultBAccount = await getAccount(connection, VAULT_B, "confirmed", SPL_TOKEN_PROGRAM_ID);
      console.log(`✅ Vault B exists`);
      console.log(`Mint: ${vaultBAccount.mint.toString()}`);
      console.log(`Owner: ${vaultBAccount.owner.toString()}`);
      console.log(`Amount: ${vaultBAccount.amount}`);
      console.log(`Delegate: ${vaultBAccount.delegate ? vaultBAccount.delegate.toString() : 'None'}`);
      console.log(`State: ${vaultBAccount.state}`);
    } catch (error) {
      console.log(`❌ Error checking Vault B: ${error.message}`);
    }

    // Expected tokens
    console.log(`\n🎯 EXPECTED TOKENS:`);
    console.log(`Token A (Plasma): 4nUfaDDYBfBaCovmnci5hZdbBe5gazRt8SSczmeMJ51P`);
    console.log(`Token B (Plasma3): EVA4hAVHVzqASfXpWhRrPcGo62RQ9htLY5YYMQV9bExM`);

  } catch (error) {
    console.error("❌ Error checking vault tokens:", error.message);
    throw error;
  }
}

main().catch(console.error); 