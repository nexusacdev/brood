import { TokenData, TradeSignal, AgentGenome, Position, TradeResult } from './types';
export declare class TradingStrategy {
    genome: AgentGenome;
    positions: Map<string, Position>;
    constructor(genome: AgentGenome);
    analyzeToken(token: TokenData): TradeSignal;
    checkPosition(position: Position, currentPrice: number): TradeSignal | null;
    executeRound(marketData: TokenData[], treasuryLamports: number): {
        trades: TradeResult[];
        newTreasury: number;
    };
}
export declare function simulatePriceMovement(tokens: TokenData[]): TokenData[];
