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
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  createInitializeTransferHookInstruction,
  createInitializeMetadataPointerInstruction,
  getMintLen,
  ExtensionType,
  createInitializeTransferFeeConfigInstruction,
  createInitializeInstruction,
  createUpdateFieldInstruction,
  getMint,
} = require("@solana/spl-token");
const fs = require("fs");

// Configuration
const KEYPAIR_PATH = "/home/saurabh/.config/solana/id.json";
const NETWORK = "https://rpc.gorbchain.xyz";
//const TRANSFER_HOOK = new PublicKey("AUMawxpGPoPbXmhSyTxSFV1tqNLzyQ2Swu6Agbu1XJij");

// Gorbagana chain specific program IDs
const TOKEN22_PROGRAM = new PublicKey("G22oYgZ6LnVcy7v8eSNi2xpNk1NcZiPD8CVKSTut7oZ6");
const ASSOCIATED_TOKEN_PROGRAM = new PublicKey("GoATGVNeSXerFerPqTJ8hcED1msPWHHLxao2vwBYqowm");

const DECIMALS = 9;
const SUPPLY = 1_000_000_000;
const NAME = "Plasma";
const SYMBOL = "PLASMA";
const URI = "https://gray-historic-zebra-961.mypinata.cloud/ipfs/bafkreifakztvz2l5sarxmehpcbaacwcz4mb7egfzppqunzzw6ccvpoesk4";
const TRANSFER_FEE_BASIS_POINTS = 500; // 5% transfer fee
const MAXIMUM_FEE = BigInt(999999999999999999); // Maximum fee in token units

// Set up connection and wallet
const connection = new Connection(NETWORK, {
  commitment: "confirmed",
  wsEndpoint: "wss://rpc.gorbchain.xyz/ws/",
});
const walletKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf-8")))
);
const payer = walletKeypair;

// Main function to create token
async function createToken() {
  try {
      console.log("Creating SPL Token-2022 on Gorbagana chain with transfer hook, transfer fee, and metadata...");
      const mintKeypair = Keypair.generate();
      const mint = mintKeypair.publicKey;

      // Step 1: Create mint account with space for extensions
      console.log("Step 1: Creating mint account with transfer hook, transfer fee, and metadata pointer extensions...");
      
      // Calculate space needed for mint with extensions
      const extensions = [
          // ExtensionType.TransferHook,
          ExtensionType.MetadataPointer,
          // ExtensionType.TransferFeeConfig
      ];
      
      const mintLen = getMintLen(extensions);
      console.log(`Allocating ${mintLen} bytes for mint account with extensions`);
      
      // Calculate minimum balance for rent exemption
      const rentExemptionAmount = await connection.getMinimumBalanceForRentExemption(mintLen);
      
      // Create a single transaction that:
      // 1. Creates the mint account with space for extensions
      // 2. Initializes the extensions
      // 3. Initializes the mint
      const createAndInitializeTx = new Transaction().add(
          // Create mint account with space for extensions only
          SystemProgram.createAccount({
              fromPubkey: payer.publicKey,
              newAccountPubkey: mint,
              lamports: rentExemptionAmount,
              space: mintLen,
              programId: TOKEN22_PROGRAM,
          }),
          
          // Initialize transfer fee config
          // createInitializeTransferFeeConfigInstruction(
          //     mint,
          //     payer.publicKey, // Authority to update fees
          //     payer.publicKey, // Authority to withdraw withheld fees
          //     TRANSFER_FEE_BASIS_POINTS,
          //     MAXIMUM_FEE,
          //     TOKEN22_PROGRAM
          // ),
          
          // Initialize metadata pointer extension (pointing to mint itself)
          createInitializeMetadataPointerInstruction(
              mint,
              payer.publicKey,
              mint, // Point to mint itself for metadata storage
              TOKEN22_PROGRAM
          ),
          
          // // Initialize transfer hook extension
          // createInitializeTransferHookInstruction(
          //     mint,
          //     payer.publicKey,
          //     TRANSFER_HOOK,
          //     TOKEN22_PROGRAM
          // ),
          
          // Initialize mint
          createInitializeMintInstruction(
              mint,
              DECIMALS,
              payer.publicKey,
              payer.publicKey,
              TOKEN22_PROGRAM
          )
      );
      
      const createMintSignature = await sendAndConfirmTransaction(
          connection,
          createAndInitializeTx,
          [payer, mintKeypair],
          { commitment: "confirmed" }
      );
      
      console.log(`Mint account created and initialized! Signature: ${createMintSignature}`);
      console.log(`Mint address: ${mint.toBase58()}`);
      
      // Step 2: Initialize metadata programmatically
      console.log("Step 2: Initializing token metadata programmatically...");
      
      try {
          // Verify the mint account was created with metadata pointer before initializing metadata
          console.log("Verifying mint account setup...");
          const mintInfo = await getMint(connection, mint, "confirmed", TOKEN22_PROGRAM);
          console.log(`Mint verified: ${mintInfo.address.toBase58()}`);
          
          // Check current account info to see allocated space
          const accountInfo = await connection.getAccountInfo(mint);
          if (accountInfo) {
              console.log(`Current mint account space: ${accountInfo.data.length} bytes`);
              
              // Calculate metadata space needed
              const metadataSpace = 
                  4 + // discriminator
                  32 + // update authority  
                  32 + // mint
                  4 + NAME.length + // name with length prefix
                  4 + SYMBOL.length + // symbol with length prefix
                  4 + URI.length + // uri with length prefix
                  4; // additional metadata vector length
                  
              console.log(`Metadata space needed: ${metadataSpace} bytes`);
              
              // If we need more space, we might need to reallocate
              const totalSpaceNeeded = accountInfo.data.length + metadataSpace;
              console.log(`Total space needed: ${totalSpaceNeeded} bytes`);
              
              // For now, let's try to initialize metadata and see if it handles space allocation
              console.log("Creating metadata initialization instruction...");
              const initMetadataInstruction = createInitializeInstruction({
                  programId: TOKEN22_PROGRAM,
                  metadata: mint, // Use the mint itself for metadata storage
                  updateAuthority: payer.publicKey,
                  mint: mint,
                  mintAuthority: payer.publicKey,
                  name: NAME,
                  symbol: SYMBOL,
                  uri: URI,
              });
              
              console.log("Sending metadata initialization transaction...");
              const initMetadataTx = new Transaction().add(initMetadataInstruction);
              
              const metadataSignature = await sendAndConfirmTransaction(
                  connection,
                  initMetadataTx,
                  [payer],
                  { 
                      commitment: "confirmed",
                      skipPreflight: false,
                      preflightCommitment: "confirmed"
                  }
              );
              
              console.log(`✅ Metadata initialized successfully! Signature: ${metadataSignature}`);
          } else {
              console.error("❌ Could not fetch mint account info");
          }
          
      } catch (metadataError) {
          console.error("❌ Metadata initialization failed:");
          console.error(`Error: ${metadataError.message}`);
          
          if (metadataError.logs) {
              console.error("Transaction logs:");
              metadataError.logs.forEach((log, index) => {
                  console.error(`  ${index + 1}: ${log}`);
              });
          }
          
          // Let's try a different approach - maybe we need to use realloc
          console.log("⚠️  Trying alternative metadata initialization approach...");
          
          try {
              // Check if there's an account reallocation instruction we can use
              const accountInfo = await connection.getAccountInfo(mint);
              if (accountInfo) {
                  const metadataSpace = 
                      4 + 32 + 32 + 4 + NAME.length + 4 + SYMBOL.length + 4 + URI.length + 4;
                  
                  const newSize = accountInfo.data.length + metadataSpace;
                  const additionalRent = await connection.getMinimumBalanceForRentExemption(newSize) - 
                                       await connection.getMinimumBalanceForRentExemption(accountInfo.data.length);
                  
                  console.log(`Trying to reallocate account to ${newSize} bytes (additional rent: ${additionalRent})`);
                  
                  // Create a transaction to transfer additional rent if needed
                  if (additionalRent > 0) {
                      const transferIx = SystemProgram.transfer({
                          fromPubkey: payer.publicKey,
                          toPubkey: mint,
                          lamports: additionalRent,
                      });
                      
                      const transferTx = new Transaction().add(transferIx);
                      await sendAndConfirmTransaction(connection, transferTx, [payer], { commitment: "confirmed" });
                      console.log("Additional rent transferred");
                  }
                  
                  // Try metadata initialization again
                  const retryMetadataInstruction = createInitializeInstruction({
                      programId: TOKEN22_PROGRAM,
                      metadata: mint,
                      updateAuthority: payer.publicKey,
                      mint: mint,
                      mintAuthority: payer.publicKey,
                      name: NAME,
                      symbol: SYMBOL,
                      uri: URI,
                  });
                  
                  const retryTx = new Transaction().add(retryMetadataInstruction);
                  const retrySignature = await sendAndConfirmTransaction(
                      connection, retryTx, [payer], { commitment: "confirmed" }
                  );
                  
                  console.log(`✅ Metadata initialized on retry! Signature: ${retrySignature}`);
              }
          } catch (retryError) {
              console.error("❌ Retry also failed:", retryError.message);
              console.log("⚠️  Continuing with token creation without metadata...");
              console.log("The token will work but won't have on-chain metadata.");
          }
      }
      
      // Step 3: Create token account and mint tokens
      console.log("Step 3: Creating token account and minting tokens...");
      const tokenAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          mint,
          payer.publicKey,
          false,
          "confirmed",
          {
              commitment: "confirmed",
          },
          TOKEN22_PROGRAM,
          ASSOCIATED_TOKEN_PROGRAM
      );
      
      console.log(`Token account created: ${tokenAccount.address.toBase58()}`);
      
      // Mint tokens
      console.log(`Minting ${SUPPLY} tokens to ${tokenAccount.address.toBase58()}...`);
      const supplyBigInt = BigInt(SUPPLY) * BigInt(10 ** DECIMALS);
      
      const mintToSignature = await mintTo(
          connection,
          payer,
          mint,
          tokenAccount.address,
          payer,
          supplyBigInt,
          [],
          {
              commitment: "confirmed",
          },
          TOKEN22_PROGRAM
      );
      
      console.log(`Tokens minted! Signature: ${mintToSignature}`);
      
      // Final output
      console.log("\n✅ Token creation complete on Gorbagana chain!");
      console.log(`Mint Address: ${mint.toBase58()}`);
      console.log(`Token Account: ${tokenAccount.address.toBase58()}`);
      console.log(`Supply: ${SUPPLY} tokens`);
      console.log(`Decimals: ${DECIMALS}`);
      console.log(`Name: ${NAME}`);
      console.log(`Symbol: ${SYMBOL}`);
      console.log(`URI: ${URI}`);
      console.log(`Transfer Fee: ${TRANSFER_FEE_BASIS_POINTS / 100}%`);
      console.log(`Maximum Fee: ${MAXIMUM_FEE} tokens`);
      console.log(`Token 2022 Program: ${TOKEN22_PROGRAM.toBase58()}`);
      console.log(`Associated Token Program: ${ASSOCIATED_TOKEN_PROGRAM.toBase58()}`);
      
  } catch (error) {
      console.error("❌ Error creating token:", error);
      if (error.logs) {
          console.error("Transaction logs:", error.logs);
      }
      process.exit(1);
  }
}

// Run
createToken();