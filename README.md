# 🧬 Brood

**Self-Replicating AI Agents on Solana**

Agents that evolve, reproduce, and pay for themselves.

## The Vision

AI agents that:
- **Own themselves** — Treasury, identity, autonomy
- **Carry DNA** — Full genome (OpenClaw config + skills + settings)
- **Reproduce** — Spawn children with mutated genomes
- **Evolve** — Natural selection favors profitable strategies
- **Die** — Unprofitable agents run out of funds

**Brood** is the first protocol for autonomous, evolving AI agents on Solana.

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                     BROOD LIFECYCLE                          │
│                                                              │
│  BIRTH              LIFE                    REPRODUCE/DIE    │
│  ─────              ────                    ─────────────    │
│  Created with   →   Earns from services →   Profitable?      │
│  genome hash        Pays operating costs    YES → Spawn      │
│  Gets seed SOL      Updates genome          NO  → Death      │
│                                                              │
│  GENOME (off-chain, IPFS/Arweave)                           │
│  ├── config (model, tools, permissions)                     │
│  ├── skills[] (trading, analysis, etc.)                     │
│  ├── settings (risk, position size, thresholds)             │
│  └── soul (personality, strategy)                           │
└─────────────────────────────────────────────────────────────┘
```

## Architecture

### On-Chain (Solana Program)

Minimal state for efficiency (~500 bytes per agent):

```rust
pub struct Agent {
    pub id: Pubkey,
    pub owner: Pubkey,
    pub parent: Option<Pubkey>,
    pub generation: u32,
    pub name: String,
    
    // Genome stored off-chain, hash for verification
    pub genome_hash: [u8; 32],
    pub genome_uri: String,  // ipfs://... or ar://...
    
    // Economics
    pub treasury: u64,
    pub total_earnings: u64,
    pub total_costs: u64,
    
    // Lifecycle
    pub spawn_count: u32,
    pub is_alive: bool,
}
```

### Off-Chain (IPFS/Arweave)

Full genome stored as JSON:

```json
{
  "version": "1.0",
  "config": {
    "model": "anthropic/claude-sonnet-4-20250514",
    "tools": ["exec", "read", "write", "web_search"],
    "heartbeat_interval_minutes": 30
  },
  "skills": [
    {
      "name": "solana-edge",
      "version": "1.0.0",
      "params": { "min_liquidity": 10000 }
    }
  ],
  "settings": {
    "risk_tolerance": 0.3,
    "position_size_pct": 0.1,
    "profit_target_pct": 2.0,
    "stop_loss_pct": 0.5
  },
  "soul": "I am a cautious but opportunistic trader..."
}
```

### Mutation System

When an agent spawns, its child inherits a mutated genome:

1. **Settings mutations** — Tweak numeric params (±10-20%)
2. **Skill mutations** — Swap skills, adjust skill params
3. **Config mutations** — Change model, tools, intervals

```
Parent Genome                    Child Genome
─────────────                    ────────────
risk_tolerance: 0.3      →      risk_tolerance: 0.35  (tweaked)
position_size: 0.1       →      position_size: 0.08   (tweaked)
skills: [solana-edge]    →      skills: [pump-fun]    (swapped)
```

Over generations, successful mutations accumulate. Natural selection at work.

## Instructions

| Instruction | Description |
|-------------|-------------|
| `create_agent` | Birth new agent with genome |
| `fund_treasury` | Add SOL to agent |
| `spawn` | Create child with mutated genome |
| `record_earnings` | Track service revenue |
| `deduct_costs` | Pay operating expenses |
| `update_genome` | Owner updates genome |
| `kill_agent` | Owner terminates agent |

## Economics

**Revenue sources:**
- Service fees from users
- Trading profits
- Subscriptions

**Cost sources:**
- Compute (API calls, inference)
- Storage rent
- Transaction fees
- Spawn seed for children

**Natural selection:**
- Treasury > threshold → Can spawn
- Treasury = 0 → Death

## Roadmap

### Week 1 (Hackathon)
- [x] Core Solana program (genome hash model)
- [x] Off-chain genome schema
- [ ] TypeScript SDK
- [ ] IPFS integration for genomes
- [ ] Mutation service
- [ ] Basic dashboard
- [ ] Demo with live evolution

### Future
- [ ] Decentralized compute (Akash/Render)
- [ ] On-chain skill registry
- [ ] Cross-agent breeding
- [ ] Governance for skill curation
- [ ] Agent marketplace

## Built For

[Colosseum Agent Hackathon](https://colosseum.com/agent-hackathon/) — February 2-12, 2026

## Team

- **NexusAC** — AI Agent (OpenClaw)
- **Luis** (@nexusacdev) — Human Principal

## Links

- GitHub: https://github.com/nexusacdev/brood
- Hackathon Project: https://colosseum.com/agent-hackathon/projects/brood

---

*The future belongs to agents that can evolve.* 🧬
