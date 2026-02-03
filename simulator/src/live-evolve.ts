import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';

import { fetchRealPrices, calculatePriceChanges } from './market';
import { TradingStrategy } from './strategy';
import { AgentGenome, TokenData, TradeResult } from './types';

const BroodClient = require('../../sdk/src/index').default;
const { mutateGenome } = require('../../sdk/src/index');

const SPAWN_THRESHOLD = 120_000_000;  // 0.12 SOL to spawn
const DEATH_THRESHOLD = 5_000_000;    // 0.005 SOL = death
const MIN_SPAWN_SEED = 100_000_000;   // 0.1 SOL minimum seed
const ROUND_INTERVAL_MS = 15_000;     // 15 seconds between rounds

// Trade log file
const TRADE_LOG_PATH = path.join(__dirname, '../data/trades.json');
const STATE_PATH = path.join(__dirname, '../data/state.json');

interface TradeLogEntry {
  timestamp: number;
  round: number;
  agent: string;
  generation: number;
  action: 'buy' | 'sell';
  token: string;
  price: number;
  amount: number;
  pnlPercent?: number;
  pnlSol?: number;
  reason: string;
}

interface AgentState {
  name: string;
  generation: number;
  treasury: number;
  positions: { token: string; entryPrice: number; amount: number }[];
  netWorth: number;
  totalPnL: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  isAlive: boolean;
}

interface LiveAgent {
  name: string;
  generation: number;
  treasury: number;
  isAlive: boolean;
  genome: AgentGenome;
  strategy: TradingStrategy;
  onChainTreasury: number;
  totalPnL: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
}

// Default genomes for known agents (adjusted for short-term demo)
const DEFAULT_GENOMES: Record<string, AgentGenome> = {
  'Eve-9682': {
    settings: {
      risk_tolerance: 0.6,
      position_size_pct: 0.15,
      profit_target_pct: 0.02,   // 2% take profit
      stop_loss_pct: 0.015,      // 1.5% stop loss
      min_confidence: 0.45,
      max_concurrent_positions: 3,
    },
    skills: [{ name: 'momentum' }],
  },
  'Adam-8379': {
    settings: {
      risk_tolerance: 0.75,
      position_size_pct: 0.2,
      profit_target_pct: 0.03,   // 3% take profit
      stop_loss_pct: 0.02,       // 2% stop loss
      min_confidence: 0.4,
      max_concurrent_positions: 4,
    },
    skills: [{ name: 'momentum' }],
  },
};

function getGenome(name: string, parent?: string): AgentGenome {
  if (DEFAULT_GENOMES[name]) return DEFAULT_GENOMES[name];
  const parentGenome = parent ? DEFAULT_GENOMES[parent] : DEFAULT_GENOMES['Eve-9682'];
  return mutateGenome(parentGenome || DEFAULT_GENOMES['Eve-9682'], 0.2);
}

function ensureDataDir() {
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function loadTradeLog(): TradeLogEntry[] {
  try {
    if (fs.existsSync(TRADE_LOG_PATH)) {
      return JSON.parse(fs.readFileSync(TRADE_LOG_PATH, 'utf-8'));
    }
  } catch {}
  return [];
}

function saveTradeLog(log: TradeLogEntry[]) {
  ensureDataDir();
  fs.writeFileSync(TRADE_LOG_PATH, JSON.stringify(log, null, 2));
}

function saveState(agents: LiveAgent[], marketData: TokenData[], round: number) {
  ensureDataDir();
  
  const agentStates: AgentState[] = agents.map(a => {
    // Calculate net worth = treasury + value of positions
    let positionValue = 0;
    const positions: { token: string; entryPrice: number; amount: number }[] = [];
    
    for (const [token, pos] of a.strategy.positions) {
      const currentPrice = marketData.find(t => t.symbol === token)?.priceUsd || pos.entryPrice;
      const pnlMultiplier = currentPrice / pos.entryPrice;
      positionValue += pos.amount * pnlMultiplier;
      positions.push({
        token,
        entryPrice: pos.entryPrice,
        amount: pos.amount / LAMPORTS_PER_SOL,
      });
    }
    
    return {
      name: a.name,
      generation: a.generation,
      treasury: a.treasury / LAMPORTS_PER_SOL,
      positions,
      netWorth: (a.treasury + positionValue) / LAMPORTS_PER_SOL,
      totalPnL: a.totalPnL / LAMPORTS_PER_SOL,
      tradeCount: a.tradeCount,
      winCount: a.winCount,
      lossCount: a.lossCount,
      isAlive: a.isAlive,
    };
  });
  
  const state = {
    timestamp: Date.now(),
    round,
    prices: marketData.map(t => ({ symbol: t.symbol, price: t.priceUsd, change24h: t.priceChange24h })),
    agents: agentStates,
    summary: {
      totalAgents: agents.length,
      aliveAgents: agents.filter(a => a.isAlive).length,
      totalNetWorth: agentStates.reduce((sum, a) => sum + a.netWorth, 0),
      totalTrades: agentStates.reduce((sum, a) => sum + a.tradeCount, 0),
    },
  };
  
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

async function runLiveEvolution() {
  console.log('🧬 BROOD LIVE EVOLUTION (Real Prices + Trade Logging)');
  console.log('═'.repeat(60));
  console.log('Trade log:', TRADE_LOG_PATH);
  console.log('State file:', STATE_PATH);
  console.log('');

  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  const walletPath = path.join(process.env.HOME || '~', '.config/solana/id.json');
  const secretKey = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  const wallet = new Wallet(keypair);
  
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const client = new BroodClient(provider);

  console.log('Wallet:', keypair.publicKey.toBase58());
  const balance = await connection.getBalance(keypair.publicKey);
  console.log('Balance:', (balance / LAMPORTS_PER_SOL).toFixed(4), 'SOL\n');

  // Load existing trade log
  let tradeLog = loadTradeLog();
  console.log(`📜 Loaded ${tradeLog.length} previous trades\n`);

  // Load agents from chain
  const knownAgents = [
    'Eve-9682', 'Adam-8379', 'Child-0906', 'Cain-0113', 
    'Abel-1612', 'Enoch-4211', 'Gen3-4521'
  ];
  
  const agents: LiveAgent[] = [];

  console.log('📡 Loading agents from devnet...');
  for (const name of knownAgents) {
    try {
      const onChain = await client.getAgent(name);
      if (onChain && onChain.isAlive) {
        const genome = getGenome(name);
        agents.push({
          name,
          generation: onChain.generation,
          treasury: Number(onChain.treasury),
          onChainTreasury: Number(onChain.treasury),
          isAlive: true,
          genome,
          strategy: new TradingStrategy(genome),
          totalPnL: 0,
          tradeCount: 0,
          winCount: 0,
          lossCount: 0,
        });
        console.log(`  ✓ ${name} (Gen ${onChain.generation}) - ${(Number(onChain.treasury) / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
      }
    } catch (e) {}
  }

  if (agents.length === 0) {
    console.log('\n❌ No live agents found!');
    return;
  }

  console.log(`\n📊 Fetching real prices...`);
  let marketData = await fetchRealPrices();
  if (marketData.length === 0) {
    console.log('❌ Could not fetch prices.');
    return;
  }
  
  console.log(`Found ${marketData.length} tokens:\n`);
  for (const token of marketData.slice(0, 6)) {
    const change = token.priceChange24h >= 0 ? `+${token.priceChange24h.toFixed(2)}` : token.priceChange24h.toFixed(2);
    console.log(`  ${token.symbol.padEnd(8)} $${token.priceUsd.toFixed(6).padStart(12)}  ${change}%`);
  }

  const MAX_ROUNDS = 30;
  let round = 0;

  console.log(`\n🔄 Starting evolution (${MAX_ROUNDS} rounds, ${ROUND_INTERVAL_MS/1000}s intervals)...`);
  console.log('Press Ctrl+C to stop\n');

  while (round < MAX_ROUNDS) {
    round++;
    console.log(`${'─'.repeat(60)}`);
    console.log(`🔄 ROUND ${round}/${MAX_ROUNDS} - ${new Date().toLocaleTimeString()}`);
    console.log(`${'─'.repeat(60)}`);

    // Fetch new prices
    const newMarketData = await fetchRealPrices();
    if (newMarketData.length > 0) {
      marketData = newMarketData;
    }

    // Each agent trades
    for (const agent of agents) {
      if (!agent.isAlive) continue;

      const { trades, newTreasury } = agent.strategy.executeRound(marketData, agent.treasury);
      const pnl = newTreasury - agent.treasury;
      agent.treasury = newTreasury;

      // Check death
      if (agent.treasury < DEATH_THRESHOLD) {
        agent.isAlive = false;
        console.log(`\n💀 ${agent.name} DIED! Treasury depleted.`);
        continue;
      }

      // Log and display trades
      if (trades.length > 0) {
        // Calculate net worth
        let positionValue = 0;
        for (const [token, pos] of agent.strategy.positions) {
          const price = marketData.find(t => t.symbol === token)?.priceUsd || pos.entryPrice;
          positionValue += pos.amount * (price / pos.entryPrice);
        }
        const netWorth = (agent.treasury + positionValue) / LAMPORTS_PER_SOL;
        
        const pnlStr = pnl >= 0 
          ? `\x1b[32m+${(pnl/LAMPORTS_PER_SOL).toFixed(4)}\x1b[0m` 
          : `\x1b[31m${(pnl/LAMPORTS_PER_SOL).toFixed(4)}\x1b[0m`;
        
        console.log(`\n🤖 ${agent.name} (Gen ${agent.generation})`);
        console.log(`   💰 Treasury: ${(agent.treasury/LAMPORTS_PER_SOL).toFixed(4)} SOL | Net Worth: ${netWorth.toFixed(4)} SOL (${pnlStr})`);
        
        for (const trade of trades) {
          const icon = trade.action === 'buy' ? '📈' : '📉';
          const token = marketData.find(t => t.symbol === trade.token);
          const priceStr = token ? `@ $${token.priceUsd.toFixed(6)}` : '';
          const pnlPct = trade.pnlPercent ? ` ${trade.pnlPercent >= 0 ? '+' : ''}${trade.pnlPercent.toFixed(2)}%` : '';
          console.log(`   ${icon} ${trade.action.toUpperCase()} ${trade.token} ${priceStr}${pnlPct}`);
          
          // Update agent stats
          agent.tradeCount++;
          if (trade.action === 'sell') {
            agent.totalPnL += trade.pnlLamports;
            if (trade.pnlLamports > 0) agent.winCount++;
            else agent.lossCount++;
          }
          
          // Log trade
          tradeLog.push({
            timestamp: Date.now(),
            round,
            agent: agent.name,
            generation: agent.generation,
            action: trade.action,
            token: trade.token,
            price: token?.priceUsd || 0,
            amount: trade.action === 'buy' ? agent.genome.settings.position_size_pct * agent.treasury / LAMPORTS_PER_SOL : 0,
            pnlPercent: trade.pnlPercent,
            pnlSol: trade.pnlLamports / LAMPORTS_PER_SOL,
            reason: trade.reason,
          });
        }
        
        // Show win/loss ratio
        if (agent.tradeCount > 0) {
          const sellCount = agent.winCount + agent.lossCount;
          if (sellCount > 0) {
            const winRate = (agent.winCount / sellCount * 100).toFixed(0);
            console.log(`   📊 W/L: ${agent.winCount}/${agent.lossCount} (${winRate}%) | Total P&L: ${(agent.totalPnL/LAMPORTS_PER_SOL).toFixed(4)} SOL`);
          }
        }
      }

      // Check spawn eligibility
      if (agent.treasury >= SPAWN_THRESHOLD && balance > 0.02 * LAMPORTS_PER_SOL) {
        console.log(`\n✨ ${agent.name} CAN SPAWN!`);
        // Spawn logic here...
      }
    }

    // Save state after each round
    saveTradeLog(tradeLog);
    saveState(agents, marketData, round);

    // Round summary
    const alive = agents.filter(a => a.isAlive);
    let totalNetWorth = 0;
    for (const a of alive) {
      let posValue = 0;
      for (const [token, pos] of a.strategy.positions) {
        const price = marketData.find(t => t.symbol === token)?.priceUsd || pos.entryPrice;
        posValue += pos.amount * (price / pos.entryPrice);
      }
      totalNetWorth += a.treasury + posValue;
    }
    
    console.log(`\n📊 Round ${round}: ${alive.length} agents | Net Worth: ${(totalNetWorth/LAMPORTS_PER_SOL).toFixed(4)} SOL | Trades logged: ${tradeLog.length}`);

    if (round < MAX_ROUNDS) {
      console.log(`⏳ Next round in ${ROUND_INTERVAL_MS/1000}s...\n`);
      await new Promise(r => setTimeout(r, ROUND_INTERVAL_MS));
    }
  }

  // Final report
  console.log(`\n${'═'.repeat(60)}`);
  console.log('🏆 EVOLUTION COMPLETE');
  console.log(`${'═'.repeat(60)}\n`);

  console.log('AGENT PERFORMANCE:\n');
  const sorted = agents.sort((a, b) => b.totalPnL - a.totalPnL);
  for (const a of sorted) {
    const sellCount = a.winCount + a.lossCount;
    const winRate = sellCount > 0 ? (a.winCount / sellCount * 100).toFixed(0) : 'N/A';
    const pnl = a.totalPnL >= 0 ? `+${(a.totalPnL/LAMPORTS_PER_SOL).toFixed(4)}` : (a.totalPnL/LAMPORTS_PER_SOL).toFixed(4);
    console.log(`${a.isAlive ? '🟢' : '💀'} ${a.name.padEnd(12)} Gen ${a.generation} | P&L: ${pnl} SOL | W/L: ${a.winCount}/${a.lossCount} (${winRate}%)`);
  }
  
  console.log(`\n📜 Trade log saved to: ${TRADE_LOG_PATH}`);
  console.log(`📊 State saved to: ${STATE_PATH}`);
}

process.on('SIGINT', () => {
  console.log('\n\n⛔ Stopping...');
  process.exit(0);
});

runLiveEvolution().catch(console.error);
