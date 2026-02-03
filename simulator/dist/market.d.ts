import { TokenData } from './types';
export declare function fetchRealPrices(): Promise<TokenData[]>;
export declare function fetchTrendingTokens(limit?: number): Promise<TokenData[]>;
export declare function fetchTokenPrice(address: string): Promise<number | null>;
export declare function generateMockMarket(count?: number): TokenData[];
export declare function calculatePriceChanges(oldPrices: Map<string, number>, newPrices: TokenData[]): Map<string, number>;
