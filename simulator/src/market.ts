import fetch from 'node-fetch';
import { TokenData } from './types';

// Popular Solana tokens with mainnet addresses
const TRACKED_TOKENS = [
  { symbol: 'SOL', address: 'So11111111111111111111111111111111111111112', name: 'Solana' },
  { symbol: 'BONK', address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', name: 'Bonk' },
  { symbol: 'WIF', address: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', name: 'dogwifhat' },
  { symbol: 'JUP', address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', name: 'Jupiter' },
  { symbol: 'PYTH', address: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3', name: 'Pyth' },
  { symbol: 'RAY', address: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', name: 'Raydium' },
  { symbol: 'ORCA', address: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE', name: 'Orca' },
  { symbol: 'JTO', address: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL', name: 'Jito' },
  { symbol: 'RENDER', address: 'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof', name: 'Render' },
  { symbol: 'HNT', address: 'hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux', name: 'Helium' },
];

// DexScreener API (more reliable, includes volume/liquidity)
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex';

export async function fetchRealPrices(): Promise<TokenData[]> {
  try {
    const tokens: TokenData[] = [];
    
    // Fetch each token from DexScreener
    for (const token of TRACKED_TOKENS) {
      try {
        const response = await fetch(`${DEXSCREENER_API}/tokens/${token.address}`);
        const data = await response.json() as any;
        
        if (data.pairs && data.pairs.length > 0) {
          // Get the most liquid Solana pair
          const solanaPairs = data.pairs
            .filter((p: any) => p.chainId === 'solana')
            .sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
          
          if (solanaPairs.length > 0) {
            const pair = solanaPairs[0];
            tokens.push({
              symbol: token.symbol,
              name: token.name,
              address: token.address,
              priceUsd: parseFloat(pair.priceUsd) || 0,
              priceChange24h: pair.priceChange?.h24 || 0,
              volume24h: pair.volume?.h24 || 0,
              liquidity: pair.liquidity?.usd || 0,
              fdv: pair.fdv || 0,
            });
          }
        }
      } catch (e) {
        // Skip this token if fetch fails
      }
      
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));
    }
    
    return tokens;
  } catch (error) {
    console.error('Error fetching DexScreener prices:', error);
    return [];
  }
}

// Fetch with DexScreener as backup (more data but rate limited)
export async function fetchTrendingTokens(limit: number = 10): Promise<TokenData[]> {
  // Try Jupiter first (more reliable)
  const jupiterData = await fetchRealPrices();
  if (jupiterData.length >= limit) {
    return jupiterData.slice(0, limit);
  }
  
  // Fallback to DexScreener
  try {
    const response = await fetch('https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112');
    const data = await response.json() as any;
    
    if (!data.pairs) return jupiterData;
    
    const pairs = data.pairs
      .filter((p: any) => p.liquidity?.usd > 50000)
      .slice(0, limit);
    
    return pairs.map((p: any) => ({
      symbol: p.baseToken?.symbol || 'UNKNOWN',
      name: p.baseToken?.name || 'Unknown',
      address: p.baseToken?.address || '',
      priceUsd: parseFloat(p.priceUsd) || 0,
      priceChange24h: p.priceChange?.h24 || 0,
      volume24h: p.volume?.h24 || 0,
      liquidity: p.liquidity?.usd || 0,
      fdv: p.fdv || 0,
    }));
  } catch {
    return jupiterData;
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

// For simulation: returns current prices with small random movements
export function generateMockMarket(count: number = 10): TokenData[] {
  const mockTokens = [
    { symbol: 'BONK', base: 0.00002 },
    { symbol: 'WIF', base: 2.5 },
    { symbol: 'JUP', base: 0.8 },
    { symbol: 'PYTH', base: 0.4 },
    { symbol: 'RAY', base: 3.2 },
    { symbol: 'ORCA', base: 4.1 },
    { symbol: 'JTO', base: 3.0 },
    { symbol: 'RENDER', base: 7.5 },
    { symbol: 'HNT', base: 5.0 },
    { symbol: 'SAMO', base: 0.01 },
  ];
  
  return mockTokens.slice(0, count).map((t, i) => {
    const change = (Math.random() - 0.4) * 80;
    const price = t.base * (1 + change / 100);
    
    return {
      symbol: t.symbol,
      name: `${t.symbol} Token`,
      address: `mock${i}`,
      priceUsd: price,
      priceChange24h: change,
      volume24h: Math.random() * 1000000,
      liquidity: Math.random() * 500000 + 50000,
      fdv: price * 1000000000,
    };
  });
}

// Get price change between two snapshots
export function calculatePriceChanges(
  oldPrices: Map<string, number>,
  newPrices: TokenData[]
): Map<string, number> {
  const changes = new Map<string, number>();
  
  for (const token of newPrices) {
    const oldPrice = oldPrices.get(token.symbol);
    if (oldPrice && oldPrice > 0) {
      const change = ((token.priceUsd - oldPrice) / oldPrice) * 100;
      changes.set(token.symbol, change);
    }
  }
  
  return changes;
}
