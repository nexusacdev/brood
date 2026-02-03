/**
 * BROOD Evolved Trading Strategy
 *
 * Uses GenomeV2 skills to make trading decisions.
 * Skills combine to generate buy/sell signals.
 * Learning adjusts weights based on outcomes.
 */
import { GenomeV2, SkillType } from './genome';
import { TokenData, Position, TradeResult } from './types';
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
export declare class EvolvedStrategy {
    genome: GenomeV2;
    positions: Map<string, PositionV2>;
    tradeHistory: TradeResult[];
    constructor(genome: GenomeV2);
    private evaluateSkill;
    analyzeToken(token: TokenData): TradeDecision;
    checkExit(position: PositionV2, currentPrice: number, round: number): TradeDecision | null;
    executeRound(marketData: TokenData[], treasuryLamports: number): {
        trades: TradeResult[];
        newTreasury: number;
        costs: number;
    };
    getGenomeForBreeding(): GenomeV2;
    getSkillSummary(): Array<{
        id: string;
        enabled: boolean;
        winRate: number;
        profit: number;
    }>;
}
export default EvolvedStrategy;
