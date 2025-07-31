const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const fs = require('fs');

// Configuration
const RPC_ENDPOINT = 'https://rpc.gorbchain.xyz';

async function checkWallet() {
  try {
    // Load wallet from file
    console.log('🔍 Loading wallet from /home/saurabh/.config/solana/id.json...');
    const keypairData = JSON.parse(fs.readFileSync('/home/saurabh/.config/solana/id.json', 'utf8'));
    const wallet = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    console.log('\n💰 Wallet Information:');
    console.log('================================');
    console.log(`Wallet Address: ${wallet.publicKey.toString()}`);
    console.log(`Public Key: ${wallet.publicKey.toString()}`);
    
    // Connect to GorbChain
    console.log('\n🌐 Connecting to GorbChain...');
    const connection = new Connection(RPC_ENDPOINT, {
      commitment: 'confirmed',
      disableRetryOnRateLimit: false,
    });
    
    // Check SOL balance
    console.log('\n💎 Checking SOL Balance...');
    const solBalance = await connection.getBalance(wallet.publicKey);
    console.log(`SOL Balance: ${solBalance / 1e9} SOL (${solBalance} lamports)`);
    
    // Check token balances
    console.log('\n🪙 Checking Token Balances...');
    
    // Token addresses on GorbChain
    const SPL_TOKEN = new PublicKey('Gorbj8Dp27NkXMQUkeHBSmpf6iQ3yT4b2uVe8kM4s6br');
    const ATA_TOKEN = new PublicKey('GoATGVNeSXerFerPqTJ8hcED1msPWHHLxao2vwBYqowm');
    
    try {
      // Try to get token account info for SPL token
      const splTokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, {
        mint: SPL_TOKEN
      });
      
      if (splTokenAccounts.value.length > 0) {
        const splBalance = splTokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
        console.log(`SPL Token Balance: ${splBalance} SPL`);
      } else {
        console.log('SPL Token Balance: No token account found');
      }
    } catch (error) {
      console.log('SPL Token Balance: Error checking balance');
    }
    
    try {
      // Try to get token account info for ATA token
      const ataTokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, {
        mint: ATA_TOKEN
      });
      
      if (ataTokenAccounts.value.length > 0) {
        const ataBalance = ataTokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
        console.log(`ATA Token Balance: ${ataBalance} ATA`);
      } else {
        console.log('ATA Token Balance: No token account found');
      }
    } catch (error) {
      console.log('ATA Token Balance: Error checking balance');
    }
    
    // Check if your AMM program is deployed
    console.log('\n🏗️ Checking Deployed Programs...');
    const AMM_PROGRAM_ID = new PublicKey('vdRF21NejEvbfpxtNx7cFQ9n6VxvbiRUXjV76v1bwRv');
    const SPL_TOKEN_PROGRAM_ID = new PublicKey('BuwfKDdJtMuDU85Nfuec8xP9dMCGjegUZHeYvQB4v8AE');
    
    try {
      const ammProgramInfo = await connection.getAccountInfo(AMM_PROGRAM_ID);
      if (ammProgramInfo) {
        console.log(`✅ AMM Program: ${AMM_PROGRAM_ID.toString()}`);
        console.log(`   Size: ${ammProgramInfo.data.length} bytes`);
        console.log(`   Balance: ${ammProgramInfo.lamports / 1e9} SOL`);
      } else {
        console.log(`❌ AMM Program not found: ${AMM_PROGRAM_ID.toString()}`);
      }
    } catch (error) {
      console.log(`❌ Error checking AMM program: ${error.message}`);
    }
    
    try {
      const splProgramInfo = await connection.getAccountInfo(SPL_TOKEN_PROGRAM_ID);
      if (splProgramInfo) {
        console.log(`✅ SPL Token Program: ${SPL_TOKEN_PROGRAM_ID.toString()}`);
        console.log(`   Size: ${splProgramInfo.data.length} bytes`);
        console.log(`   Balance: ${splProgramInfo.lamports / 1e9} SOL`);
      } else {
        console.log(`❌ SPL Token Program not found: ${SPL_TOKEN_PROGRAM_ID.toString()}`);
      }
    } catch (error) {
      console.log(`❌ Error checking SPL Token program: ${error.message}`);
    }
    
    console.log('\n📊 Summary:');
    console.log('================================');
    console.log(`Wallet: ${wallet.publicKey.toString()}`);
    console.log(`SOL: ${solBalance / 1e9} SOL`);
    console.log(`Network: GorbChain (${RPC_ENDPOINT})`);
    console.log(`AMM Program: ${AMM_PROGRAM_ID.toString()}`);
    console.log(`SPL Token Program: ${SPL_TOKEN_PROGRAM_ID.toString()}`);
    
    console.log('\n✅ Wallet check completed!');
    
  } catch (error) {
    console.error('❌ Error checking wallet:', error.message);
  }
}

// Run the check
checkWallet(); 