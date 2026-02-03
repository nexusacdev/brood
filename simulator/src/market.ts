import fetch from 'node-fetch';
import { TokenData } from './types';

const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex';

export async function fetchTrendingTokens(limit: number = 10): Promise<TokenData[]> {
  try {
    // Fetch trending Solana pairs
    const response = await fetch(`${DEXSCREENER_API}/search?q=sol`);
    const data = await response.json() as any;
    
    if (!data.pairs) return [];
    
    // Filter for Solana tokens with decent liquidity
    const solanaPairs = data.pairs
      .filter((p: any) => 
        p.chainId === 'solana' && 
        p.liquidity?.usd > 10000 &&
        p.volume?.h24 > 5000
      )
      .slice(0, limit);
    
    return solanaPairs.map((p: any) => ({
      symbol: p.baseToken?.symbol || 'UNKNOWN',
      name: p.baseToken?.name || 'Unknown Token',
      address: p.baseToken?.address || '',
      priceUsd: parseFloat(p.priceUsd) || 0,
      priceChange24h: p.priceChange?.h24 || 0,
      volume24h: p.volume?.h24 || 0,
      liquidity: p.liquidity?.usd || 0,
      fdv: p.fdv || 0,
    }));
  } catch (error) {
    console.error('Error fetching market data:', error);
    return [];
  }
}

export async function fetchTokenPrice(address: string): Promise<number | null> {
  try {
    const response = await fetch(`${DEXSCREENER_API}/tokens/${address}`);
    const data = await response.json() as any;
    
    if (data.pairs && data.pairs.length > 0) {
      return parseFloat(data.pairs[0].priceUsd) || null;
    }
    return null;
  } catch {
    return null;
  }
}

// Generate mock market data for simulation (when API fails or for testing)
export function generateMockMarket(count: number = 10): TokenData[] {
  const mockTokens = [
    { symbol: 'BONK', base: 0.00002 },
    { symbol: 'WIF', base: 2.5 },
    { symbol: 'JUP', base: 0.8 },
    { symbol: 'PYTH', base: 0.4 },
    { symbol: 'RAY', base: 3.2 },
    { symbol: 'ORCA', base: 4.1 },
    { symbol: 'MNGO', base: 0.03 },
    { symbol: 'SAMO', base: 0.01 },
    { symbol: 'COPE', base: 0.15 },
    { symbol: 'FIDA', base: 0.25 },
  ];
  
  return mockTokens.slice(0, count).map((t, i) => {
    // Random price movement -30% to +50%
    const change = (Math.random() - 0.4) * 80;
    const price = t.base * (1 + change / 100);
    
    return {
      symbol: t.symbol,
      name: `${t.symbol} Token`,
      address: `mock${i}...`,
      priceUsd: price,
      priceChange24h: change,
      volume24h: Math.random() * 1000000,
      liquidity: Math.random() * 500000 + 50000,
      fdv: price * 1000000000,
    };
  });
}
