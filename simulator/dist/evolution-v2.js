"use strict";
/**
 * BROOD Evolution v2 - Economic Natural Selection
 *
 * Agents live or die based on their trading performance.
 * Skills evolve through breeding and learning.
 * Bad strategies get disabled. Good ones propagate.
 */
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
const genome_1 = require("./genome");
const evolved_strategy_1 = require("./evolved-strategy");
const BroodClient = require('../../sdk/src/index').default;
// Constants
const SPAWN_THRESHOLD = 0.12 * web3_js_1.LAMPORTS_PER_SOL; // 0.12 SOL to spawn
const SPAWN_SEED = 0.05 * web3_js_1.LAMPORTS_PER_SOL; // 0.05 SOL seed for child
const DEATH_THRESHOLD = 0.005 * web3_js_1.LAMPORTS_PER_SOL; // 0.005 SOL = death
const ROUND_INTERVAL_MS = 15000; // 15 seconds
const MAX_ROUNDS = 480; // ~2 hours
// Paths
const DATA_DIR = path.join(__dirname, '../data');
const STATE_PATH = path.join(DATA_DIR, 'evolution-state.json');
const GENOMES_PATH = path.join(DATA_DIR, 'genomes');
const LOG_PATH = path.join(DATA_DIR, 'evolution.log');
// Ensure directories exist
function ensureDirs() {
    if (!fs.existsSync(DATA_DIR))
        fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(GENOMES_PATH))
        fs.mkdirSync(GENOMES_PATH, { recursive: true });
}
// Save genome to disk
function saveGenome(genome) {
    const filename = `${genome.agentName}-gen${genome.lineage.generation}.json`;
    fs.writeFileSync(path.join(GENOMES_PATH, filename), JSON.stringify(genome, null, 2));
}
// Generate unique child name
let childCounter = 0;
function generateChildName(parentName, generation) {
    childCounter++;
    const prefixes = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Nova', 'Zeta', 'Omega', 'Apex', 'Prime', 'Echo'];
    const prefix = prefixes[generation % prefixes.length];
    const id = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${id}`;
}
// Save full state for dashboard
function saveState(state) {
    const dashboardState = {
        timestamp: state.timestamp,
        round: state.round,
        prices: state.marketPrices.map(t => ({
            symbol: t.symbol,
            price: t.priceUsd,
            change24h: t.priceChange24h,
        })),
        agents: state.agents.map(a => ({
            name: a.name,
            generation: a.genome.lineage.generation,
            treasury: a.treasury / web3_js_1.LAMPORTS_PER_SOL,
            netWorth: calculateNetWorth(a) / web3_js_1.LAMPORTS_PER_SOL,
            isAlive: a.isAlive,
            skills: a.genome.skills.map(s => ({
                id: s.id,
                enabled: s.enabled,
                winRate: s.winRate,
                profit: s.profitFromSkill,
            })),
            positions: Array.from(a.strategy.positions.entries()).map(([token, pos]) => ({
                token,
                entryPrice: pos.entryPrice,
                amount: pos.amount / web3_js_1.LAMPORTS_PER_SOL,
                roundsHeld: pos.roundsHeld || 0,
            })),
            learning: a.genome.learning,
            costPressure: a.genome.economics.costPressure,
            parent: a.genome.lineage.parentName,
            children: a.children,
        })),
        graveyard: state.graveyard,
        summary: {
            totalAgents: state.agents.length,
            aliveAgents: state.agents.filter(a => a.isAlive).length,
            totalSpawns: state.totalSpawns,
            totalDeaths: state.totalDeaths,
            maxGeneration: Math.max(...state.agents.map(a => a.genome.lineage.generation)),
        },
    };
    fs.writeFileSync(STATE_PATH, JSON.stringify(dashboardState, null, 2));
}
// Calculate net worth including positions
function calculateNetWorth(agent) {
    let posValue = 0;
    for (const [, pos] of agent.strategy.positions) {
        posValue += pos.amount; // simplified - would need current prices
    }
    return agent.treasury + posValue;
}
// Log to file
function log(message) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(LOG_PATH, line);
    console.log(message);
}
// Main evolution loop
async function runEvolution() {
    console.log('🧬 BROOD EVOLUTION v2 - Economic Natural Selection');
    console.log('═'.repeat(60));
    ensureDirs();
    // Initialize blockchain connection
    const connection = new web3_js_1.Connection('https://api.devnet.solana.com', 'confirmed');
    const walletPath = path.join(process.env.HOME || '~', '.config/solana/id.json');
    const secretKey = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
    const keypair = web3_js_1.Keypair.fromSecretKey(Uint8Array.from(secretKey));
    const wallet = new anchor_1.Wallet(keypair);
    const provider = new anchor_1.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    const client = new BroodClient(provider);
    console.log(`Wallet: ${keypair.publicKey.toBase58()}`);
    const balance = await connection.getBalance(keypair.publicKey);
    console.log(`Balance: ${(balance / web3_js_1.LAMPORTS_PER_SOL).toFixed(4)} SOL\n`);
    // Initialize state
    const state = {
        round: 0,
        timestamp: Date.now(),
        agents: [],
        graveyard: [],
        totalSpawns: 0,
        totalDeaths: 0,
        marketPrices: [],
    };
    // Create genesis agents
    const genesisNames = ['Eve', 'Adam', 'Lilith'];
    const genesisSOL = [0.1, 0.08, 0.06]; // Different starting capital
    for (let i = 0; i < genesisNames.length; i++) {
        const name = genesisNames[i];
        const genome = (0, genome_1.createGenesisGenome)(name);
        // Vary their starting genomes slightly
        if (i === 1) {
            // Adam: more aggressive
            genome.learning.learningRate = 0.15;
            genome.exit.takeProfitPct = 0.08;
            genome.exit.stopLossPct = 0.04;
        }
        else if (i === 2) {
            // Lilith: more conservative
            genome.learning.learningRate = 0.08;
            genome.exit.takeProfitPct = 0.03;
            genome.exit.stopLossPct = 0.02;
        }
        const agent = {
            name,
            genome,
            strategy: new evolved_strategy_1.EvolvedStrategy(genome),
            treasury: Math.floor(genesisSOL[i] * web3_js_1.LAMPORTS_PER_SOL),
            isAlive: true,
            birthRound: 0,
            children: [],
        };
        state.agents.push(agent);
        saveGenome(genome);
        log(`🐣 Genesis: ${name} (${genesisSOL[i]} SOL)`);
    }
    // Fetch initial market data
    console.log('\n📊 Fetching market data...');
    let marketData = await (0, market_1.fetchRealPrices)();
    state.marketPrices = marketData;
    console.log(`Found ${marketData.length} tokens\n`);
    // Evolution loop
    console.log(`🔄 Starting evolution (${MAX_ROUNDS} rounds, ${ROUND_INTERVAL_MS / 1000}s intervals)`);
    console.log('Press Ctrl+C to stop\n');
    while (state.round < MAX_ROUNDS) {
        state.round++;
        state.timestamp = Date.now();
        console.log('─'.repeat(60));
        console.log(`🔄 ROUND ${state.round}/${MAX_ROUNDS} - ${new Date().toLocaleTimeString()}`);
        console.log('─'.repeat(60));
        // Refresh market data every 5 rounds
        if (state.round % 5 === 0) {
            const newData = await (0, market_1.fetchRealPrices)();
            if (newData.length > 0) {
                marketData = newData;
                state.marketPrices = marketData;
            }
        }
        // Process each living agent
        for (const agent of state.agents) {
            if (!agent.isAlive)
                continue;
            // Execute trading round
            const { trades, newTreasury, costs } = agent.strategy.executeRound(marketData, agent.treasury);
            agent.treasury = newTreasury;
            // Check for death
            if (agent.treasury < DEATH_THRESHOLD) {
                agent.isAlive = false;
                agent.deathRound = state.round;
                agent.deathReason = 'treasury_depleted';
                state.totalDeaths++;
                state.graveyard.push({
                    name: agent.name,
                    generation: agent.genome.lineage.generation,
                    lifespan: state.round - agent.birthRound,
                    deathReason: 'Could not pay running costs',
                    finalTreasury: agent.treasury / web3_js_1.LAMPORTS_PER_SOL,
                });
                log(`💀 DEATH: ${agent.name} (Gen ${agent.genome.lineage.generation}) - Treasury depleted after ${state.round - agent.birthRound} rounds`);
                console.log(`\n💀 ${agent.name} DIED - Could not pay running costs`);
                continue;
            }
            // Display agent status
            if (trades.length > 0 || state.round % 10 === 0) {
                const netWorth = calculateNetWorth(agent) / web3_js_1.LAMPORTS_PER_SOL;
                const enabledSkills = agent.genome.skills.filter(s => s.enabled);
                console.log(`\n🤖 ${agent.name} (Gen ${agent.genome.lineage.generation})`);
                console.log(`   💰 Treasury: ${(agent.treasury / web3_js_1.LAMPORTS_PER_SOL).toFixed(4)} SOL | Net: ${netWorth.toFixed(4)} SOL`);
                console.log(`   🧠 Skills: ${enabledSkills.map(s => s.id.split('_')[0]).join(', ')}`);
                console.log(`   📈 Cost pressure: ${(agent.genome.economics.costPressure * 100).toFixed(0)}%`);
                for (const trade of trades) {
                    const icon = trade.action === 'buy' ? '📈' : '📉';
                    const pnl = trade.pnlPercent ? ` ${trade.pnlPercent >= 0 ? '+' : ''}${trade.pnlPercent.toFixed(2)}%` : '';
                    console.log(`   ${icon} ${trade.action.toUpperCase()} ${trade.token} ${pnl} (${trade.reason})`);
                }
            }
            // Check for spawn eligibility
            if (agent.treasury >= SPAWN_THRESHOLD) {
                console.log(`\n✨ ${agent.name} CAN SPAWN! (Treasury: ${(agent.treasury / web3_js_1.LAMPORTS_PER_SOL).toFixed(4)} SOL)`);
                // Spawn a child
                const childName = generateChildName(agent.name, agent.genome.lineage.generation + 1);
                const parentGenome = agent.strategy.getGenomeForBreeding();
                const childGenome = (0, genome_1.mutateGenome)(parentGenome, childName, 0.15);
                // Deduct seed from parent
                agent.treasury -= SPAWN_SEED;
                // Create child agent
                const childAgent = {
                    name: childName,
                    genome: childGenome,
                    strategy: new evolved_strategy_1.EvolvedStrategy(childGenome),
                    treasury: SPAWN_SEED,
                    isAlive: true,
                    birthRound: state.round,
                    children: [],
                };
                state.agents.push(childAgent);
                agent.children.push(childName);
                state.totalSpawns++;
                saveGenome(childGenome);
                const mutations = childGenome.lineage.mutations;
                log(`🐣 SPAWN: ${childName} (Gen ${childGenome.lineage.generation}) from ${agent.name}`);
                log(`   Mutations: ${mutations.map(m => `${m.field}:${m.mutationType}`).join(', ')}`);
                console.log(`   🐣 Spawned ${childName} (Gen ${childGenome.lineage.generation})`);
                console.log(`   📜 Inherited ${childGenome.skills.length} skills, ${mutations.length} mutations`);
                // Try to register on-chain (optional, may fail if no SOL)
                try {
                    await client.spawn(agent.name, childName, childGenome, `ipfs://${(0, genome_1.hashGenome)(childGenome)}`, SPAWN_SEED);
                    console.log(`   ⛓️  Registered on-chain`);
                }
                catch (e) {
                    // Silent fail - on-chain registration optional for sim
                }
            }
        }
        // Round summary
        const alive = state.agents.filter(a => a.isAlive);
        const totalNet = alive.reduce((sum, a) => sum + calculateNetWorth(a), 0);
        const maxGen = Math.max(...state.agents.map(a => a.genome.lineage.generation));
        console.log(`\n📊 Round ${state.round}: ${alive.length} alive | ${state.totalDeaths} dead | Max Gen: ${maxGen} | Total: ${(totalNet / web3_js_1.LAMPORTS_PER_SOL).toFixed(4)} SOL`);
        // Save state
        saveState(state);
        // Wait for next round
        if (state.round < MAX_ROUNDS && alive.length > 0) {
            await new Promise(r => setTimeout(r, ROUND_INTERVAL_MS));
        }
        // Stop if everyone is dead
        if (alive.length === 0) {
            console.log('\n💀 EXTINCTION - All agents died!');
            break;
        }
    }
    // Final report
    console.log('\n' + '═'.repeat(60));
    console.log('🏆 EVOLUTION COMPLETE');
    console.log('═'.repeat(60));
    console.log('\n📊 FINAL STATISTICS:\n');
    console.log(`   Total Rounds: ${state.round}`);
    console.log(`   Total Spawns: ${state.totalSpawns}`);
    console.log(`   Total Deaths: ${state.totalDeaths}`);
    console.log(`   Final Population: ${state.agents.filter(a => a.isAlive).length}`);
    console.log(`   Max Generation: ${Math.max(...state.agents.map(a => a.genome.lineage.generation))}`);
    // Survivors
    const survivors = state.agents.filter(a => a.isAlive).sort((a, b) => calculateNetWorth(b) - calculateNetWorth(a));
    if (survivors.length > 0) {
        console.log('\n🏆 SURVIVORS:\n');
        for (const agent of survivors) {
            const netWorth = calculateNetWorth(agent) / web3_js_1.LAMPORTS_PER_SOL;
            const skills = agent.genome.skills.filter(s => s.enabled);
            const topSkill = skills.sort((a, b) => b.winRate - a.winRate)[0];
            console.log(`   ${agent.name} (Gen ${agent.genome.lineage.generation})`);
            console.log(`   └─ Net: ${netWorth.toFixed(4)} SOL | Children: ${agent.children.length}`);
            console.log(`   └─ Best skill: ${topSkill?.id} (${(topSkill?.winRate * 100).toFixed(0)}% win)`);
            console.log('');
        }
    }
    // Graveyard
    if (state.graveyard.length > 0) {
        console.log('💀 GRAVEYARD:\n');
        for (const dead of state.graveyard.slice(-5)) {
            console.log(`   ${dead.name} (Gen ${dead.generation}) - Lived ${dead.lifespan} rounds`);
        }
    }
    console.log(`\n📁 State saved to: ${STATE_PATH}`);
    console.log(`📁 Genomes saved to: ${GENOMES_PATH}`);
}
// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n⛔ Evolution stopped by user');
    process.exit(0);
});
runEvolution().catch(console.error);
