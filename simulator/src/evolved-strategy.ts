/**
 * BROOD Evolved Trading Strategy
 * 
 * Uses GenomeV2 skills to make trading decisions.
 * Skills combine to generate buy/sell signals.
 * Learning adjusts weights based on outcomes.
 */

import { 
  GenomeV2, 
  Skill, 
  SkillType,
  applyLearning, 
  calculateCosts,
  bakeLearning 
} from './genome';
import { TokenData, Position, TradeResult } from './types';

const LAMPORTS_PER_SOL = 1_000_000_000;

interface TradeDecision {
  action: 'buy' | 'sell' | 'hold';
  token: string;
  confidence: number;
  skillsUsed: SkillType[];
  reasons: string[];
}

interface PositionV2 extends Position {
  skillsUsed: SkillType[];
  roundsHeld: number;
  peakPrice: number;
}

export class EvolvedStrategy {
  genome: GenomeV2;
  positions: Map<string, PositionV2> = new Map();
  tradeHistory: TradeResult[] = [];
  
  constructor(genome: GenomeV2) {
    this.genome = genome;
  }
  
  // Calculate signal from a single skill
  private evaluateSkill(skill: Skill, token: TokenData, treasury: number): { signal: number; reason: string } {
    if (!skill.enabled) return { signal: 0, reason: '' };
    
    const p = skill.params;
    let signal = 0;
    let reason = '';
    
    switch (skill.id) {
      case 'momentum_rider': {
        if (token.priceChange24h >= p.minMomentum) {
          const strength = Math.min(1, token.priceChange24h / (p.minMomentum * 2));
          signal = p.weight * strength;
          
          // Volume confirmation
          if (p.volumeConfirm && token.volume24h < 100000) {
            signal *= 0.5;
          }
          reason = `momentum +${token.priceChange24h.toFixed(1)}%`;
        }
        break;
      }
      
      case 'dip_buyer': {
        if (token.priceChange24h <= p.dipThreshold) {
          // Check for volume spike (capitulation buying)
          const volumeRatio = token.volume24h / 500000; // normalized
          if (volumeRatio >= p.volumeSpike || p.volumeSpike === 0) {
            signal = p.weight * Math.min(1, Math.abs(token.priceChange24h / p.dipThreshold));
            reason = `dip ${token.priceChange24h.toFixed(1)}% + volume`;
          }
        }
        break;
      }
      
      case 'volume_surge': {
        const volumeRatio = token.volume24h / p.minVolume;
        if (volumeRatio >= p.surgeMultiplier) {
          signal = p.weight * Math.min(1, volumeRatio / (p.surgeMultiplier * 2));
          reason = `volume surge ${volumeRatio.toFixed(1)}x`;
        }
        break;
      }
      
      case 'liquidity_guard': {
        // Negative signal for low liquidity
        if (token.liquidity < p.minLiquidity) {
          signal = p.penaltyWeight; // negative
          reason = `low liquidity $${(token.liquidity / 1000).toFixed(0)}k`;
        }
        break;
      }
      
      case 'rug_detector': {
        // Check for rug signals (simplified - would need more data IRL)
        const suspiciousVolatility = Math.abs(token.priceChange24h) > 50;
        const lowLiquidity = token.liquidity < 20000;
        
        if (suspiciousVolatility && lowLiquidity) {
          signal = p.penaltyWeight;
          reason = `rug risk: volatility + low liquidity`;
        }
        break;
      }
      
      case 'trend_follower': {
        // Simplified: use 24h as proxy for trend
        // In reality would need multi-day data
        const trendStrength = Math.abs(token.priceChange24h) / 20;
        if (trendStrength >= p.minTrendStrength && token.priceChange24h > 0) {
          signal = p.weight * trendStrength;
          reason = `uptrend strength ${(trendStrength * 100).toFixed(0)}%`;
        }
        break;
      }
      
      case 'mean_reversion': {
        // Bet on return to mean after large moves
        if (Math.abs(token.priceChange24h) > p.deviationThreshold * 10) {
          // Opposite signal to current move
          signal = p.weight * (token.priceChange24h > 0 ? -0.5 : 0.5);
          reason = `mean reversion expected`;
        }
        break;
      }
      
      case 'volatility_hunter': {
        const volatility = Math.abs(token.priceChange24h) / 100;
        if (volatility >= p.minVolatility && volatility <= p.maxVolatility) {
          signal = p.weight;
          reason = `good volatility ${(volatility * 100).toFixed(1)}%`;
        }
        break;
      }
      
      case 'whale_tracker': {
        // Simplified: high volume = whale activity
        if (token.volume24h > p.whaleThreshold * 100) {
          signal = p.followWeight * 0.5;
          reason = `whale activity detected`;
        }
        break;
      }
      
      default:
        break;
    }
    
    return { signal, reason };
  }
  
  // Evaluate all skills and combine signals
  analyzeToken(token: TokenData): TradeDecision {
    const enabledSkills = this.genome.skills.filter(s => s.enabled);
    
    let totalSignal = 0;
    const skillsUsed: SkillType[] = [];
    const reasons: string[] = [];
    
    for (const skill of enabledSkills) {
      const { signal, reason } = this.evaluateSkill(skill, token, 0);
      
      if (signal !== 0) {
        totalSignal += signal;
        skillsUsed.push(skill.id);
        if (reason) reasons.push(reason);
      }
    }
    
    // Normalize signal to 0-1 confidence
    const confidence = Math.max(0, Math.min(1, (totalSignal + 1) / 2));
    
    // Decision threshold
    const buyThreshold = 0.55;
    const action = confidence >= buyThreshold ? 'buy' : 'hold';
    
    return {
      action,
      token: token.symbol,
      confidence,
      skillsUsed,
      reasons,
    };
  }
  
  // Check position for exit signals
  checkExit(position: PositionV2, currentPrice: number, round: number): TradeDecision | null {
    const { exit } = this.genome;
    const pnlPct = (currentPrice - position.entryPrice) / position.entryPrice;
    
    // Update peak price for trailing stop
    position.peakPrice = Math.max(position.peakPrice, currentPrice);
    position.roundsHeld++;
    
    // Take profit
    if (pnlPct >= exit.takeProfitPct) {
      return {
        action: 'sell',
        token: position.token,
        confidence: 1,
        skillsUsed: position.skillsUsed,
        reasons: [`take profit +${(pnlPct * 100).toFixed(1)}%`],
      };
    }
    
    // Stop loss
    if (pnlPct <= -exit.stopLossPct) {
      return {
        action: 'sell',
        token: position.token,
        confidence: 1,
        skillsUsed: position.skillsUsed,
        reasons: [`stop loss ${(pnlPct * 100).toFixed(1)}%`],
      };
    }
    
    // Trailing stop
    if (exit.trailingStop) {
      const drawdown = (position.peakPrice - currentPrice) / position.peakPrice;
      if (drawdown >= exit.trailingStopPct && pnlPct > 0) {
        return {
          action: 'sell',
          token: position.token,
          confidence: 1,
          skillsUsed: position.skillsUsed,
          reasons: [`trailing stop, ${(drawdown * 100).toFixed(1)}% from peak`],
        };
      }
    }
    
    // Time decay
    if (position.roundsHeld >= exit.maxHoldingRounds) {
      return {
        action: 'sell',
        token: position.token,
        confidence: 0.8,
        skillsUsed: position.skillsUsed,
        reasons: [`time decay, held ${position.roundsHeld} rounds`],
      };
    }
    
    return null;
  }
  
  // Execute a trading round
  executeRound(
    marketData: TokenData[],
    treasuryLamports: number
  ): { trades: TradeResult[]; newTreasury: number; costs: number } {
    const trades: TradeResult[] = [];
    let treasury = treasuryLamports;
    
    // Calculate running costs
    const costs = calculateCosts(this.genome);
    const costLamports = Math.floor(costs * LAMPORTS_PER_SOL);
    treasury -= costLamports;
    
    // Check existing positions first
    for (const [symbol, position] of this.positions) {
      const currentToken = marketData.find(t => t.symbol === symbol);
      if (!currentToken) continue;
      
      const exitDecision = this.checkExit(position, currentToken.priceUsd, 0);
      if (exitDecision) {
        const pnlPct = (currentToken.priceUsd - position.entryPrice) / position.entryPrice;
        const pnlLamports = Math.floor(position.amount * pnlPct);
        const isWin = pnlLamports > 0;
        
        treasury += position.amount + pnlLamports;
        this.positions.delete(symbol);
        
        const result: TradeResult = {
          token: symbol,
          action: 'sell',
          entryPrice: position.entryPrice,
          exitPrice: currentToken.priceUsd,
          pnlPercent: pnlPct * 100,
          pnlLamports,
          reason: exitDecision.reasons.join(', '),
        };
        
        trades.push(result);
        this.tradeHistory.push(result);
        
        // Apply learning from this trade
        applyLearning(
          this.genome,
          position.skillsUsed,
          pnlLamports / LAMPORTS_PER_SOL,
          isWin
        );
      }
    }
    
    // Look for new entries
    const maxPositions = 3;
    const positionSizePct = 0.15;
    
    if (this.positions.size < maxPositions) {
      // Sort by confidence (best opportunities first)
      const opportunities = marketData
        .filter(t => !this.positions.has(t.symbol))
        .map(t => ({ token: t, decision: this.analyzeToken(t) }))
        .filter(o => o.decision.action === 'buy')
        .sort((a, b) => b.decision.confidence - a.decision.confidence);
      
      for (const opp of opportunities) {
        if (this.positions.size >= maxPositions) break;
        
        const positionSize = Math.floor(treasury * positionSizePct);
        if (positionSize < 0.01 * LAMPORTS_PER_SOL) continue;
        
        treasury -= positionSize;
        
        this.positions.set(opp.token.symbol, {
          token: opp.token.symbol,
          entryPrice: opp.token.priceUsd,
          amount: positionSize,
          entryTime: Date.now(),
          skillsUsed: opp.decision.skillsUsed,
          roundsHeld: 0,
          peakPrice: opp.token.priceUsd,
        });
        
        trades.push({
          token: opp.token.symbol,
          action: 'buy',
          entryPrice: opp.token.priceUsd,
          pnlLamports: 0,
          reason: opp.decision.reasons.join(', '),
        });
      }
    }
    
    return { trades, newTreasury: treasury, costs: costLamports / LAMPORTS_PER_SOL };
  }
  
  // Get genome ready for breeding (bake in learned weights)
  getGenomeForBreeding(): GenomeV2 {
    return bakeLearning(this.genome);
  }
  
  // Summary of active skills and their performance
  getSkillSummary(): Array<{ id: string; enabled: boolean; winRate: number; profit: number }> {
    return this.genome.skills.map(s => ({
      id: s.id,
      enabled: s.enabled,
      winRate: s.winRate,
      profit: s.profitFromSkill,
    }));
  }
}

export default EvolvedStrategy;
