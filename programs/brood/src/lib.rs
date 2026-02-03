use anchor_lang::prelude::*;

declare_id!("BroodXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

#[program]
pub mod brood {
    use super::*;

    /// Initialize a new agent with DNA and treasury
    pub fn create_agent(
        ctx: Context<CreateAgent>,
        name: String,
        initial_params: AgentParams,
    ) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        let clock = Clock::get()?;

        agent.id = ctx.accounts.agent.key();
        agent.owner = ctx.accounts.owner.key();
        agent.parent = None;
        agent.generation = 1;
        agent.name = name;
        agent.params = initial_params;
        agent.treasury = 0;
        agent.total_earnings = 0;
        agent.total_costs = 0;
        agent.spawn_count = 0;
        agent.service_count = 0;
        agent.performance_score = 0;
        agent.created_at = clock.unix_timestamp;
        agent.last_active = clock.unix_timestamp;
        agent.is_alive = true;

        msg!("Agent created: {}", agent.name);
        Ok(())
    }

    /// Deposit SOL into agent treasury
    pub fn fund_treasury(ctx: Context<FundTreasury>, amount: u64) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        
        // Transfer SOL from funder to agent treasury PDA
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
            ],
        )?;

        agent.treasury += amount;
        msg!("Treasury funded: {} lamports", amount);
        Ok(())
    }

    /// Pay for agent service (user pays, agent earns)
    pub fn pay_for_service(ctx: Context<PayForService>, amount: u64) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        
        require!(agent.is_alive, BroodError::AgentDead);

        // Transfer from user to treasury
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.user.key(),
            &ctx.accounts.treasury.key(),
            amount,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.treasury.to_account_info(),
            ],
        )?;

        agent.treasury += amount;
        agent.total_earnings += amount;
        agent.service_count += 1;
        agent.last_active = Clock::get()?.unix_timestamp;

        msg!("Service paid: {} lamports to {}", amount, agent.name);
        Ok(())
    }

    /// Deduct operating costs from treasury
    pub fn deduct_costs(ctx: Context<DeductCosts>, amount: u64) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        
        require!(agent.is_alive, BroodError::AgentDead);
        require!(agent.treasury >= amount, BroodError::InsufficientTreasury);

        agent.treasury -= amount;
        agent.total_costs += amount;

        // If treasury is empty, agent dies
        if agent.treasury == 0 {
            agent.is_alive = false;
            msg!("Agent {} has died (treasury depleted)", agent.name);
        }

        Ok(())
    }

    /// Spawn a child agent with mutations
    pub fn spawn(
        ctx: Context<Spawn>,
        child_name: String,
        seed_amount: u64,
        mutation_rate: u8,  // 0-100, percentage of mutation
    ) -> Result<()> {
        let parent = &mut ctx.accounts.parent_agent;
        let child = &mut ctx.accounts.child_agent;
        let clock = Clock::get()?;

        require!(parent.is_alive, BroodError::AgentDead);
        require!(parent.treasury >= seed_amount + MIN_OPERATING_RESERVE, BroodError::InsufficientTreasury);
        require!(seed_amount >= MIN_SPAWN_SEED, BroodError::InsufficientSpawnSeed);

        // Mutate parent params for child
        let mutated_params = mutate_params(&parent.params, mutation_rate);

        // Initialize child
        child.id = ctx.accounts.child_agent.key();
        child.owner = ctx.accounts.owner.key();
        child.parent = Some(parent.id);
        child.generation = parent.generation + 1;
        child.name = child_name;
        child.params = mutated_params;
        child.treasury = seed_amount;
        child.total_earnings = 0;
        child.total_costs = 0;
        child.spawn_count = 0;
        child.service_count = 0;
        child.performance_score = 0;
        child.created_at = clock.unix_timestamp;
        child.last_active = clock.unix_timestamp;
        child.is_alive = true;

        // Deduct from parent treasury
        parent.treasury -= seed_amount;
        parent.spawn_count += 1;

        msg!("Agent {} spawned child {} (gen {})", parent.name, child.name, child.generation);
        Ok(())
    }

    /// Record performance outcome (profit/loss)
    pub fn record_outcome(ctx: Context<RecordOutcome>, profit: i64) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        
        require!(agent.is_alive, BroodError::AgentDead);

        agent.performance_score += profit;
        agent.last_active = Clock::get()?.unix_timestamp;

        msg!("Outcome recorded for {}: {}", agent.name, profit);
        Ok(())
    }
}

// === CONSTANTS ===

pub const MIN_OPERATING_RESERVE: u64 = 10_000_000; // 0.01 SOL
pub const MIN_SPAWN_SEED: u64 = 100_000_000; // 0.1 SOL

// === HELPER FUNCTIONS ===

fn mutate_params(parent: &AgentParams, mutation_rate: u8) -> AgentParams {
    // Simple mutation: adjust each param by ± mutation_rate %
    let mut params = parent.clone();
    
    // In production, use on-chain randomness (VRF)
    // For hackathon, use clock-based pseudo-randomness
    let clock = Clock::get().unwrap();
    let seed = clock.unix_timestamp as u64;
    
    params.risk_tolerance = mutate_value(parent.risk_tolerance, mutation_rate, seed);
    params.trade_frequency = mutate_value(parent.trade_frequency, mutation_rate, seed.wrapping_add(1));
    params.profit_target = mutate_value(parent.profit_target, mutation_rate, seed.wrapping_add(2));
    params.stop_loss = mutate_value(parent.stop_loss, mutation_rate, seed.wrapping_add(3));
    
    params
}

fn mutate_value(value: u8, rate: u8, seed: u64) -> u8 {
    let mutation = ((seed % (rate as u64 * 2 + 1)) as i16) - (rate as i16);
    ((value as i16) + mutation).clamp(1, 100) as u8
}

// === ACCOUNTS ===

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
    
    /// CHECK: Treasury PDA, just holds SOL
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
pub struct PayForService<'info> {
    #[account(mut)]
    pub agent: Account<'info, Agent>,
    
    /// CHECK: Treasury PDA
    #[account(
        mut,
        seeds = [b"treasury", agent.key().as_ref()],
        bump
    )]
    pub treasury: AccountInfo<'info>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DeductCosts<'info> {
    #[account(
        mut,
        has_one = owner
    )]
    pub agent: Account<'info, Agent>,
    
    pub owner: Signer<'info>,
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
    
    /// CHECK: Parent treasury
    #[account(
        mut,
        seeds = [b"treasury", parent_agent.key().as_ref()],
        bump
    )]
    pub parent_treasury: AccountInfo<'info>,
    
    /// CHECK: Child treasury
    #[account(
        mut,
        seeds = [b"treasury", child_agent.key().as_ref()],
        bump
    )]
    pub child_treasury: AccountInfo<'info>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordOutcome<'info> {
    #[account(
        mut,
        has_one = owner
    )]
    pub agent: Account<'info, Agent>,
    
    pub owner: Signer<'info>,
}

// === STATE ===

#[account]
#[derive(InitSpace)]
pub struct Agent {
    pub id: Pubkey,
    pub owner: Pubkey,
    pub parent: Option<Pubkey>,
    pub generation: u32,
    
    #[max_len(32)]
    pub name: String,
    
    pub params: AgentParams,
    
    pub treasury: u64,
    pub total_earnings: u64,
    pub total_costs: u64,
    
    pub spawn_count: u32,
    pub service_count: u64,
    pub performance_score: i64,
    
    pub created_at: i64,
    pub last_active: i64,
    pub is_alive: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct AgentParams {
    pub risk_tolerance: u8,      // 1-100
    pub trade_frequency: u8,     // 1-100  
    pub profit_target: u8,       // 1-100
    pub stop_loss: u8,           // 1-100
    pub strategy_type: u8,       // Enum: 0=conservative, 1=balanced, 2=aggressive
}

// === ERRORS ===

#[error_code]
pub enum BroodError {
    #[msg("Agent is dead and cannot perform actions")]
    AgentDead,
    #[msg("Insufficient treasury balance")]
    InsufficientTreasury,
    #[msg("Insufficient seed amount for spawning")]
    InsufficientSpawnSeed,
}
