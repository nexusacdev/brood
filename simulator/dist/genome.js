"use strict";
/**
 * BROOD GENOME v2 - Evolutionary Trading DNA
 *
 * Skills can be inherited, learned, enabled/disabled based on economic pressure.
 * The genome IS the agent's survival strategy.
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
exports.SKILL_TEMPLATES = void 0;
exports.createGenesisGenome = createGenesisGenome;
exports.hashGenome = hashGenome;
exports.mutateGenome = mutateGenome;
exports.applyLearning = applyLearning;
exports.calculateCosts = calculateCosts;
exports.bakeLearning = bakeLearning;
const crypto = __importStar(require("crypto"));
// Default skill templates
exports.SKILL_TEMPLATES = {
    momentum_rider: {
        id: 'momentum_rider',
        params: {
            minMomentum: 3, // minimum 24h % change
            weight: 0.4, // signal weight
            volumeConfirm: 0.5, // require volume confirmation
        },
        costPerRound: 0.0001,
        tradesUsing: 0,
        profitFromSkill: 0,
        winRate: 0.5,
    },
    dip_buyer: {
        id: 'dip_buyer',
        params: {
            dipThreshold: -5, // buy when down X%
            volumeSpike: 1.5, // require volume spike multiplier
            weight: 0.3,
        },
        costPerRound: 0.00015,
        tradesUsing: 0,
        profitFromSkill: 0,
        winRate: 0.5,
    },
    volume_surge: {
        id: 'volume_surge',
        params: {
            surgeMultiplier: 2.0, // volume vs average
            minVolume: 100000,
            weight: 0.35,
        },
        costPerRound: 0.0001,
        tradesUsing: 0,
        profitFromSkill: 0,
        winRate: 0.5,
    },
    liquidity_guard: {
        id: 'liquidity_guard',
        params: {
            minLiquidity: 50000,
            penaltyWeight: -0.5, // negative weight = avoid signal
        },
        costPerRound: 0.00005,
        tradesUsing: 0,
        profitFromSkill: 0,
        winRate: 0.5,
    },
    rug_detector: {
        id: 'rug_detector',
        params: {
            maxHolderConcentration: 0.3,
            liquidityDropThreshold: -20,
            penaltyWeight: -0.6,
        },
        costPerRound: 0.0002,
        tradesUsing: 0,
        profitFromSkill: 0,
        winRate: 0.5,
    },
    trend_follower: {
        id: 'trend_follower',
        params: {
            trendDays: 3,
            minTrendStrength: 0.6,
            weight: 0.3,
        },
        costPerRound: 0.00015,
        tradesUsing: 0,
        profitFromSkill: 0,
        winRate: 0.5,
    },
    mean_reversion: {
        id: 'mean_reversion',
        params: {
            deviationThreshold: 2.0, // standard deviations
            weight: 0.25,
        },
        costPerRound: 0.00015,
        tradesUsing: 0,
        profitFromSkill: 0,
        winRate: 0.5,
    },
    volatility_hunter: {
        id: 'volatility_hunter',
        params: {
            minVolatility: 0.1,
            maxVolatility: 0.5,
            weight: 0.2,
        },
        costPerRound: 0.0001,
        tradesUsing: 0,
        profitFromSkill: 0,
        winRate: 0.5,
    },
    whale_tracker: {
        id: 'whale_tracker',
        params: {
            whaleThreshold: 10000, // USD
            followWeight: 0.35,
        },
        costPerRound: 0.00025,
        tradesUsing: 0,
        profitFromSkill: 0,
        winRate: 0.5,
    },
    time_decay_exit: {
        id: 'time_decay_exit',
        params: {
            maxHoldingRounds: 20,
            decayRate: 0.05,
        },
        costPerRound: 0.00005,
        tradesUsing: 0,
        profitFromSkill: 0,
        winRate: 0.5,
    },
};
// Create a Genesis genome (first generation)
function createGenesisGenome(agentName) {
    const basicSkills = ['momentum_rider', 'volume_surge', 'liquidity_guard'];
    return {
        version: '2.0',
        agentName,
        skills: basicSkills.map(skillId => ({
            ...exports.SKILL_TEMPLATES[skillId],
            enabled: true,
            learnedAtGeneration: 1,
        })),
        learning: {
            learningRate: 0.1,
            memoryDepth: 30,
            explorationRate: 0.1,
            skillDiscoveryRate: 0.02,
            adaptationSpeed: 0.15,
        },
        exit: {
            takeProfitPct: 0.05,
            stopLossPct: 0.03,
            trailingStop: true,
            trailingStopPct: 0.02,
            maxHoldingRounds: 50,
            timeDecayPenalty: 0.01,
        },
        economics: {
            baseCostPerRound: 0.0001,
            totalSkillCost: 0, // calculated dynamically
            runway: 0,
            costPressure: 0,
        },
        lineage: {
            parentName: null,
            parentGenomeHash: null,
            generation: 1,
            birthTimestamp: Date.now(),
            mutations: [],
        },
    };
}
// Hash a genome for lineage tracking
function hashGenome(genome) {
    const stripped = {
        skills: genome.skills.map(s => ({ id: s.id, params: s.params, enabled: s.enabled })),
        learning: genome.learning,
        exit: genome.exit,
    };
    return crypto.createHash('sha256').update(JSON.stringify(stripped)).digest('hex').slice(0, 16);
}
// Mutate a genome for breeding
function mutateGenome(parentGenome, childName, mutationRate = 0.15) {
    const child = JSON.parse(JSON.stringify(parentGenome));
    const mutations = [];
    child.agentName = childName;
    child.lineage = {
        parentName: parentGenome.agentName,
        parentGenomeHash: hashGenome(parentGenome),
        generation: parentGenome.lineage.generation + 1,
        birthTimestamp: Date.now(),
        mutations: [],
    };
    // Mutate skill parameters
    for (const skill of child.skills) {
        // Inherit skill from parent
        skill.inheritedFrom = parentGenome.agentName;
        // Reset performance tracking (child starts fresh)
        skill.tradesUsing = 0;
        skill.profitFromSkill = 0;
        skill.winRate = 0.5;
        // Mutate parameters
        for (const [key, value] of Object.entries(skill.params)) {
            if (Math.random() < mutationRate) {
                const delta = (Math.random() - 0.5) * 0.4 * value;
                const newValue = key.includes('weight')
                    ? Math.max(-1, Math.min(1, value + delta)) // weights bounded -1 to 1
                    : Math.max(0, value + delta); // others non-negative
                mutations.push({
                    field: `skills.${skill.id}.params.${key}`,
                    oldValue: value,
                    newValue,
                    mutationType: 'tweak',
                });
                skill.params[key] = newValue;
            }
        }
        // Small chance to toggle skill
        if (Math.random() < mutationRate * 0.3) {
            mutations.push({
                field: `skills.${skill.id}.enabled`,
                oldValue: skill.enabled,
                newValue: !skill.enabled,
                mutationType: skill.enabled ? 'disable' : 'enable',
            });
            skill.enabled = !skill.enabled;
        }
    }
    // Mutate learning genes
    for (const [key, value] of Object.entries(child.learning)) {
        if (Math.random() < mutationRate) {
            const delta = (Math.random() - 0.5) * 0.3 * value;
            const newValue = Math.max(0.01, Math.min(1, value + delta));
            mutations.push({
                field: `learning.${key}`,
                oldValue: value,
                newValue,
                mutationType: 'tweak',
            });
            child.learning[key] = newValue;
        }
    }
    // Mutate exit strategy
    for (const [key, value] of Object.entries(child.exit)) {
        if (typeof value === 'number' && Math.random() < mutationRate) {
            const delta = (Math.random() - 0.5) * 0.3 * value;
            const newValue = Math.max(0.001, value + delta);
            mutations.push({
                field: `exit.${key}`,
                oldValue: value,
                newValue,
                mutationType: 'tweak',
            });
            child.exit[key] = newValue;
        }
    }
    // Chance to discover a new skill (from parent's performance + mutation)
    const undiscoveredSkills = Object.keys(exports.SKILL_TEMPLATES).filter(s => !child.skills.some(cs => cs.id === s));
    if (undiscoveredSkills.length > 0 && Math.random() < child.learning.skillDiscoveryRate) {
        const newSkillId = undiscoveredSkills[Math.floor(Math.random() * undiscoveredSkills.length)];
        const newSkill = {
            ...exports.SKILL_TEMPLATES[newSkillId],
            enabled: true,
            learnedAtGeneration: child.lineage.generation,
        };
        mutations.push({
            field: 'skills',
            oldValue: null,
            newValue: newSkillId,
            mutationType: 'discover',
        });
        child.skills.push(newSkill);
    }
    child.lineage.mutations = mutations;
    return child;
}
// Apply learning from trade results
function applyLearning(genome, skillsUsed, profit, isWin) {
    const { learningRate, adaptationSpeed } = genome.learning;
    for (const skillId of skillsUsed) {
        const skill = genome.skills.find(s => s.id === skillId);
        if (!skill)
            continue;
        // Update stats
        skill.tradesUsing++;
        skill.profitFromSkill += profit;
        skill.winRate = (skill.winRate * (skill.tradesUsing - 1) + (isWin ? 1 : 0)) / skill.tradesUsing;
        // Adjust weight based on outcome
        const adjustment = profit * learningRate * 10; // scale profit to reasonable adjustment
        if (skill.params.weight !== undefined) {
            skill.params.weight = Math.max(-1, Math.min(1, skill.params.weight + adjustment));
        }
    }
    // Economic pressure: disable worst-performing skills if losing money
    if (profit < 0) {
        genome.economics.costPressure = Math.min(1, genome.economics.costPressure + adaptationSpeed);
        // Find worst performing enabled skill
        const enabledSkills = genome.skills.filter(s => s.enabled);
        if (enabledSkills.length > 1 && genome.economics.costPressure > 0.7) {
            const worstSkill = enabledSkills.reduce((worst, s) => s.winRate < worst.winRate ? s : worst);
            if (worstSkill.winRate < 0.4) {
                worstSkill.enabled = false;
                genome.economics.costPressure *= 0.5; // relief after cutting
            }
        }
    }
    else {
        // Winning reduces cost pressure
        genome.economics.costPressure = Math.max(0, genome.economics.costPressure - adaptationSpeed * 0.5);
        // Maybe re-enable a disabled skill to explore
        if (Math.random() < genome.learning.explorationRate) {
            const disabledSkills = genome.skills.filter(s => !s.enabled);
            if (disabledSkills.length > 0) {
                const toEnable = disabledSkills[Math.floor(Math.random() * disabledSkills.length)];
                toEnable.enabled = true;
                toEnable.winRate = 0.5; // reset for fresh chance
            }
        }
    }
}
// Calculate total running costs
function calculateCosts(genome) {
    const skillCosts = genome.skills
        .filter(s => s.enabled)
        .reduce((sum, s) => sum + s.costPerRound, 0);
    genome.economics.totalSkillCost = skillCosts;
    return genome.economics.baseCostPerRound + skillCosts;
}
// Bake learned weights into genome for breeding (Lamarckian evolution)
function bakeLearning(genome) {
    // The learned weights are already in the skill params
    // This function ensures the best performing skills are prominent
    const baked = JSON.parse(JSON.stringify(genome));
    // Boost weights of high-performing skills
    for (const skill of baked.skills) {
        if (skill.tradesUsing >= 5) { // enough data
            const performanceBoost = (skill.winRate - 0.5) * 0.2;
            if (skill.params.weight !== undefined) {
                skill.params.weight = Math.max(-1, Math.min(1, skill.params.weight + performanceBoost));
            }
        }
    }
    return baked;
}
exports.default = {
    createGenesisGenome,
    mutateGenome,
    hashGenome,
    applyLearning,
    calculateCosts,
    bakeLearning,
    SKILL_TEMPLATES: exports.SKILL_TEMPLATES,
};
