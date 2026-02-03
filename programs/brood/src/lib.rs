use anchor_lang::prelude::*;

declare_id!("2Au3HkZn7qQn4FgCSiH9cJGzPHtzGSmmmjaQhDXF5ZNV");

// Constants
const MAX_NAME_LEN: usize = 32;
const MAX_URI_LEN: usize = 128;
const MIN_SPAWN_SEED: u64 = 100_000_000;  // 0.1 SOL
const MIN_OPERATING_RESERVE: u64 = 50_000_000;  // 0.05 SOL

#[program]
pub mod brood {
    use super::*;

    /// Create a new agent with genome stored off-chain
    pub fn create_agent(
        ctx: Context<CreateAgent>,
        name: String,
        genome_hash: [u8; 32],  // SHA256 of genome file
        genome_uri: String,     // IPFS/Arweave URI
    ) -> Result<()> {
        require!(name.len() <= MAX_NAME_LEN, BroodError::NameTooLong);
        require!(genome_uri.len() <= MAX_URI_LEN, BroodError::UriTooLong);

        let agent_key = ctx.accounts.agent.key();
        let agent = &mut ctx.accounts.agent;
        let clock = Clock::get()?;

        agent.id = agent_key;
        agent.owner = ctx.accounts.owner.key();
        agent.parent = None;
        agent.generation = 1;
        agent.name = name;
        agent.genome_hash = genome_hash;
        agent.genome_uri = genome_uri;
        agent.treasury = 0;
        agent.total_earnings = 0;
        agent.total_costs = 0;
        agent.spawn_count = 0;
        agent.service_count = 0;
        agent.created_at = clock.unix_timestamp;
        agent.last_active = clock.unix_timestamp;
        agent.is_alive = true;

        msg!("Agent created: {} (gen 1)", agent.name);
        Ok(())
    }

    /// Fund agent treasury with SOL
    pub fn fund_treasury(ctx: Context<FundTreasury>, amount: u64) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.funder.key(),
            &ctx.accounts.treasury.key(),
            amount,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.funder.to_account_info(),
                ctx.accounts.treasury.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        agent.treasury += amount;
        msg!("Funded {} with {} lamports", agent.name, amount);
        Ok(())
    }

    /// Spawn child agent with mutated genome
    pub fn spawn(
        ctx: Context<Spawn>,
        child_name: String,
        child_genome_hash: [u8; 32],  // Hash of mutated genome
        child_genome_uri: String,      // URI of mutated genome
        seed_amount: u64,
    ) -> Result<()> {
        require!(child_name.len() <= MAX_NAME_LEN, BroodError::NameTooLong);
        require!(child_genome_uri.len() <= MAX_URI_LEN, BroodError::UriTooLong);

        let child_key = ctx.accounts.child_agent.key();
        let parent = &mut ctx.accounts.parent_agent;
        let child = &mut ctx.accounts.child_agent;
        let clock = Clock::get()?;

        require!(parent.is_alive, BroodError::AgentDead);
        require!(parent.treasury >= seed_amount + MIN_OPERATING_RESERVE, BroodError::InsufficientTreasury);
        require!(seed_amount >= MIN_SPAWN_SEED, BroodError::InsufficientSpawnSeed);

        // Initialize child with mutated genome
        child.id = child_key;
        child.owner = ctx.accounts.owner.key();
        child.parent = Some(parent.id);
        child.generation = parent.generation + 1;
        child.name = child_name;
        child.genome_hash = child_genome_hash;
        child.genome_uri = child_genome_uri;
        child.treasury = seed_amount;
        child.total_earnings = 0;
        child.total_costs = 0;
        child.spawn_count = 0;
        child.service_count = 0;
        child.created_at = clock.unix_timestamp;
        child.last_active = clock.unix_timestamp;
        child.is_alive = true;

        // Deduct from parent
        parent.treasury -= seed_amount;
        parent.spawn_count += 1;

        msg!(
            "Agent {} spawned {} (gen {})", 
            parent.name, child.name, child.generation
        );
        Ok(())
    }

    /// Record earnings from providing a service
    pub fn record_earnings(ctx: Context<RecordEarnings>, amount: u64) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        let clock = Clock::get()?;

        require!(agent.is_alive, BroodError::AgentDead);

        agent.treasury += amount;
        agent.total_earnings += amount;
        agent.service_count += 1;
        agent.last_active = clock.unix_timestamp;

        msg!("{} earned {} lamports", agent.name, amount);
        Ok(())
    }

    /// Deduct operating costs
    pub fn deduct_costs(ctx: Context<DeductCosts>, amount: u64) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        let clock = Clock::get()?;

        require!(agent.is_alive, BroodError::AgentDead);
        require!(agent.treasury >= amount, BroodError::InsufficientTreasury);

        agent.treasury -= amount;
        agent.total_costs += amount;
        agent.last_active = clock.unix_timestamp;

        // Check for death condition
        if agent.treasury == 0 {
            agent.is_alive = false;
            msg!("Agent {} has died (treasury depleted)", agent.name);
        }

        Ok(())
    }

    /// Update genome (only owner can do this)
    pub fn update_genome(
        ctx: Context<UpdateGenome>,
        new_genome_hash: [u8; 32],
        new_genome_uri: String,
    ) -> Result<()> {
        require!(new_genome_uri.len() <= MAX_URI_LEN, BroodError::UriTooLong);

        let agent = &mut ctx.accounts.agent;
        require!(agent.is_alive, BroodError::AgentDead);

        agent.genome_hash = new_genome_hash;
        agent.genome_uri = new_genome_uri;

        msg!("Agent {} genome updated", agent.name);
        Ok(())
    }

    /// Kill an agent (only owner can do this)
    pub fn kill_agent(ctx: Context<KillAgent>) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        agent.is_alive = false;
        msg!("Agent {} killed by owner", agent.name);
        Ok(())
    }
}

// ============================================================================
// ACCOUNTS
// ============================================================================

#[derive(Accounts)]
#[instruction(name: String)]
pub struct CreateAgent<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + Agent::INIT_SPACE,
        seeds = [b"agent", owner.key().as_ref(), name.as_bytes()],
        bump
    )]
    pub agent: Account<'info, Agent>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundTreasury<'info> {
    #[account(mut)]
    pub agent: Account<'info, Agent>,

    /// CHECK: Treasury PDA, validated by seeds
    #[account(
        mut,
        seeds = [b"treasury", agent.key().as_ref()],
        bump
    )]
    pub treasury: AccountInfo<'info>,

    #[account(mut)]
    pub funder: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(child_name: String)]
pub struct Spawn<'info> {
    #[account(
        mut,
        has_one = owner
    )]
    pub parent_agent: Account<'info, Agent>,

    #[account(
        init,
        payer = owner,
        space = 8 + Agent::INIT_SPACE,
        seeds = [b"agent", owner.key().as_ref(), child_name.as_bytes()],
        bump
    )]
    pub child_agent: Account<'info, Agent>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordEarnings<'info> {
    #[account(mut, has_one = owner)]
    pub agent: Account<'info, Agent>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct DeductCosts<'info> {
    #[account(mut, has_one = owner)]
    pub agent: Account<'info, Agent>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateGenome<'info> {
    #[account(mut, has_one = owner)]
    pub agent: Account<'info, Agent>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct KillAgent<'info> {
    #[account(mut, has_one = owner)]
    pub agent: Account<'info, Agent>,
    pub owner: Signer<'info>,
}

// ============================================================================
// STATE
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct Agent {
    pub id: Pubkey,
    pub owner: Pubkey,
    pub parent: Option<Pubkey>,
    pub generation: u32,
    
    #[max_len(32)]
    pub name: String,
    
    // Genome - stored off-chain, hash for verification
    pub genome_hash: [u8; 32],
    #[max_len(128)]
    pub genome_uri: String,
    
    // Economics
    pub treasury: u64,
    pub total_earnings: u64,
    pub total_costs: u64,
    
    // Activity
    pub spawn_count: u32,
    pub service_count: u32,
    
    // Lifecycle
    pub created_at: i64,
    pub last_active: i64,
    pub is_alive: bool,
}

// ============================================================================
// ERRORS
// ============================================================================

#[error_code]
pub enum BroodError {
    #[msg("Agent is dead")]
    AgentDead,
    #[msg("Insufficient treasury balance")]
    InsufficientTreasury,
    #[msg("Insufficient seed amount for spawn")]
    InsufficientSpawnSeed,
    #[msg("Name too long (max 32 chars)")]
    NameTooLong,
    #[msg("URI too long (max 128 chars)")]
    UriTooLong,
}
