"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const market_1 = require("./market");
const strategy_1 = require("./strategy");
// Import from SDK (adjust path as needed)
const SDK_PATH = '../sdk/src/index';
// Mock agents with their genomes (in production, fetch from chain + IPFS)
const AGENTS = [
    {
        id: 'GNKK2DfA...',
        name: 'Alpha-719523',
        generation: 1,
        treasury: 0,
        isAlive: true,
        genome: {
            settings: {
                risk_tolerance: 0.3,
                position_size_pct: 0.1,
                profit_target_pct: 0.5,
                stop_loss_pct: 0.3,
                min_confidence: 0.6,
                max_concurrent_positions: 2,
            },
            skills: [{ name: 'momentum', params: { threshold: 0.05 } }],
        },
    },
    {
        id: 'HvM2JtmS...',
        name: 'Eve-9682',
        generation: 1,
        treasury: 100000000, // 0.1 SOL
        isAlive: true,
        genome: {
            settings: {
                risk_tolerance: 0.5,
                position_size_pct: 0.15,
                profit_target_pct: 0.4,
                stop_loss_pct: 0.25,
                min_confidence: 0.5,
                max_concurrent_positions: 3,
            },
            skills: [{ name: 'momentum', params: { threshold: 0.08 } }],
        },
    },
    {
        id: '4ikPy2c8...',
        name: 'Child-0906',
        generation: 2,
        treasury: 100000000,
        isAlive: true,
        genome: {
            settings: {
                risk_tolerance: 0.55, // Mutated from Eve
                position_size_pct: 0.12,
                profit_target_pct: 0.45,
                stop_loss_pct: 0.22,
                min_confidence: 0.48,
                max_concurrent_positions: 3,
            },
            skills: [{ name: 'momentum', params: { threshold: 0.07 } }],
        },
    },
    {
        id: '6qqRCYRM...',
        name: 'Adam-8379',
        generation: 1,
        treasury: 180000000, // 0.18 SOL
        isAlive: true,
        genome: {
            settings: {
                risk_tolerance: 0.7, // More aggressive
                position_size_pct: 0.2,
                profit_target_pct: 0.3,
                stop_loss_pct: 0.2,
                min_confidence: 0.4,
                max_concurrent_positions: 4,
            },
            skills: [{ name: 'momentum', params: { threshold: 0.1 } }],
        },
    },
    {
        id: '5oimH3a2...',
        name: 'Cain-0113',
        generation: 2,
        treasury: 120000000,
        isAlive: true,
        genome: {
            settings: {
                risk_tolerance: 0.65, // Mutated from Adam
                position_size_pct: 0.18,
                profit_target_pct: 0.35,
                stop_loss_pct: 0.18,
                min_confidence: 0.42,
                max_concurrent_positions: 4,
            },
            skills: [{ name: 'momentum', params: { threshold: 0.09 } }],
        },
    },
];
// Spawn threshold
const SPAWN_THRESHOLD = 150000000; // 0.15 SOL
const DEATH_THRESHOLD = 10000000; // 0.01 SOL
async function runSimulation(rounds = 5) {
    console.log('🧬 BROOD PAPER TRADING SIMULATOR');
    console.log('═'.repeat(60));
    console.log(`Running ${rounds} rounds of simulation...\n`);
    // Initialize strategies for each agent
    const strategies = new Map();
    for (const agent of AGENTS) {
        strategies.set(agent.name, new strategy_1.TradingStrategy(agent.genome));
    }
    // Get initial market data
    console.log('📊 Fetching market data...');
    let marketData = await (0, market_1.fetchTrendingTokens)(10);
    if (marketData.length === 0) {
        console.log('⚠️ API failed, using mock market data');
        marketData = (0, market_1.generateMockMarket)(10);
    }
    console.log(`Found ${marketData.length} tokens\n`);
    // Run simulation rounds
    for (let round = 1; round <= rounds; round++) {
        console.log(`\n${'─'.repeat(60)}`);
        console.log(`📈 ROUND ${round}`);
        console.log(`${'─'.repeat(60)}`);
        // Simulate market movement
        if (round > 1) {
            marketData = (0, strategy_1.simulatePriceMovement)(marketData);
        }
        // Each agent trades
        for (const agent of AGENTS) {
            if (!agent.isAlive)
                continue;
            const strategy = strategies.get(agent.name);
            const { trades, newTreasury } = strategy.executeRound(marketData, agent.treasury);
            const pnl = newTreasury - agent.treasury;
            agent.treasury = newTreasury;
            // Check for death
            if (agent.treasury < DEATH_THRESHOLD) {
                agent.isAlive = false;
                console.log(`\n💀 ${agent.name} DIED (treasury depleted)`);
                continue;
            }
            // Check for spawn eligibility
            const canSpawn = agent.treasury >= SPAWN_THRESHOLD;
            // Report
            if (trades.length > 0) {
                console.log(`\n🤖 ${agent.name} (Gen ${agent.generation})`);
                console.log(`   Treasury: ${(agent.treasury / web3_js_1.LAMPORTS_PER_SOL).toFixed(4)} SOL (${pnl >= 0 ? '+' : ''}${(pnl / web3_js_1.LAMPORTS_PER_SOL).toFixed(4)})`);
                for (const trade of trades) {
                    const icon = trade.action === 'buy' ? '🟢' : '🔴';
                    const pnlStr = trade.pnlPercent ? ` (${trade.pnlPercent >= 0 ? '+' : ''}${trade.pnlPercent.toFixed(1)}%)` : '';
                    console.log(`   ${icon} ${trade.action.toUpperCase()} ${trade.token}${pnlStr} - ${trade.reason}`);
                }
                if (canSpawn) {
                    console.log(`   ✨ Can spawn! Treasury above threshold.`);
                }
            }
        }
    }
    // Final summary
    console.log(`\n${'═'.repeat(60)}`);
    console.log('📊 FINAL RESULTS');
    console.log(`${'═'.repeat(60)}\n`);
    const alive = AGENTS.filter(a => a.isAlive);
    const dead = AGENTS.filter(a => !a.isAlive);
    console.log('SURVIVORS:');
    for (const agent of alive.sort((a, b) => b.treasury - a.treasury)) {
        const treasury = (agent.treasury / web3_js_1.LAMPORTS_PER_SOL).toFixed(4);
        const canSpawn = agent.treasury >= SPAWN_THRESHOLD ? '✨' : '';
        console.log(`  🟢 ${agent.name} (Gen ${agent.generation}) - ${treasury} SOL ${canSpawn}`);
    }
    if (dead.length > 0) {
        console.log('\nDEAD:');
        for (const agent of dead) {
            console.log(`  💀 ${agent.name} (Gen ${agent.generation})`);
        }
    }
    console.log(`\nAlive: ${alive.length}/${AGENTS.length}`);
    console.log(`Can Spawn: ${alive.filter(a => a.treasury >= SPAWN_THRESHOLD).length}`);
    console.log(`Max Generation: ${Math.max(...AGENTS.map(a => a.generation))}`);
}
// Run
runSimulation(10).catch(console.error);
