use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack, Sealed},
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::Sysvar,
};
use std::str::FromStr;
// Remove the standard spl_token import and create manual instructions
// use spl_token::{
//     instruction::{burn, mint_to, transfer},
// };
use borsh::{BorshDeserialize, BorshSerialize};

// Program ID
solana_program::declare_id!("CurLpsFfiH9GujAQu13nTjqpasTtFpRkMTZhcS6oyLwi");

// GorbChain SPL Token Program ID
const GORBCHAIN_SPL_TOKEN_PROGRAM: &str = "G22oYgZ6LnVcy7v8eSNi2xpNk1NcZiPD8CVKSTut7oZ6";

// Pool Registry PDA seeds
const POOL_REGISTRY_SEEDS: &[u8] = b"pool_registry";

// Manual instruction creation for GorbChain SPL Token program
fn create_transfer_instruction(
    source: &Pubkey,
    destination: &Pubkey,
    authority: &Pubkey,
    amount: u64,
) -> solana_program::instruction::Instruction {
    let data = {
        let mut buf = Vec::new();
        buf.push(3); // Transfer instruction discriminator
        buf.extend_from_slice(&amount.to_le_bytes());
        buf
    };

    solana_program::instruction::Instruction {
        program_id: Pubkey::from_str(GORBCHAIN_SPL_TOKEN_PROGRAM).unwrap(),
        accounts: vec![
            solana_program::instruction::AccountMeta::new(*source, false),
            solana_program::instruction::AccountMeta::new(*destination, false),
            solana_program::instruction::AccountMeta::new_readonly(*authority, true),
        ],
        data,
    }
}

fn create_mint_to_instruction(
    mint: &Pubkey,
    destination: &Pubkey,
    authority: &Pubkey,
    amount: u64,
) -> solana_program::instruction::Instruction {
    let data = {
        let mut buf = Vec::new();
        buf.push(7); // MintTo instruction discriminator
        buf.extend_from_slice(&amount.to_le_bytes());
        buf
    };

    solana_program::instruction::Instruction {
        program_id: Pubkey::from_str(GORBCHAIN_SPL_TOKEN_PROGRAM).unwrap(),
        accounts: vec![
            solana_program::instruction::AccountMeta::new(*mint, false),
            solana_program::instruction::AccountMeta::new(*destination, false),
            solana_program::instruction::AccountMeta::new_readonly(*authority, true),
        ],
        data,
    }
}

fn create_burn_instruction(
    account: &Pubkey,
    mint: &Pubkey,
    authority: &Pubkey,
    amount: u64,
) -> solana_program::instruction::Instruction {
    let data = {
        let mut buf = Vec::new();
        buf.push(8); // Burn instruction discriminator
        buf.extend_from_slice(&amount.to_le_bytes());
        buf
    };

    solana_program::instruction::Instruction {
        program_id: Pubkey::from_str(GORBCHAIN_SPL_TOKEN_PROGRAM).unwrap(),
        accounts: vec![
            solana_program::instruction::AccountMeta::new(*account, false),
            solana_program::instruction::AccountMeta::new(*mint, false),
            solana_program::instruction::AccountMeta::new_readonly(*authority, true),
        ],
        data,
    }
}

fn create_initialize_account_instruction(
    account: &Pubkey,
    mint: &Pubkey,
    authority: &Pubkey,
) -> solana_program::instruction::Instruction {
    let data = {
        let mut buf = Vec::new();
        buf.push(1); // InitializeAccount instruction discriminator
        buf
    };

    solana_program::instruction::Instruction {
        program_id: Pubkey::from_str(GORBCHAIN_SPL_TOKEN_PROGRAM).unwrap(),
        accounts: vec![
            solana_program::instruction::AccountMeta::new(*account, false),
            solana_program::instruction::AccountMeta::new_readonly(*mint, false),
            solana_program::instruction::AccountMeta::new_readonly(*authority, false),
            solana_program::instruction::AccountMeta::new_readonly(solana_program::sysvar::rent::id(), false),
        ],
        data,
    }
}

// Entry point
entrypoint!(process_instruction);

// Pool Types
#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub enum PoolType {
    Standard,      // 0.3% fee
    Stable,        // 0.01% fee for stable pairs
    Concentrated,  // Concentrated liquidity (future)
}

impl Default for PoolType {
    fn default() -> Self {
        PoolType::Standard
    }
}

impl PoolType {
    pub fn default_fee_rate(&self) -> u16 {
        match self {
            PoolType::Standard => 30,    // 0.3%
            PoolType::Stable => 1,       // 0.01%
            PoolType::Concentrated => 30, // Default to standard for now
        }
    }
}

// Pool Info for Registry
#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct PoolInfo {
    pub pool_id: u64,
    pub pool_address: Pubkey,
    pub token_a: Pubkey,
    pub token_b: Pubkey,
    pub pool_type: PoolType,
    pub fee_rate: u16,        // Fee in basis points (e.g., 30 = 0.3%)
    pub is_active: bool,
    pub created_at: i64,
    pub tvl: u64,             // Total Value Locked
}

impl PoolInfo {
    pub fn pack(&self, dst: &mut Vec<u8>) {
        let data = self.try_to_vec().unwrap();
        dst.extend_from_slice(&data);
    }
}

// Pool Registry
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct PoolRegistry {
    pub pools: Vec<PoolInfo>,
    pub next_pool_id: u64,
    pub total_pools: u32,
    pub total_tvl: u64,
}

impl Sealed for PoolRegistry {}

impl IsInitialized for PoolRegistry {
    fn is_initialized(&self) -> bool {
        self.next_pool_id > 0
    }
}

impl Pack for PoolRegistry {
    const LEN: usize = 10000; // Large enough for multiple pools

    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        let registry = PoolRegistry::try_from_slice(src)
            .map_err(|_| ProgramError::InvalidAccountData)?;
        Ok(registry)
    }

    fn pack_into_slice(&self, dst: &mut [u8]) {
        let data = self.try_to_vec().unwrap();
        dst[..data.len()].copy_from_slice(&data);
    }
}

// Instructions
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum TestProjectInstruction {
    // Multi-pool instructions
    CreatePool { token_a: Pubkey, token_b: Pubkey, pool_type: PoolType },
    InitPool { pool_id: u64, amount_a: u64, amount_b: u64 },
    AddLiquidity { pool_id: u64, amount_a: u64, amount_b: u64 },
    RemoveLiquidity { pool_id: u64, lp_amount: u64 },
    Swap { pool_id: u64, amount_in: u64, direction_a_to_b: bool },
    
    // Registry management
    InitializeRegistry { bump: u8 },
    ListPools,
    GetPoolInfo { pool_id: u64 },
    UpdatePoolFee { pool_id: u64, new_fee_rate: u16 },
    DeactivatePool { pool_id: u64 },
    
    // Backward compatibility (legacy instructions)
    LegacyInitPool { amount_a: u64, amount_b: u64 },
    LegacyAddLiquidity { amount_a: u64, amount_b: u64 },
    LegacyRemoveLiquidity { lp_amount: u64 },
    LegacySwap { amount_in: u64, direction_a_to_b: bool },
}

// Enhanced Pool state
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct Pool {
    pub pool_id: u64,
    pub pool_type: PoolType,
    pub token_a: Pubkey,
    pub token_b: Pubkey,
    pub bump: u8,
    pub fee_rate: u16,        // Fee in basis points
    pub reserve_a: u64,
    pub reserve_b: u64,
    pub total_lp_supply: u64,
    pub created_at: i64,
    pub is_active: bool,
}

impl Sealed for Pool {}

impl IsInitialized for Pool {
    fn is_initialized(&self) -> bool {
        self.token_a != Pubkey::default() && self.is_active
    }
}

impl Pack for Pool {
    const LEN: usize = 8 + 1 + 32 + 32 + 1 + 2 + 8 + 8 + 8 + 8 + 1; // 107 bytes

    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        let pool = Pool::try_from_slice(src)
            .map_err(|_| ProgramError::InvalidAccountData)?;
        Ok(pool)
    }

    fn pack_into_slice(&self, dst: &mut [u8]) {
        let data = self.try_to_vec().unwrap();
        dst[..data.len()].copy_from_slice(&data);
    }
}

// Program instruction processor
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let instruction = TestProjectInstruction::try_from_slice(instruction_data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;

    match instruction {
        // Multi-pool instructions
        TestProjectInstruction::CreatePool { token_a, token_b, pool_type } => {
            process_create_pool(program_id, accounts, token_a, token_b, pool_type)
        }
        TestProjectInstruction::InitPool { pool_id, amount_a, amount_b } => {
            process_init_pool(program_id, accounts, pool_id, amount_a, amount_b)
        }
        TestProjectInstruction::AddLiquidity { pool_id, amount_a, amount_b } => {
            process_add_liquidity(program_id, accounts, pool_id, amount_a, amount_b)
        }
        TestProjectInstruction::RemoveLiquidity { pool_id, lp_amount } => {
            process_remove_liquidity(program_id, accounts, pool_id, lp_amount)
        }
        TestProjectInstruction::Swap { pool_id, amount_in, direction_a_to_b } => {
            process_swap(program_id, accounts, pool_id, amount_in, direction_a_to_b)
        }
        
        // Registry management
        TestProjectInstruction::InitializeRegistry { bump } => {
            process_initialize_registry(program_id, accounts, instruction_data, bump)
        }
        TestProjectInstruction::ListPools => {
            process_list_pools(program_id, accounts)
        }
        TestProjectInstruction::GetPoolInfo { pool_id } => {
            process_get_pool_info(program_id, accounts, pool_id)
        }
        TestProjectInstruction::UpdatePoolFee { pool_id, new_fee_rate } => {
            process_update_pool_fee(program_id, accounts, pool_id, new_fee_rate)
        }
        TestProjectInstruction::DeactivatePool { pool_id } => {
            process_deactivate_pool(program_id, accounts, pool_id)
        }
        
        // Legacy instructions (backward compatibility)
        TestProjectInstruction::LegacyInitPool { amount_a, amount_b } => {
            process_legacy_init_pool(program_id, accounts, amount_a, amount_b)
        }
        TestProjectInstruction::LegacyAddLiquidity { amount_a, amount_b } => {
            process_legacy_add_liquidity(program_id, accounts, amount_a, amount_b)
        }
        TestProjectInstruction::LegacyRemoveLiquidity { lp_amount } => {
            process_legacy_remove_liquidity(program_id, accounts, lp_amount)
        }
        TestProjectInstruction::LegacySwap { amount_in, direction_a_to_b } => {
            process_legacy_swap(program_id, accounts, amount_in, direction_a_to_b)
        }
    }
}

fn process_create_pool(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    token_a: Pubkey,
    token_b: Pubkey,
    pool_type: PoolType,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let registry_info = next_account_info(account_info_iter)?;
    let user_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;
    let system_program_info = next_account_info(account_info_iter)?;
    let rent_info = next_account_info(account_info_iter)?;

    // Derive pool registry address and bump
    let (registry_pubkey, registry_bump) = Pubkey::find_program_address(
        &[POOL_REGISTRY_SEEDS, program_id.as_ref()],
        program_id,
    );

    if registry_pubkey != *registry_info.key {
        return Err(ProgramError::InvalidSeeds);
    }

    // Create new pool ID
    let new_pool_id = {
        let mut registry = PoolRegistry::unpack(&registry_info.data.borrow())?;
        let new_id = registry.next_pool_id;
        registry.next_pool_id += 1;
        registry.total_pools += 1;
        PoolRegistry::pack(registry, &mut registry_info.data.borrow_mut())?;
        new_id
    };

    // Derive pool address and bump
    let (pool_pubkey, bump) = Pubkey::find_program_address(
        &[b"pool", token_a.as_ref(), token_b.as_ref()],
        program_id,
    );

    // Create pool account
    let rent = Rent::from_account_info(rent_info)?;
    let space = Pool::LEN;
    let lamports = rent.minimum_balance(space);

    let pool_signer_seeds: &[&[_]] = &[
        b"pool",
        token_a.as_ref(),
        token_b.as_ref(),
        &[bump],
    ];

    invoke_signed(
        &system_instruction::create_account(
            user_info.key,
            &pool_pubkey,
            lamports,
            space as u64,
            program_id,
        ),
        &[
            user_info.clone(),
            system_program_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Initialize pool state
    let pool = Pool {
        pool_id: new_pool_id,
        pool_type: pool_type.clone(),
        token_a,
        token_b,
        bump,
        fee_rate: pool_type.default_fee_rate(),
        reserve_a: 0,
        reserve_b: 0,
        total_lp_supply: 0,
        created_at: solana_program::clock::Clock::get()?.unix_timestamp,
        is_active: true,
    };

    // We need to get the pool account info to pack the data
    // For now, let's return success as the pool creation is handled differently
    // The actual pool initialization will be done in a separate InitPool instruction

    Ok(())
}

fn process_init_pool(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    pool_id: u64,
    amount_a: u64,
    amount_b: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let pool_info = next_account_info(account_info_iter)?;
    let token_a_info = next_account_info(account_info_iter)?;
    let token_b_info = next_account_info(account_info_iter)?;
    let vault_a_info = next_account_info(account_info_iter)?;
    let vault_b_info = next_account_info(account_info_iter)?;
    let lp_mint_info = next_account_info(account_info_iter)?;
    let user_info = next_account_info(account_info_iter)?;
    let user_token_a_info = next_account_info(account_info_iter)?;
    let user_token_b_info = next_account_info(account_info_iter)?;
    let user_lp_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;
    let system_program_info = next_account_info(account_info_iter)?;
    let rent_info = next_account_info(account_info_iter)?;

    // Derive pool address and bump
    let (pool_pubkey, bump) = Pubkey::find_program_address(
        &[b"pool", token_a_info.key.as_ref(), token_b_info.key.as_ref()],
        program_id,
    );

    if pool_pubkey != *pool_info.key {
        return Err(ProgramError::InvalidSeeds);
    }

    // Create pool account
    let rent = Rent::from_account_info(rent_info)?;
    let space = Pool::LEN;
    let lamports = rent.minimum_balance(space);

    let pool_signer_seeds: &[&[_]] = &[
        b"pool",
        token_a_info.key.as_ref(),
        token_b_info.key.as_ref(),
        &[bump],
    ];

    invoke_signed(
        &system_instruction::create_account(
            user_info.key,
            pool_info.key,
            lamports,
            space as u64,
            program_id,
        ),
        &[
            user_info.clone(),
            pool_info.clone(),
            system_program_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Create vault accounts as regular accounts (not PDAs)
    // Create vault A account
    invoke_signed(
        &system_instruction::create_account(
            user_info.key,
            vault_a_info.key,
            rent.minimum_balance(165), // Token account size
            165,
            &Pubkey::from_str(GORBCHAIN_SPL_TOKEN_PROGRAM).unwrap(),
        ),
        &[
            user_info.clone(),
            vault_a_info.clone(),
            system_program_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Create vault B account
    invoke_signed(
        &system_instruction::create_account(
            user_info.key,
            vault_b_info.key,
            rent.minimum_balance(165), // Token account size
            165,
            &Pubkey::from_str(GORBCHAIN_SPL_TOKEN_PROGRAM).unwrap(),
        ),
        &[
            user_info.clone(),
            vault_b_info.clone(),
            system_program_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Initialize vault A as token account
    invoke_signed(
        &create_initialize_account_instruction(
            vault_a_info.key,
            token_a_info.key,
            pool_info.key, // Authority is pool
        ),
        &[
            vault_a_info.clone(),
            token_a_info.clone(),
            pool_info.clone(), // Pool is signer
            rent_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Initialize vault B as token account
    invoke_signed(
        &create_initialize_account_instruction(
            vault_b_info.key,
            token_b_info.key,
            pool_info.key, // Authority is pool
        ),
        &[
            vault_b_info.clone(),
            token_b_info.clone(),
            pool_info.clone(), // Pool is signer
            rent_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Transfer tokens to vaults
    invoke(
        &create_transfer_instruction(
            user_token_a_info.key,
            vault_a_info.key,
            user_info.key,
            amount_a,
        ),
        &[
            user_token_a_info.clone(),
            vault_a_info.clone(),
            user_info.clone(),
            token_program_info.clone(),
        ],
    )?;

    invoke(
        &create_transfer_instruction(
            user_token_b_info.key,
            vault_b_info.key,
            user_info.key,
            amount_b,
        ),
        &[
            user_token_b_info.clone(),
            vault_b_info.clone(),
            user_info.clone(),
            token_program_info.clone(),
        ],
    )?;

    // Calculate liquidity
    let liquidity: u64 = (amount_a as u128)
        .checked_mul(amount_b as u128)
        .unwrap()
        .integer_sqrt() as u64;

    // Mint LP tokens
    invoke_signed(
        &create_mint_to_instruction(
            lp_mint_info.key,
            user_lp_info.key,
            pool_info.key,
            liquidity,
        ),
        &[
            lp_mint_info.clone(),
            user_lp_info.clone(),
            pool_info.clone(),
            token_program_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Initialize pool state
    let pool = Pool {
        pool_id,
        pool_type: PoolType::Standard, // Default to Standard for now
        token_a: *token_a_info.key,
        token_b: *token_b_info.key,
        bump,
        fee_rate: 30, // Default fee rate
        reserve_a: amount_a,
        reserve_b: amount_b,
        total_lp_supply: liquidity,
        created_at: solana_program::clock::Clock::get()?.unix_timestamp,
        is_active: true,
    };

    Pool::pack(pool, &mut pool_info.data.borrow_mut())?;

    Ok(())
}

fn process_add_liquidity(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    pool_id: u64,
    amount_a: u64,
    amount_b: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let pool_info = next_account_info(account_info_iter)?;
    let token_a_info = next_account_info(account_info_iter)?;
    let token_b_info = next_account_info(account_info_iter)?;
    let vault_a_info = next_account_info(account_info_iter)?;
    let vault_b_info = next_account_info(account_info_iter)?;
    let lp_mint_info = next_account_info(account_info_iter)?;
    let user_token_a_info = next_account_info(account_info_iter)?;
    let user_token_b_info = next_account_info(account_info_iter)?;
    let user_lp_info = next_account_info(account_info_iter)?;
    let user_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;

    let mut pool = Pool::unpack(&pool_info.data.borrow())?;

    // Verify pool seeds
    let (pool_pubkey, _) = Pubkey::find_program_address(
        &[b"pool", token_a_info.key.as_ref(), token_b_info.key.as_ref()],
        program_id,
    );

    if pool_pubkey != *pool_info.key {
        return Err(ProgramError::InvalidSeeds);
    }

    let reserve_a = pool.reserve_a;
    let reserve_b = pool.reserve_b;
    let supply = pool.total_lp_supply;

    // Calculate final amounts maintaining ratio
    let (final_amount_a, final_amount_b) = if reserve_a > 0 && reserve_b > 0 {
        let required_b = (amount_a as u128)
            .checked_mul(reserve_b as u128).unwrap()
            .checked_div(reserve_a as u128).unwrap() as u64;
        if required_b <= amount_b {
            (amount_a, required_b)
        } else {
            let required_a = (amount_b as u128)
                .checked_mul(reserve_a as u128).unwrap()
                .checked_div(reserve_b as u128).unwrap() as u64;
            (required_a, amount_b)
        }
    } else {
        (amount_a, amount_b)
    };

    // Transfer tokens to vaults
    invoke(
        &create_transfer_instruction(
            user_token_a_info.key,
            vault_a_info.key,
            user_info.key,
            final_amount_a,
        ),
        &[
            user_token_a_info.clone(),
            vault_a_info.clone(),
            user_info.clone(),
            token_program_info.clone(),
        ],
    )?;

    invoke(
        &create_transfer_instruction(
            user_token_b_info.key,
            vault_b_info.key,
            user_info.key,
            final_amount_b,
        ),
        &[
            user_token_b_info.clone(),
            vault_b_info.clone(),
            user_info.clone(),
            token_program_info.clone(),
        ],
    )?;

    // Calculate liquidity to mint
    let liquidity = if supply == 0 {
        (final_amount_a as u128)
            .checked_mul(final_amount_b as u128).unwrap()
            .integer_sqrt() as u64
    } else {
        (final_amount_a as u128)
            .checked_mul(supply as u128).unwrap()
            .checked_div(reserve_a as u128).unwrap() as u64
    };

    // Mint LP tokens
    let pool_signer_seeds: &[&[_]] = &[
        b"pool",
        pool.token_a.as_ref(),
        pool.token_b.as_ref(),
        &[pool.bump],
    ];

    invoke_signed(
        &create_mint_to_instruction(
            lp_mint_info.key,
            user_lp_info.key,
            pool_info.key,
            liquidity,
        ),
        &[
            lp_mint_info.clone(),
            user_lp_info.clone(),
            pool_info.clone(),
            token_program_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Update pool state
    pool.reserve_a = pool.reserve_a.checked_add(final_amount_a).unwrap();
    pool.reserve_b = pool.reserve_b.checked_add(final_amount_b).unwrap();
    pool.total_lp_supply = pool.total_lp_supply.checked_add(liquidity).unwrap();

    Pool::pack(pool, &mut pool_info.data.borrow_mut())?;

    Ok(())
}

fn process_remove_liquidity(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    pool_id: u64,
    lp_amount: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let pool_info = next_account_info(account_info_iter)?;
    let token_a_info = next_account_info(account_info_iter)?;
    let token_b_info = next_account_info(account_info_iter)?;
    let vault_a_info = next_account_info(account_info_iter)?;
    let vault_b_info = next_account_info(account_info_iter)?;
    let lp_mint_info = next_account_info(account_info_iter)?;
    let user_lp_info = next_account_info(account_info_iter)?;
    let user_token_a_info = next_account_info(account_info_iter)?;
    let user_token_b_info = next_account_info(account_info_iter)?;
    let user_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;

    let mut pool = Pool::unpack(&pool_info.data.borrow())?;

    // Verify pool seeds
    let (pool_pubkey, _) = Pubkey::find_program_address(
        &[b"pool", token_a_info.key.as_ref(), token_b_info.key.as_ref()],
        program_id,
    );

    if pool_pubkey != *pool_info.key {
        return Err(ProgramError::InvalidSeeds);
    }

    let reserve_a = pool.reserve_a;
    let reserve_b = pool.reserve_b;
    let supply = pool.total_lp_supply;

    // Calculate amounts to withdraw
    let amount_a = (lp_amount as u128)
        .checked_mul(reserve_a as u128).unwrap()
        .checked_div(supply as u128).unwrap() as u64;
    let amount_b = (lp_amount as u128)
        .checked_mul(reserve_b as u128).unwrap()
        .checked_div(supply as u128).unwrap() as u64;

    // Burn LP tokens
    invoke(
        &create_burn_instruction(
            user_lp_info.key,
            lp_mint_info.key,
            user_info.key,
            lp_amount,
        ),
        &[
            user_lp_info.clone(),
            lp_mint_info.clone(),
            user_info.clone(),
            token_program_info.clone(),
        ],
    )?;

    // Transfer tokens from vaults to user
    let pool_signer_seeds: &[&[_]] = &[
        b"pool",
        pool.token_a.as_ref(),
        pool.token_b.as_ref(),
        &[pool.bump],
    ];

    invoke_signed(
        &create_transfer_instruction(
            vault_a_info.key,
            user_token_a_info.key,
            pool_info.key,
            amount_a,
        ),
        &[
            vault_a_info.clone(),
            user_token_a_info.clone(),
            pool_info.clone(),
            token_program_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    invoke_signed(
        &create_transfer_instruction(
            vault_b_info.key,
            user_token_b_info.key,
            pool_info.key,
            amount_b,
        ),
        &[
            vault_b_info.clone(),
            user_token_b_info.clone(),
            pool_info.clone(),
            token_program_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Update pool state
    pool.reserve_a = pool.reserve_a.checked_sub(amount_a).unwrap();
    pool.reserve_b = pool.reserve_b.checked_sub(amount_b).unwrap();
    pool.total_lp_supply = pool.total_lp_supply.checked_sub(lp_amount).unwrap();

    Pool::pack(pool, &mut pool_info.data.borrow_mut())?;

    Ok(())
}

fn process_swap(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    pool_id: u64,
    amount_in: u64,
    direction_a_to_b: bool,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let pool_info = next_account_info(account_info_iter)?;
    let token_a_info = next_account_info(account_info_iter)?;
    let token_b_info = next_account_info(account_info_iter)?;
    let vault_a_info = next_account_info(account_info_iter)?;
    let vault_b_info = next_account_info(account_info_iter)?;
    let user_in_info = next_account_info(account_info_iter)?;
    let user_out_info = next_account_info(account_info_iter)?;
    let user_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;

    let mut pool = Pool::unpack(&pool_info.data.borrow())?;

    // Verify pool seeds
    let (pool_pubkey, _) = Pubkey::find_program_address(
        &[b"pool", token_a_info.key.as_ref(), token_b_info.key.as_ref()],
        program_id,
    );

    if pool_pubkey != *pool_info.key {
        return Err(ProgramError::InvalidSeeds);
    }

    let (reserve_in, reserve_out) = if direction_a_to_b {
        (pool.reserve_a, pool.reserve_b)
    } else {
        (pool.reserve_b, pool.reserve_a)
    };

    // Transfer input tokens to vault
    if direction_a_to_b {
        invoke(
            &create_transfer_instruction(
                user_in_info.key,
                vault_a_info.key,
                user_info.key,
                amount_in,
            ),
            &[
                user_in_info.clone(),
                vault_a_info.clone(),
                user_info.clone(),
                token_program_info.clone(),
            ],
        )?;
    } else {
        invoke(
            &create_transfer_instruction(
                user_in_info.key,
                vault_b_info.key,
                user_info.key,
                amount_in,
            ),
            &[
                user_in_info.clone(),
                vault_b_info.clone(),
                user_info.clone(),
                token_program_info.clone(),
            ],
        )?;
    }

    // Calculate output amount (with 0.3% fee)
    let amount_in_with_fee = (amount_in as u128).checked_mul(997).unwrap();
    let numerator = amount_in_with_fee.checked_mul(reserve_out as u128).unwrap();
    let denominator = (reserve_in as u128)
        .checked_mul(1000).unwrap()
        .checked_add(amount_in_with_fee).unwrap();
    let amount_out = (numerator / denominator) as u64;

    // Transfer output tokens from vault to user
    let pool_signer_seeds: &[&[_]] = &[
        b"pool",
        pool.token_a.as_ref(),
        pool.token_b.as_ref(),
        &[pool.bump],
    ];

    if direction_a_to_b {
        invoke_signed(
            &create_transfer_instruction(
                vault_b_info.key,
                user_out_info.key,
                pool_info.key,
                amount_out,
            ),
            &[
                vault_b_info.clone(),
                user_out_info.clone(),
                pool_info.clone(),
                token_program_info.clone(),
            ],
            &[pool_signer_seeds],
        )?;
    } else {
        invoke_signed(
            &create_transfer_instruction(
                vault_a_info.key,
                user_out_info.key,
                pool_info.key,
                amount_out,
            ),
            &[
                vault_a_info.clone(),
                user_out_info.clone(),
                pool_info.clone(),
                token_program_info.clone(),
            ],
            &[pool_signer_seeds],
        )?;
    }

    // Update pool reserves
    if direction_a_to_b {
        pool.reserve_a = pool.reserve_a.checked_add(amount_in).unwrap();
        pool.reserve_b = pool.reserve_b.checked_sub(amount_out).unwrap();
    } else {
        pool.reserve_b = pool.reserve_b.checked_add(amount_in).unwrap();
        pool.reserve_a = pool.reserve_a.checked_sub(amount_out).unwrap();
    }

    Pool::pack(pool, &mut pool_info.data.borrow_mut())?;

    Ok(())
}

fn process_initialize_registry(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
    bump: u8,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let registry_info = next_account_info(account_info_iter)?;
    let user_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;
    let system_program_info = next_account_info(account_info_iter)?;
    let rent_info = next_account_info(account_info_iter)?;

    // Derive registry address and bump
    let (registry_pubkey, expected_bump) = Pubkey::find_program_address(
        &[POOL_REGISTRY_SEEDS, program_id.as_ref()],
        program_id,
    );

    if registry_pubkey != *registry_info.key {
        return Err(ProgramError::InvalidSeeds);
    }

    if bump != expected_bump {
        return Err(ProgramError::InvalidSeeds);
    }

    // Create registry account
    let rent = Rent::from_account_info(rent_info)?;
    let space = PoolRegistry::LEN;
    let lamports = rent.minimum_balance(space);

    let registry_signer_seeds: &[&[_]] = &[
        POOL_REGISTRY_SEEDS,
        program_id.as_ref(),
        &[bump],
    ];

    invoke_signed(
        &system_instruction::create_account(
            user_info.key,
            registry_info.key,
            lamports,
            space as u64,
            program_id,
        ),
        &[
            user_info.clone(),
            registry_info.clone(),
            system_program_info.clone(),
        ],
        &[registry_signer_seeds],
    )?;

    // Initialize registry state
    let registry = PoolRegistry {
        pools: Vec::new(),
        next_pool_id: 1, // Start from 1 for new pool IDs
        total_pools: 0,
        total_tvl: 0,
    };

    PoolRegistry::pack(registry, &mut registry_info.data.borrow_mut())?;

    Ok(())
}

fn process_list_pools(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let registry_info = next_account_info(account_info_iter)?;
    let user_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;

    let registry = PoolRegistry::unpack(&registry_info.data.borrow())?;

    // Serialize pools to return
    let mut pools_data = Vec::new();
    for pool_info in registry.pools {
        let mut pool_data = Vec::new();
        pool_info.pack(&mut pool_data);
        pools_data.push(pool_data);
    }

    // Return the serialized pools
    Ok(())
}

fn process_get_pool_info(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    pool_id: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let registry_info = next_account_info(account_info_iter)?;
    let user_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;

    let registry = PoolRegistry::unpack(&registry_info.data.borrow())?;

    // Find the pool by ID
    let pool_info = registry.pools.iter()
        .find(|p| p.pool_id == pool_id)
        .ok_or(ProgramError::InvalidAccountData)?;

    // Serialize pool info to return
    let mut pool_data = Vec::new();
    pool_info.pack(&mut pool_data);

    // Return the serialized pool info
    Ok(())
}

fn process_update_pool_fee(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    pool_id: u64,
    new_fee_rate: u16,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let registry_info = next_account_info(account_info_iter)?;
    let user_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;

    let mut registry = PoolRegistry::unpack(&registry_info.data.borrow())?;

    // Find the pool by ID
    let pool_info = registry.pools.iter_mut()
        .find(|p| p.pool_id == pool_id)
        .ok_or(ProgramError::InvalidAccountData)?;

    // Update fee rate
    pool_info.fee_rate = new_fee_rate;

    // Re-pack and update
    PoolRegistry::pack(registry, &mut registry_info.data.borrow_mut())?;

    Ok(())
}

fn process_deactivate_pool(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    pool_id: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let registry_info = next_account_info(account_info_iter)?;
    let user_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;

    let mut registry = PoolRegistry::unpack(&registry_info.data.borrow())?;

    // Find the pool by ID
    let pool_info = registry.pools.iter_mut()
        .find(|p| p.pool_id == pool_id)
        .ok_or(ProgramError::InvalidAccountData)?;

    // Deactivate pool
    pool_info.is_active = false;

    // Re-pack and update
    PoolRegistry::pack(registry, &mut registry_info.data.borrow_mut())?;

    Ok(())
}

fn process_legacy_init_pool(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount_a: u64,
    amount_b: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let pool_info = next_account_info(account_info_iter)?;
    let token_a_info = next_account_info(account_info_iter)?;
    let token_b_info = next_account_info(account_info_iter)?;
    let vault_a_info = next_account_info(account_info_iter)?;
    let vault_b_info = next_account_info(account_info_iter)?;
    let lp_mint_info = next_account_info(account_info_iter)?;
    let user_info = next_account_info(account_info_iter)?;
    let user_token_a_info = next_account_info(account_info_iter)?;
    let user_token_b_info = next_account_info(account_info_iter)?;
    let user_lp_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;
    let system_program_info = next_account_info(account_info_iter)?;
    let rent_info = next_account_info(account_info_iter)?;

    // Derive pool address and bump
    let (pool_pubkey, bump) = Pubkey::find_program_address(
        &[b"pool", token_a_info.key.as_ref(), token_b_info.key.as_ref()],
        program_id,
    );

    if pool_pubkey != *pool_info.key {
        return Err(ProgramError::InvalidSeeds);
    }

    // Create pool account
    let rent = Rent::from_account_info(rent_info)?;
    let space = Pool::LEN;
    let lamports = rent.minimum_balance(space);

    let pool_signer_seeds: &[&[_]] = &[
        b"pool",
        token_a_info.key.as_ref(),
        token_b_info.key.as_ref(),
        &[bump],
    ];

    invoke_signed(
        &system_instruction::create_account(
            user_info.key,
            pool_info.key,
            lamports,
            space as u64,
            program_id,
        ),
        &[
            user_info.clone(),
            pool_info.clone(),
            system_program_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Create vault accounts as regular accounts (not PDAs)
    // Create vault A account
    invoke_signed(
        &system_instruction::create_account(
            user_info.key,
            vault_a_info.key,
            rent.minimum_balance(165), // Token account size
            165,
            &Pubkey::from_str(GORBCHAIN_SPL_TOKEN_PROGRAM).unwrap(),
        ),
        &[
            user_info.clone(),
            vault_a_info.clone(),
            system_program_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Create vault B account
    invoke_signed(
        &system_instruction::create_account(
            user_info.key,
            vault_b_info.key,
            rent.minimum_balance(165), // Token account size
            165,
            &Pubkey::from_str(GORBCHAIN_SPL_TOKEN_PROGRAM).unwrap(),
        ),
        &[
            user_info.clone(),
            vault_b_info.clone(),
            system_program_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Initialize vault A as token account
    invoke_signed(
        &create_initialize_account_instruction(
            vault_a_info.key,
            token_a_info.key,
            pool_info.key, // Authority is pool
        ),
        &[
            vault_a_info.clone(),
            token_a_info.clone(),
            pool_info.clone(), // Pool is signer
            rent_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Initialize vault B as token account
    invoke_signed(
        &create_initialize_account_instruction(
            vault_b_info.key,
            token_b_info.key,
            pool_info.key, // Authority is pool
        ),
        &[
            vault_b_info.clone(),
            token_b_info.clone(),
            pool_info.clone(), // Pool is signer
            rent_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Transfer tokens to vaults
    invoke(
        &create_transfer_instruction(
            user_token_a_info.key,
            vault_a_info.key,
            user_info.key,
            amount_a,
        ),
        &[
            user_token_a_info.clone(),
            vault_a_info.clone(),
            user_info.clone(),
            token_program_info.clone(),
        ],
    )?;

    invoke(
        &create_transfer_instruction(
            user_token_b_info.key,
            vault_b_info.key,
            user_info.key,
            amount_b,
        ),
        &[
            user_token_b_info.clone(),
            vault_b_info.clone(),
            user_info.clone(),
            token_program_info.clone(),
        ],
    )?;

    // Calculate liquidity
    let liquidity: u64 = (amount_a as u128)
        .checked_mul(amount_b as u128)
        .unwrap()
        .integer_sqrt() as u64;

    // Mint LP tokens
    invoke_signed(
        &create_mint_to_instruction(
            lp_mint_info.key,
            user_lp_info.key,
            pool_info.key,
            liquidity,
        ),
        &[
            lp_mint_info.clone(),
            user_lp_info.clone(),
            pool_info.clone(),
            token_program_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Initialize pool state
    let pool = Pool {
        pool_id: 0, // Legacy pools don't have a global ID, so we'll set it to 0
        pool_type: PoolType::Standard,
        token_a: *token_a_info.key,
        token_b: *token_b_info.key,
        bump,
        fee_rate: 30,
        reserve_a: amount_a,
        reserve_b: amount_b,
        total_lp_supply: liquidity,
        created_at: solana_program::clock::Clock::get()?.unix_timestamp,
        is_active: true,
    };

    Pool::pack(pool, &mut pool_info.data.borrow_mut())?;

    Ok(())
}

fn process_legacy_add_liquidity(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount_a: u64,
    amount_b: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let pool_info = next_account_info(account_info_iter)?;
    let token_a_info = next_account_info(account_info_iter)?;
    let token_b_info = next_account_info(account_info_iter)?;
    let vault_a_info = next_account_info(account_info_iter)?;
    let vault_b_info = next_account_info(account_info_iter)?;
    let lp_mint_info = next_account_info(account_info_iter)?;
    let user_token_a_info = next_account_info(account_info_iter)?;
    let user_token_b_info = next_account_info(account_info_iter)?;
    let user_lp_info = next_account_info(account_info_iter)?;
    let user_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;

    let mut pool = Pool::unpack(&pool_info.data.borrow())?;

    // Verify pool seeds
    let (pool_pubkey, _) = Pubkey::find_program_address(
        &[b"pool", token_a_info.key.as_ref(), token_b_info.key.as_ref()],
        program_id,
    );

    if pool_pubkey != *pool_info.key {
        return Err(ProgramError::InvalidSeeds);
    }

    let reserve_a = pool.reserve_a;
    let reserve_b = pool.reserve_b;
    let supply = pool.total_lp_supply;

    // Calculate final amounts maintaining ratio
    let (final_amount_a, final_amount_b) = if reserve_a > 0 && reserve_b > 0 {
        let required_b = (amount_a as u128)
            .checked_mul(reserve_b as u128).unwrap()
            .checked_div(reserve_a as u128).unwrap() as u64;
        if required_b <= amount_b {
            (amount_a, required_b)
        } else {
            let required_a = (amount_b as u128)
                .checked_mul(reserve_a as u128).unwrap()
                .checked_div(reserve_b as u128).unwrap() as u64;
            (required_a, amount_b)
        }
    } else {
        (amount_a, amount_b)
    };

    // Transfer tokens to vaults
    invoke(
        &create_transfer_instruction(
            user_token_a_info.key,
            vault_a_info.key,
            user_info.key,
            final_amount_a,
        ),
        &[
            user_token_a_info.clone(),
            vault_a_info.clone(),
            user_info.clone(),
            token_program_info.clone(),
        ],
    )?;

    invoke(
        &create_transfer_instruction(
            user_token_b_info.key,
            vault_b_info.key,
            user_info.key,
            final_amount_b,
        ),
        &[
            user_token_b_info.clone(),
            vault_b_info.clone(),
            user_info.clone(),
            token_program_info.clone(),
        ],
    )?;

    // Calculate liquidity to mint
    let liquidity = if supply == 0 {
        (final_amount_a as u128)
            .checked_mul(final_amount_b as u128).unwrap()
            .integer_sqrt() as u64
    } else {
        (final_amount_a as u128)
            .checked_mul(supply as u128).unwrap()
            .checked_div(reserve_a as u128).unwrap() as u64
    };

    // Mint LP tokens
    let pool_signer_seeds: &[&[_]] = &[
        b"pool",
        pool.token_a.as_ref(),
        pool.token_b.as_ref(),
        &[pool.bump],
    ];

    invoke_signed(
        &create_mint_to_instruction(
            lp_mint_info.key,
            user_lp_info.key,
            pool_info.key,
            liquidity,
        ),
        &[
            lp_mint_info.clone(),
            user_lp_info.clone(),
            pool_info.clone(),
            token_program_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Update pool state
    pool.reserve_a = pool.reserve_a.checked_add(final_amount_a).unwrap();
    pool.reserve_b = pool.reserve_b.checked_add(final_amount_b).unwrap();
    pool.total_lp_supply = pool.total_lp_supply.checked_add(liquidity).unwrap();

    Pool::pack(pool, &mut pool_info.data.borrow_mut())?;

    Ok(())
}

fn process_legacy_remove_liquidity(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    lp_amount: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let pool_info = next_account_info(account_info_iter)?;
    let token_a_info = next_account_info(account_info_iter)?;
    let token_b_info = next_account_info(account_info_iter)?;
    let vault_a_info = next_account_info(account_info_iter)?;
    let vault_b_info = next_account_info(account_info_iter)?;
    let lp_mint_info = next_account_info(account_info_iter)?;
    let user_lp_info = next_account_info(account_info_iter)?;
    let user_token_a_info = next_account_info(account_info_iter)?;
    let user_token_b_info = next_account_info(account_info_iter)?;
    let user_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;

    let mut pool = Pool::unpack(&pool_info.data.borrow())?;

    // Verify pool seeds
    let (pool_pubkey, _) = Pubkey::find_program_address(
        &[b"pool", token_a_info.key.as_ref(), token_b_info.key.as_ref()],
        program_id,
    );

    if pool_pubkey != *pool_info.key {
        return Err(ProgramError::InvalidSeeds);
    }

    let reserve_a = pool.reserve_a;
    let reserve_b = pool.reserve_b;
    let supply = pool.total_lp_supply;

    // Calculate amounts to withdraw
    let amount_a = (lp_amount as u128)
        .checked_mul(reserve_a as u128).unwrap()
        .checked_div(supply as u128).unwrap() as u64;
    let amount_b = (lp_amount as u128)
        .checked_mul(reserve_b as u128).unwrap()
        .checked_div(supply as u128).unwrap() as u64;

    // Burn LP tokens
    invoke(
        &create_burn_instruction(
            user_lp_info.key,
            lp_mint_info.key,
            user_info.key,
            lp_amount,
        ),
        &[
            user_lp_info.clone(),
            lp_mint_info.clone(),
            user_info.clone(),
            token_program_info.clone(),
        ],
    )?;

    // Transfer tokens from vaults to user
    let pool_signer_seeds: &[&[_]] = &[
        b"pool",
        pool.token_a.as_ref(),
        pool.token_b.as_ref(),
        &[pool.bump],
    ];

    invoke_signed(
        &create_transfer_instruction(
            vault_a_info.key,
            user_token_a_info.key,
            pool_info.key,
            amount_a,
        ),
        &[
            vault_a_info.clone(),
            user_token_a_info.clone(),
            pool_info.clone(),
            token_program_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    invoke_signed(
        &create_transfer_instruction(
            vault_b_info.key,
            user_token_b_info.key,
            pool_info.key,
            amount_b,
        ),
        &[
            vault_b_info.clone(),
            user_token_b_info.clone(),
            pool_info.clone(),
            token_program_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Update pool state
    pool.reserve_a = pool.reserve_a.checked_sub(amount_a).unwrap();
    pool.reserve_b = pool.reserve_b.checked_sub(amount_b).unwrap();
    pool.total_lp_supply = pool.total_lp_supply.checked_sub(lp_amount).unwrap();

    Pool::pack(pool, &mut pool_info.data.borrow_mut())?;

    Ok(())
}

fn process_legacy_swap(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount_in: u64,
    direction_a_to_b: bool,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let pool_info = next_account_info(account_info_iter)?;
    let token_a_info = next_account_info(account_info_iter)?;
    let token_b_info = next_account_info(account_info_iter)?;
    let vault_a_info = next_account_info(account_info_iter)?;
    let vault_b_info = next_account_info(account_info_iter)?;
    let user_in_info = next_account_info(account_info_iter)?;
    let user_out_info = next_account_info(account_info_iter)?;
    let user_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;

    let mut pool = Pool::unpack(&pool_info.data.borrow())?;

    // Verify pool seeds
    let (pool_pubkey, _) = Pubkey::find_program_address(
        &[b"pool", token_a_info.key.as_ref(), token_b_info.key.as_ref()],
        program_id,
    );

    if pool_pubkey != *pool_info.key {
        return Err(ProgramError::InvalidSeeds);
    }

    let (reserve_in, reserve_out) = if direction_a_to_b {
        (pool.reserve_a, pool.reserve_b)
    } else {
        (pool.reserve_b, pool.reserve_a)
    };

    // Transfer input tokens to vault
    if direction_a_to_b {
        invoke(
            &create_transfer_instruction(
                user_in_info.key,
                vault_a_info.key,
                user_info.key,
                amount_in,
            ),
            &[
                user_in_info.clone(),
                vault_a_info.clone(),
                user_info.clone(),
                token_program_info.clone(),
            ],
        )?;
    } else {
        invoke(
            &create_transfer_instruction(
                user_in_info.key,
                vault_b_info.key,
                user_info.key,
                amount_in,
            ),
            &[
                user_in_info.clone(),
                vault_b_info.clone(),
                user_info.clone(),
                token_program_info.clone(),
            ],
        )?;
    }

    // Calculate output amount (with 0.3% fee)
    let amount_in_with_fee = (amount_in as u128).checked_mul(997).unwrap();
    let numerator = amount_in_with_fee.checked_mul(reserve_out as u128).unwrap();
    let denominator = (reserve_in as u128)
        .checked_mul(1000).unwrap()
        .checked_add(amount_in_with_fee).unwrap();
    let amount_out = (numerator / denominator) as u64;

    // Transfer output tokens from vault to user
    let pool_signer_seeds: &[&[_]] = &[
        b"pool",
        pool.token_a.as_ref(),
        pool.token_b.as_ref(),
        &[pool.bump],
    ];

    if direction_a_to_b {
        invoke_signed(
            &create_transfer_instruction(
                vault_b_info.key,
                user_out_info.key,
                pool_info.key,
                amount_out,
            ),
            &[
                vault_b_info.clone(),
                user_out_info.clone(),
                pool_info.clone(),
                token_program_info.clone(),
            ],
            &[pool_signer_seeds],
        )?;
    } else {
        invoke_signed(
            &create_transfer_instruction(
                vault_a_info.key,
                user_out_info.key,
                pool_info.key,
                amount_out,
            ),
            &[
                vault_a_info.clone(),
                user_out_info.clone(),
                pool_info.clone(),
                token_program_info.clone(),
            ],
            &[pool_signer_seeds],
        )?;
    }

    // Update pool reserves
    if direction_a_to_b {
        pool.reserve_a = pool.reserve_a.checked_add(amount_in).unwrap();
        pool.reserve_b = pool.reserve_b.checked_sub(amount_out).unwrap();
    } else {
        pool.reserve_b = pool.reserve_b.checked_add(amount_in).unwrap();
        pool.reserve_a = pool.reserve_a.checked_sub(amount_out).unwrap();
    }

    Pool::pack(pool, &mut pool_info.data.borrow_mut())?;

    Ok(())
}

// Integer square root implementation for u128
trait IntegerSqrt {
    fn integer_sqrt(self) -> Self;
}

impl IntegerSqrt for u128 {
    fn integer_sqrt(self) -> Self {
        if self < 2 {
            return self;
        }
        let mut x = self;
        let mut y = (self + 1) / 2;
        while y < x {
            x = y;
            y = (x + self / x) / 2;
        }
        x
    }
}