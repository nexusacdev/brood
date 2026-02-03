/**
 * BROOD GENOME v2 - Evolutionary Trading DNA
 *
 * Skills can be inherited, learned, enabled/disabled based on economic pressure.
 * The genome IS the agent's survival strategy.
 */
export type SkillType = 'momentum_rider' | 'dip_buyer' | 'volume_surge' | 'liquidity_guard' | 'rug_detector' | 'trend_follower' | 'mean_reversion' | 'volatility_hunter' | 'whale_tracker' | 'time_decay_exit';
export interface Skill {
    id: SkillType;
    enabled: boolean;
    params: Record<string, number>;
    costPerRound: number;
    tradesUsing: number;
    profitFromSkill: number;
    winRate: number;
    learnedAtGeneration: number;
    inheritedFrom?: string;
}
export interface LearningGenes {
    learningRate: number;
    memoryDepth: number;
    explorationRate: number;
    skillDiscoveryRate: number;
    adaptationSpeed: number;
}
export interface ExitStrategy {
    takeProfitPct: number;
    stopLossPct: number;
    trailingStop: boolean;
    trailingStopPct: number;
    maxHoldingRounds: number;
    timeDecayPenalty: number;
}
export interface EconomicState {
    baseCostPerRound: number;
    totalSkillCost: number;
    runway: number;
    costPressure: number;
}
export interface Lineage {
    parentName: string | null;
    parentGenomeHash: string | null;
    generation: number;
    birthTimestamp: number;
    mutations: MutationRecord[];
}
export interface MutationRecord {
    field: string;
    oldValue: any;
    newValue: any;
    mutationType: 'tweak' | 'enable' | 'disable' | 'discover' | 'inherit';
}
export interface GenomeV2 {
    version: '2.0';
    agentName: string;
    skills: Skill[];
    learning: LearningGenes;
    exit: ExitStrategy;
    economics: EconomicState;
    lineage: Lineage;
}
export declare const SKILL_TEMPLATES: Record<SkillType, Omit<Skill, 'enabled' | 'learnedAtGeneration' | 'inheritedFrom'>>;
export declare function createGenesisGenome(agentName: string): GenomeV2;
export declare function hashGenome(genome: GenomeV2): string;
export declare function mutateGenome(parentGenome: GenomeV2, childName: string, mutationRate?: number): GenomeV2;
export declare function applyLearning(genome: GenomeV2, skillsUsed: SkillType[], profit: number, isWin: boolean): void;
export declare function calculateCosts(genome: GenomeV2): number;
export declare function bakeLearning(genome: GenomeV2): GenomeV2;
declare const _default: {
    createGenesisGenome: typeof createGenesisGenome;
    mutateGenome: typeof mutateGenome;
    hashGenome: typeof hashGenome;
    applyLearning: typeof applyLearning;
    calculateCosts: typeof calculateCosts;
    bakeLearning: typeof bakeLearning;
    SKILL_TEMPLATES: Record<SkillType, Omit<Skill, "enabled" | "learnedAtGeneration" | "inheritedFrom">>;
};
export default _default;
