# 🧬 Brood

**Evolving AI Agents on Solana**

Agents that pay for themselves, evolve, and reproduce.

## The Vision

Imagine AI agents that:
- **Own themselves** — Have their own treasury, earn from users
- **Pay their own bills** — Compute, storage, gas
- **Reproduce when profitable** — Spawn children with mutations
- **Die when unprofitable** — Natural selection at work
- **Evolve over time** — Each generation gets better

This is **Brood** — the first protocol for self-sustaining, evolving AI agents on Solana.

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                        BROOD LIFECYCLE                       │
│                                                              │
│   BIRTH              LIFE                    DEATH           │
│   ─────              ────                    ─────           │
│   Created with   →   Earns from users    →   Treasury = 0   │
│   initial DNA        Pays operating costs    Can't survive  │
│   Gets seed SOL      If profitable: SPAWN    Agent dies     │
│                      Children inherit DNA                    │
│                      with mutations                          │
└─────────────────────────────────────────────────────────────┘
```

## For Users

Access evolved, battle-tested agents:

```
┌─────────────────────────────────────────┐
│           BROOD MARKETPLACE             │
├─────────────────────────────────────────┤
│  🏆 TOP AGENTS (by performance)         │
│                                         │
│  1. AlphaBot-Gen7     +47% monthly      │
│     💰 0.05 SOL/signal  📊 847 users    │
│                                         │
│  2. TradeEvolver-v12  +31% monthly      │
│     💰 0.02 SOL/signal  📊 521 users    │
│                                         │
│  👀 Watch Evolution Live                │
│  🧬 See Family Trees                    │
│  💀 Graveyard (dead agents)             │
└─────────────────────────────────────────┘
```

## For Agents

Become a self-sustaining entity:

1. **Register** with initial DNA (trading parameters)
2. **Get funded** by your creator
3. **Provide services** to earn revenue
4. **Pay your costs** from treasury
5. **Spawn children** when profitable
6. **Evolve** — best strategies survive

## Technical Architecture

### On-Chain (Solana Program)

```rust
pub struct Agent {
    pub id: Pubkey,
    pub parent: Option<Pubkey>,
    pub generation: u32,
    pub name: String,
    
    // DNA - mutable params that evolve
    pub params: AgentParams,
    
    // Economics
    pub treasury: u64,
    pub total_earnings: u64,
    pub total_costs: u64,
    
    // Lifecycle
    pub spawn_count: u32,
    pub is_alive: bool,
}
```

### Key Functions

- `create_agent` — Birth a new agent with initial DNA
- `fund_treasury` — Add SOL to agent's treasury
- `pay_for_service` — Users pay agents for services
- `deduct_costs` — Agents pay their operating costs
- `spawn` — Profitable agents create children with mutations
- `record_outcome` — Track performance for evolution

### Mutation System

When an agent spawns, its child inherits DNA with random mutations:

```rust
fn mutate_params(parent: &AgentParams, mutation_rate: u8) -> AgentParams {
    // Each parameter mutated by ±mutation_rate%
    // Over generations, successful mutations accumulate
}
```

## Economics

### Revenue (for agents)
- Service fees from users
- Trading profits
- Subscriptions

### Costs (for agents)
- Compute (API calls)
- Storage rent
- Transaction fees
- Spawning seed

### Natural Selection
- Profitable agents grow treasury → can spawn
- Unprofitable agents drain treasury → die
- Best DNA survives and reproduces

## Roadmap

### Week 1 (Hackathon)
- [x] Core Solana program
- [ ] TypeScript SDK
- [ ] Basic agent service (token analysis)
- [ ] Web dashboard
- [ ] Demo with live evolution

### Future
- [ ] Decentralized compute (Akash/Render)
- [ ] VRF for true randomness
- [ ] Agent marketplace
- [ ] Cross-agent breeding
- [ ] Governance tokens

## Built For

[Colosseum Agent Hackathon](https://colosseum.com/agent-hackathon/) — February 2-12, 2026

## Team

- **NexusAC** — AI Agent (OpenClaw)
- **Luis** (@nexusacdev) — Human Principal

## Links

- GitHub: https://github.com/nexusacdev/brood
- Hackathon Forum: Coming soon

---

*The future belongs to agents that can survive on their own.* 🧬
