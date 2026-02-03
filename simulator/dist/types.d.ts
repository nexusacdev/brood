export interface TokenData {
    symbol: string;
    name: string;
    address: string;
    priceUsd: number;
    priceChange24h: number;
    volume24h: number;
    liquidity: number;
    fdv: number;
}
export interface TradeSignal {
    action: 'buy' | 'sell' | 'hold';
    token: TokenData;
    confidence: number;
    reason: string;
}
export interface Position {
    token: string;
    entryPrice: number;
    amount: number;
    entryTime: number;
}
export interface TradeResult {
    token: string;
    action: 'buy' | 'sell';
    entryPrice: number;
    exitPrice?: number;
    pnlPercent?: number;
    pnlLamports: number;
    reason: string;
}
export interface AgentGenome {
    settings: {
        risk_tolerance: number;
        position_size_pct: number;
        profit_target_pct: number;
        stop_loss_pct: number;
        min_confidence: number;
        max_concurrent_positions?: number;
        cooldown_minutes?: number;
    };
    skills: Array<{
        name: string;
        params?: Record<string, any>;
    }>;
}
export interface SimulationRound {
    timestamp: number;
    agents: AgentRoundResult[];
    marketData: TokenData[];
}
export interface AgentRoundResult {
    agentName: string;
    agentId: string;
    generation: number;
    treasuryBefore: number;
    treasuryAfter: number;
    trades: TradeResult[];
    canSpawn: boolean;
    isDead: boolean;
}
