/**
 * BROOD Evolution v2 - Economic Natural Selection
 * 
 * Agents live or die based on their trading performance.
 * Skills evolve through breeding and learning.
 * Bad strategies get disabled. Good ones propagate.
 */

import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';

import { fetchRealPrices } from './market';
import { TokenData } from './types';
import { 
  GenomeV2, 
  createGenesisGenome, 
  mutateGenome, 
  hashGenome,
  calculateCosts,
  SKILL_TEMPLATES
} from './genome';
import { EvolvedStrategy } from './evolved-strategy';

const BroodClient = require('../../sdk/src/index').default;

// Constants
const SPAWN_THRESHOLD = 0.12 * LAMPORTS_PER_SOL;  // 0.12 SOL to spawn
const SPAWN_SEED = 0.05 * LAMPORTS_PER_SOL;       // 0.05 SOL seed for child
const DEATH_THRESHOLD = 0.005 * LAMPORTS_PER_SOL; // 0.005 SOL = death
const ROUND_INTERVAL_MS = 15_000;                  // 15 seconds
const MAX_ROUNDS = 480;                            // ~2 hours

// Paths
const DATA_DIR = path.join(__dirname, '../data');
const STATE_PATH = path.join(DATA_DIR, 'evolution-state.json');
const GENOMES_PATH = path.join(DATA_DIR, 'genomes');
const LOG_PATH = path.join(DATA_DIR, 'evolution.log');

interface AgentState {
  name: string;
  genome: GenomeV2;
  strategy: EvolvedStrategy;
  treasury: number;           // lamports
  isAlive: boolean;
  birthRound: number;
  deathRound?: number;
  deathReason?: string;
  children: string[];
}

interface EvolutionState {
  round: number;
  timestamp: number;
  agents: AgentState[];
  graveyard: Array<{
    name: string;
    generation: number;
    lifespan: number;
    deathReason: string;
    finalTreasury: number;
  }>;
  totalSpawns: number;
  totalDeaths: number;
  marketPrices: TokenData[];
}

// Ensure directories exist
function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(GENOMES_PATH)) fs.mkdirSync(GENOMES_PATH, { recursive: true });
}

// Save genome to disk
function saveGenome(genome: GenomeV2) {
  const filename = `${genome.agentName}-gen${genome.lineage.generation}.json`;
  fs.writeFileSync(
    path.join(GENOMES_PATH, filename),
    JSON.stringify(genome, null, 2)
  );
}

// Generate unique child name
let childCounter = 0;
function generateChildName(parentName: string, generation: number): string {
  childCounter++;
  const prefixes = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Nova', 'Zeta', 'Omega', 'Apex', 'Prime', 'Echo'];
  const prefix = prefixes[generation % prefixes.length];
  const id = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${id}`;
}

// Save full state for dashboard
function saveState(state: EvolutionState) {
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
      treasury: a.treasury / LAMPORTS_PER_SOL,
      netWorth: calculateNetWorth(a) / LAMPORTS_PER_SOL,
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
        amount: pos.amount / LAMPORTS_PER_SOL,
        roundsHeld: (pos as any).roundsHeld || 0,
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
function calculateNetWorth(agent: AgentState): number {
  let posValue = 0;
  for (const [, pos] of agent.strategy.positions) {
    posValue += pos.amount; // simplified - would need current prices
  }
  return agent.treasury + posValue;
}

// Log to file
function log(message: string) {
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
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const walletPath = path.join(process.env.HOME || '~', '.config/solana/id.json');
  const secretKey = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const client = new BroodClient(provider);
  
  console.log(`Wallet: ${keypair.publicKey.toBase58()}`);
  const balance = await connection.getBalance(keypair.publicKey);
  console.log(`Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`);
  
  // Initialize state
  const state: EvolutionState = {
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
    const genome = createGenesisGenome(name);
    
    // Vary their starting genomes slightly
    if (i === 1) {
      // Adam: more aggressive
      genome.learning.learningRate = 0.15;
      genome.exit.takeProfitPct = 0.08;
      genome.exit.stopLossPct = 0.04;
    } else if (i === 2) {
      // Lilith: more conservative
      genome.learning.learningRate = 0.08;
      genome.exit.takeProfitPct = 0.03;
      genome.exit.stopLossPct = 0.02;
    }
    
    const agent: AgentState = {
      name,
      genome,
      strategy: new EvolvedStrategy(genome),
      treasury: Math.floor(genesisSOL[i] * LAMPORTS_PER_SOL),
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
  let marketData = await fetchRealPrices();
  state.marketPrices = marketData;
  
  console.log(`Found ${marketData.length} tokens\n`);
  
  // Evolution loop
  console.log(`🔄 Starting evolution (${MAX_ROUNDS} rounds, ${ROUND_INTERVAL_MS/1000}s intervals)`);
  console.log('Press Ctrl+C to stop\n');
  
  while (state.round < MAX_ROUNDS) {
    state.round++;
    state.timestamp = Date.now();
    
    console.log('─'.repeat(60));
    console.log(`🔄 ROUND ${state.round}/${MAX_ROUNDS} - ${new Date().toLocaleTimeString()}`);
    console.log('─'.repeat(60));
    
    // Refresh market data every 5 rounds
    if (state.round % 5 === 0) {
      const newData = await fetchRealPrices();
      if (newData.length > 0) {
        marketData = newData;
        state.marketPrices = marketData;
      }
    }
    
    // Process each living agent
    for (const agent of state.agents) {
      if (!agent.isAlive) continue;
      
      // Execute trading round
      const { trades, newTreasury, costs } = agent.strategy.executeRound(
        marketData,
        agent.treasury
      );
      
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
          finalTreasury: agent.treasury / LAMPORTS_PER_SOL,
        });
        
        log(`💀 DEATH: ${agent.name} (Gen ${agent.genome.lineage.generation}) - Treasury depleted after ${state.round - agent.birthRound} rounds`);
        console.log(`\n💀 ${agent.name} DIED - Could not pay running costs`);
        continue;
      }
      
      // Display agent status
      if (trades.length > 0 || state.round % 10 === 0) {
        const netWorth = calculateNetWorth(agent) / LAMPORTS_PER_SOL;
        const enabledSkills = agent.genome.skills.filter(s => s.enabled);
        
        console.log(`\n🤖 ${agent.name} (Gen ${agent.genome.lineage.generation})`);
        console.log(`   💰 Treasury: ${(agent.treasury/LAMPORTS_PER_SOL).toFixed(4)} SOL | Net: ${netWorth.toFixed(4)} SOL`);
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
        console.log(`\n✨ ${agent.name} CAN SPAWN! (Treasury: ${(agent.treasury/LAMPORTS_PER_SOL).toFixed(4)} SOL)`);
        
        // Spawn a child
        const childName = generateChildName(agent.name, agent.genome.lineage.generation + 1);
        const parentGenome = agent.strategy.getGenomeForBreeding();
        const childGenome = mutateGenome(parentGenome, childName, 0.15);
        
        // Deduct seed from parent
        agent.treasury -= SPAWN_SEED;
        
        // Create child agent
        const childAgent: AgentState = {
          name: childName,
          genome: childGenome,
          strategy: new EvolvedStrategy(childGenome),
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
          await client.spawn(
            agent.name,
            childName,
            childGenome,
            `ipfs://${hashGenome(childGenome)}`,
            SPAWN_SEED
          );
          console.log(`   ⛓️  Registered on-chain`);
        } catch (e) {
          // Silent fail - on-chain registration optional for sim
        }
      }
    }
    
    // Round summary
    const alive = state.agents.filter(a => a.isAlive);
    const totalNet = alive.reduce((sum, a) => sum + calculateNetWorth(a), 0);
    const maxGen = Math.max(...state.agents.map(a => a.genome.lineage.generation));
    
    console.log(`\n📊 Round ${state.round}: ${alive.length} alive | ${state.totalDeaths} dead | Max Gen: ${maxGen} | Total: ${(totalNet/LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    
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
  const survivors = state.agents.filter(a => a.isAlive).sort((a, b) => 
    calculateNetWorth(b) - calculateNetWorth(a)
  );
  
  if (survivors.length > 0) {
    console.log('\n🏆 SURVIVORS:\n');
    for (const agent of survivors) {
      const netWorth = calculateNetWorth(agent) / LAMPORTS_PER_SOL;
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
