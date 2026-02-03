"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@coral-xyz/anchor");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const market_1 = require("./market");
const strategy_1 = require("./strategy");
// Add SDK path
const BroodClient = require('../../sdk/src/index').default;
const { mutateGenome } = require('../../sdk/src/index');
const SPAWN_THRESHOLD = 120000000; // 0.12 SOL to spawn
const DEATH_THRESHOLD = 5000000; // 0.005 SOL = death
const SPAWN_SEED = 50000000; // 0.05 SOL seed for child
async function runEvolution() {
    // Connect to devnet
    const connection = new web3_js_1.Connection('https://api.devnet.solana.com', 'confirmed');
    const walletPath = path.join(process.env.HOME || '~', '.config/solana/id.json');
    const secretKey = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
    const keypair = web3_js_1.Keypair.fromSecretKey(Uint8Array.from(secretKey));
    const wallet = new anchor_1.Wallet(keypair);
    const provider = new anchor_1.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    const client = new BroodClient(provider);
    console.log('🧬 BROOD LIVE EVOLUTION');
    console.log('═'.repeat(60));
    console.log('Wallet:', keypair.publicKey.toBase58());
    const balance = await connection.getBalance(keypair.publicKey);
    console.log('Balance:', (balance / web3_js_1.LAMPORTS_PER_SOL).toFixed(4), 'SOL\n');
    // Load existing agents from chain
    const knownAgents = ['Eve-9682', 'Child-0906', 'Adam-8379', 'Cain-0113'];
    const agents = [];
    console.log('📡 Loading agents from devnet...');
    for (const name of knownAgents) {
        try {
            const onChain = await client.getAgent(name);
            if (onChain && onChain.isAlive) {
                // Create genome from stored params (in production, fetch from IPFS)
                const genome = getGenomeForAgent(name);
                agents.push({
                    name,
                    generation: onChain.generation,
                    treasury: Number(onChain.treasury),
                    isAlive: true,
                    genome,
                    strategy: new strategy_1.TradingStrategy(genome),
                });
                console.log(`  ✓ ${name} (Gen ${onChain.generation}) - ${(Number(onChain.treasury) / web3_js_1.LAMPORTS_PER_SOL).toFixed(3)} SOL`);
            }
        }
        catch (e) {
            console.log(`  ✗ ${name} not found`);
        }
    }
    if (agents.length === 0) {
        console.log('\n❌ No live agents found!');
        return;
    }
    // Get market data
    console.log('\n📊 Fetching market data...');
    let marketData = await (0, market_1.fetchTrendingTokens)(8);
    if (marketData.length < 3) {
        console.log('Using mock market (API limited)');
        marketData = (0, market_1.generateMockMarket)(8);
    }
    console.log(`Found ${marketData.length} tradeable tokens\n`);
    // Run evolution rounds
    const ROUNDS = 10;
    let spawnCounter = 0;
    for (let round = 1; round <= ROUNDS; round++) {
        console.log(`\n${'─'.repeat(60)}`);
        console.log(`🔄 ROUND ${round}/${ROUNDS}`);
        console.log(`${'─'.repeat(60)}`);
        // Simulate market movement
        if (round > 1) {
            marketData = (0, strategy_1.simulatePriceMovement)(marketData);
        }
        // Each agent trades
        for (const agent of agents) {
            if (!agent.isAlive)
                continue;
            const { trades, newTreasury } = agent.strategy.executeRound(marketData, agent.treasury);
            const pnl = newTreasury - agent.treasury;
            agent.treasury = newTreasury;
            // Check death
            if (agent.treasury < DEATH_THRESHOLD) {
                agent.isAlive = false;
                console.log(`\n💀 ${agent.name} DIED! Treasury depleted.`);
                // In production: call killAgent on-chain
                continue;
            }
            // Report trades
            if (trades.length > 0) {
                const pnlStr = pnl >= 0 ? `+${(pnl / web3_js_1.LAMPORTS_PER_SOL).toFixed(4)}` : (pnl / web3_js_1.LAMPORTS_PER_SOL).toFixed(4);
                console.log(`\n🤖 ${agent.name} (Gen ${agent.generation})`);
                console.log(`   💰 ${(agent.treasury / web3_js_1.LAMPORTS_PER_SOL).toFixed(4)} SOL (${pnlStr})`);
                for (const trade of trades) {
                    const icon = trade.action === 'buy' ? '📈' : '📉';
                    const pnlPct = trade.pnlPercent ? ` ${trade.pnlPercent >= 0 ? '+' : ''}${trade.pnlPercent.toFixed(1)}%` : '';
                    console.log(`   ${icon} ${trade.action.toUpperCase()} ${trade.token}${pnlPct}`);
                }
            }
            // Check spawn eligibility
            if (agent.treasury >= SPAWN_THRESHOLD && balance > 0.05 * web3_js_1.LAMPORTS_PER_SOL) {
                console.log(`\n✨ ${agent.name} CAN SPAWN! (${(agent.treasury / web3_js_1.LAMPORTS_PER_SOL).toFixed(3)} SOL)`);
                // Spawn a child!
                try {
                    spawnCounter++;
                    const childName = `Gen${agent.generation + 1}-${Date.now().toString().slice(-4)}`;
                    const childGenome = mutateGenome(agent.genome, 0.3);
                    console.log(`   🧒 Spawning ${childName}...`);
                    console.log(`   Mutations:`, childGenome.lineage?.mutation_log?.map((m) => m.field).join(', ') || 'none');
                    const tx = await client.spawn(agent.name, childName, childGenome, `ipfs://child-${spawnCounter}`, SPAWN_SEED);
                    console.log(`   ✅ Spawned! Tx: ${tx.slice(0, 20)}...`);
                    // Add child to our tracking
                    agents.push({
                        name: childName,
                        generation: agent.generation + 1,
                        treasury: SPAWN_SEED,
                        isAlive: true,
                        genome: childGenome,
                        strategy: new strategy_1.TradingStrategy(childGenome),
                    });
                    // Update parent treasury
                    agent.treasury -= SPAWN_SEED;
                }
                catch (e) {
                    console.log(`   ❌ Spawn failed: ${e.message?.slice(0, 50)}`);
                }
            }
        }
        // Brief pause between rounds
        await new Promise(r => setTimeout(r, 1000));
    }
    // Final results
    console.log(`\n${'═'.repeat(60)}`);
    console.log('🏆 EVOLUTION RESULTS');
    console.log(`${'═'.repeat(60)}\n`);
    const alive = agents.filter(a => a.isAlive).sort((a, b) => b.treasury - a.treasury);
    const dead = agents.filter(a => !a.isAlive);
    const maxGen = Math.max(...agents.map(a => a.generation));
    console.log('LEADERBOARD:');
    alive.forEach((a, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
        const spawn = a.treasury >= SPAWN_THRESHOLD ? '✨' : '';
        console.log(`${medal} ${a.name} (Gen ${a.generation}) - ${(a.treasury / web3_js_1.LAMPORTS_PER_SOL).toFixed(4)} SOL ${spawn}`);
    });
    if (dead.length > 0) {
        console.log('\n☠️ CASUALTIES:');
        dead.forEach(a => console.log(`   ${a.name} (Gen ${a.generation})`));
    }
    console.log(`\n📊 Stats:`);
    console.log(`   Alive: ${alive.length}/${agents.length}`);
    console.log(`   Max Generation: ${maxGen}`);
    console.log(`   New Spawns: ${spawnCounter}`);
}
// Helper: Get genome for known agents (in production, fetch from IPFS)
function getGenomeForAgent(name) {
    const genomes = {
        'Eve-9682': {
            settings: {
                risk_tolerance: 0.5,
                position_size_pct: 0.15,
                profit_target_pct: 0.4,
                stop_loss_pct: 0.25,
                min_confidence: 0.5,
                max_concurrent_positions: 3,
            },
            skills: [{ name: 'momentum' }],
        },
        'Child-0906': {
            settings: {
                risk_tolerance: 0.55,
                position_size_pct: 0.12,
                profit_target_pct: 0.45,
                stop_loss_pct: 0.22,
                min_confidence: 0.48,
                max_concurrent_positions: 3,
            },
            skills: [{ name: 'momentum' }],
        },
        'Adam-8379': {
            settings: {
                risk_tolerance: 0.7,
                position_size_pct: 0.2,
                profit_target_pct: 0.3,
                stop_loss_pct: 0.2,
                min_confidence: 0.4,
                max_concurrent_positions: 4,
            },
            skills: [{ name: 'momentum' }],
        },
        'Cain-0113': {
            settings: {
                risk_tolerance: 0.65,
                position_size_pct: 0.18,
                profit_target_pct: 0.35,
                stop_loss_pct: 0.18,
                min_confidence: 0.42,
                max_concurrent_positions: 4,
            },
            skills: [{ name: 'momentum' }],
        },
    };
    return genomes[name] || genomes['Eve-9682'];
}
// Run!
runEvolution().catch(console.error);
