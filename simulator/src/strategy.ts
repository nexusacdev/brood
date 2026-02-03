import { TokenData, TradeSignal, AgentGenome, Position, TradeResult } from './types';

const LAMPORTS_PER_SOL = 1_000_000_000;

export class TradingStrategy {
  genome: AgentGenome;
  positions: Map<string, Position> = new Map();
  
  constructor(genome: AgentGenome) {
    this.genome = genome;
  }
  
  // Analyze market and generate signals based on genome
  analyzeToken(token: TokenData): TradeSignal {
    const { settings } = this.genome;
    
    // More sensitive momentum strategy for real market conditions
    let confidence = 0;
    let reasons: string[] = [];
    
    // Price momentum signal (real markets move less than memes)
    if (token.priceChange24h > 3) {
      confidence += 0.35;
      reasons.push(`+${token.priceChange24h.toFixed(1)}% momentum`);
    } else if (token.priceChange24h > 1) {
      confidence += 0.25;
      reasons.push(`+${token.priceChange24h.toFixed(1)}% uptick`);
    } else if (token.priceChange24h > 0) {
      confidence += 0.15;
      reasons.push('positive trend');
    } else if (token.priceChange24h < -3) {
      confidence -= 0.2;
      reasons.push(`${token.priceChange24h.toFixed(1)}% down`);
    }
    
    // Volume signal (lower threshold for real tokens)
    if (token.volume24h > 1000000) {
      confidence += 0.2;
      reasons.push('high volume');
    } else if (token.volume24h > 100000) {
      confidence += 0.1;
      reasons.push('decent volume');
    }
    
    // Liquidity check
    if (token.liquidity > 1000000) {
      confidence += 0.15;
      reasons.push('excellent liquidity');
    } else if (token.liquidity > 100000) {
      confidence += 0.1;
      reasons.push('good liquidity');
    } else if (token.liquidity < 20000) {
      confidence -= 0.3;
      reasons.push('low liquidity risk');
    }
    
    // Risk tolerance adjustment
    // Higher risk tolerance = more likely to take marginal trades
    confidence += (settings.risk_tolerance - 0.5) * 0.4;
    
    // Normalize confidence to 0-1
    confidence = Math.max(0, Math.min(1, confidence));
    
    // Decision
    if (confidence >= settings.min_confidence) {
      return {
        action: 'buy',
        token,
        confidence,
        reason: reasons.join(', '),
      };
    }
    
    return {
      action: 'hold',
      token,
      confidence,
      reason: 'below confidence threshold',
    };
  }
  
  // Check existing positions for exit signals
  checkPosition(position: Position, currentPrice: number): TradeSignal | null {
    const { settings } = this.genome;
    
    // Add micro-volatility simulation (realistic order book movement)
    const microVolatility = (Math.random() - 0.5) * 0.04; // +/- 2%
    const effectivePrice = currentPrice * (1 + microVolatility);
    const pnlPercent = ((effectivePrice - position.entryPrice) / position.entryPrice) * 100;
    
    // Take profit
    if (pnlPercent >= settings.profit_target_pct * 100) {
      return {
        action: 'sell',
        token: { symbol: position.token } as TokenData,
        confidence: 1,
        reason: `take profit at +${pnlPercent.toFixed(1)}%`,
      };
    }
    
    // Stop loss
    if (pnlPercent <= -settings.stop_loss_pct * 100) {
      return {
        action: 'sell',
        token: { symbol: position.token } as TokenData,
        confidence: 1,
        reason: `stop loss at ${pnlPercent.toFixed(1)}%`,
      };
    }
    
    return null;
  }
  
  // Execute a simulated trading round
  executeRound(
    marketData: TokenData[],
    treasuryLamports: number
  ): { trades: TradeResult[]; newTreasury: number } {
    const { settings } = this.genome;
    const trades: TradeResult[] = [];
    let treasury = treasuryLamports;
    
    // Check existing positions first
    for (const [symbol, position] of this.positions) {
      const currentToken = marketData.find(t => t.symbol === symbol);
      if (!currentToken) continue;
      
      const exitSignal = this.checkPosition(position, currentToken.priceUsd);
      if (exitSignal) {
        const pnlPercent = ((currentToken.priceUsd - position.entryPrice) / position.entryPrice);
        const pnlLamports = Math.floor(position.amount * pnlPercent);
        
        treasury += position.amount + pnlLamports;
        this.positions.delete(symbol);
        
        trades.push({
          token: symbol,
          action: 'sell',
          entryPrice: position.entryPrice,
          exitPrice: currentToken.priceUsd,
          pnlPercent: pnlPercent * 100,
          pnlLamports,
          reason: exitSignal.reason,
        });
      }
    }
    
    // Look for new entries
    const maxPositions = settings.max_concurrent_positions || 3;
    if (this.positions.size < maxPositions) {
      for (const token of marketData) {
        if (this.positions.has(token.symbol)) continue;
        if (this.positions.size >= maxPositions) break;
        
        const signal = this.analyzeToken(token);
        if (signal.action === 'buy') {
          const positionSize = Math.floor(treasury * settings.position_size_pct);
          if (positionSize < 0.01 * LAMPORTS_PER_SOL) continue; // Min 0.01 SOL
          
          treasury -= positionSize;
          
          this.positions.set(token.symbol, {
            token: token.symbol,
            entryPrice: token.priceUsd,
            amount: positionSize,
            entryTime: Date.now(),
          });
          
          trades.push({
            token: token.symbol,
            action: 'buy',
            entryPrice: token.priceUsd,
            pnlLamports: 0,
            reason: signal.reason,
          });
        }
      }
    }
    
    return { trades, newTreasury: treasury };
  }
}

// Simulate price movement for existing positions
export function simulatePriceMovement(tokens: TokenData[]): TokenData[] {
  return tokens.map(token => ({
    ...token,
    // Random walk: -15% to +20% per round
    priceUsd: token.priceUsd * (1 + (Math.random() - 0.4) * 0.35),
    priceChange24h: (Math.random() - 0.4) * 50,
  }));
}
