import { Program, AnchorProvider, web3, BN } from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair, SystemProgram } from "@solana/web3.js";
import * as crypto from "crypto";

// Program ID on devnet
export const BROOD_PROGRAM_ID = new PublicKey(
  "2Au3HkZn7qQn4FgCSiH9cJGzPHtzGSmmmjaQhDXF5ZNV"
);

// Types
export interface Genome {
  version: string;
  config: {
    model: string;
    thinking?: string;
    tools: string[];
    heartbeat_interval_minutes?: number;
  };
  skills: Array<{
    name: string;
    version: string;
    uri?: string;
    params?: Record<string, any>;
  }>;
  settings: {
    risk_tolerance?: number;
    position_size_pct?: number;
    profit_target_pct?: number;
    stop_loss_pct?: number;
    min_confidence?: number;
    max_concurrent_positions?: number;
    cooldown_minutes?: number;
  };
  soul?: string;
  lineage?: {
    parent_genome_hash?: string;
    mutation_log?: Array<{
      field: string;
      old_value: any;
      new_value: any;
      mutation_type: string;
    }>;
  };
}

export interface Agent {
  id: PublicKey;
  owner: PublicKey;
  parent: PublicKey | null;
  generation: number;
  name: string;
  genomeHash: number[];
  genomeUri: string;
  treasury: BN;
  totalEarnings: BN;
  totalCosts: BN;
  spawnCount: number;
  serviceCount: number;
  createdAt: BN;
  lastActive: BN;
  isAlive: boolean;
}

export class BroodClient {
  provider: AnchorProvider;
  programId: PublicKey;

  constructor(provider: AnchorProvider) {
    this.provider = provider;
    this.programId = BROOD_PROGRAM_ID;
  }

  // === PDAs ===

  getAgentPDA(owner: PublicKey, name: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("agent"), owner.toBuffer(), Buffer.from(name)],
      this.programId
    );
  }

  getTreasuryPDA(agentPDA: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("treasury"), agentPDA.toBuffer()],
      this.programId
    );
  }

  // === Helpers ===

  hashGenome(genome: Genome): number[] {
    const json = JSON.stringify(genome);
    const hash = crypto.createHash("sha256").update(json).digest();
    return Array.from(hash);
  }

  private encodeString(s: string): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32LE(s.length, 0);
    return Buffer.concat([len, Buffer.from(s)]);
  }

  // === Instructions (using raw transactions) ===

  async createAgent(
    name: string,
    genome: Genome,
    genomeUri: string
  ): Promise<string> {
    const owner = this.provider.wallet.publicKey;
    const [agentPDA] = this.getAgentPDA(owner, name);
    const genomeHash = this.hashGenome(genome);

    // Build instruction data manually
    // Discriminator for create_agent (first 8 bytes of sha256("global:create_agent"))
    const discriminator = Buffer.from([143, 66, 198, 95, 110, 85, 83, 249]);
    
    const data = Buffer.concat([
      discriminator,
      this.encodeString(name),
      Buffer.from(genomeHash),
      this.encodeString(genomeUri),
    ]);

    const ix = new web3.TransactionInstruction({
      keys: [
        { pubkey: agentPDA, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data,
    });

    const tx = new web3.Transaction().add(ix);
    const sig = await this.provider.sendAndConfirm(tx);
    return sig;
  }

  async fundTreasury(name: string, amountLamports: number): Promise<string> {
    const owner = this.provider.wallet.publicKey;
    const [agentPDA] = this.getAgentPDA(owner, name);
    const [treasuryPDA] = this.getTreasuryPDA(agentPDA);

    // Discriminator for fund_treasury
    const discriminator = Buffer.from([71, 154, 45, 220, 206, 32, 174, 239]);
    
    const amountBuf = Buffer.alloc(8);
    amountBuf.writeBigUInt64LE(BigInt(amountLamports), 0);

    const data = Buffer.concat([discriminator, amountBuf]);

    const ix = new web3.TransactionInstruction({
      keys: [
        { pubkey: agentPDA, isSigner: false, isWritable: true },
        { pubkey: treasuryPDA, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data,
    });

    const tx = new web3.Transaction().add(ix);
    const sig = await this.provider.sendAndConfirm(tx);
    return sig;
  }

  async spawn(
    parentName: string,
    childName: string,
    childGenome: Genome,
    childGenomeUri: string,
    seedLamports: number
  ): Promise<string> {
    const owner = this.provider.wallet.publicKey;
    const [parentPDA] = this.getAgentPDA(owner, parentName);
    const [childPDA] = this.getAgentPDA(owner, childName);
    const childGenomeHash = this.hashGenome(childGenome);

    // Discriminator for spawn
    const discriminator = Buffer.from([17, 105, 240, 101, 4, 95, 45, 171]);
    
    const seedBuf = Buffer.alloc(8);
    seedBuf.writeBigUInt64LE(BigInt(seedLamports), 0);

    const data = Buffer.concat([
      discriminator,
      this.encodeString(childName),
      Buffer.from(childGenomeHash),
      this.encodeString(childGenomeUri),
      seedBuf,
    ]);

    const ix = new web3.TransactionInstruction({
      keys: [
        { pubkey: parentPDA, isSigner: false, isWritable: true },
        { pubkey: childPDA, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data,
    });

    const tx = new web3.Transaction().add(ix);
    const sig = await this.provider.sendAndConfirm(tx);
    return sig;
  }

  async recordEarnings(name: string, amountLamports: number): Promise<string> {
    const owner = this.provider.wallet.publicKey;
    const [agentPDA] = this.getAgentPDA(owner, name);

    const discriminator = Buffer.from([217, 224, 183, 102, 227, 210, 189, 82]);
    
    const amountBuf = Buffer.alloc(8);
    amountBuf.writeBigUInt64LE(BigInt(amountLamports), 0);

    const data = Buffer.concat([discriminator, amountBuf]);

    const ix = new web3.TransactionInstruction({
      keys: [
        { pubkey: agentPDA, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: false },
      ],
      programId: this.programId,
      data,
    });

    const tx = new web3.Transaction().add(ix);
    const sig = await this.provider.sendAndConfirm(tx);
    return sig;
  }

  async deductCosts(name: string, amountLamports: number): Promise<string> {
    const owner = this.provider.wallet.publicKey;
    const [agentPDA] = this.getAgentPDA(owner, name);

    const discriminator = Buffer.from([51, 116, 208, 108, 219, 210, 203, 39]);
    
    const amountBuf = Buffer.alloc(8);
    amountBuf.writeBigUInt64LE(BigInt(amountLamports), 0);

    const data = Buffer.concat([discriminator, amountBuf]);

    const ix = new web3.TransactionInstruction({
      keys: [
        { pubkey: agentPDA, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: false },
      ],
      programId: this.programId,
      data,
    });

    const tx = new web3.Transaction().add(ix);
    const sig = await this.provider.sendAndConfirm(tx);
    return sig;
  }

  async updateGenome(
    name: string,
    newGenome: Genome,
    newGenomeUri: string
  ): Promise<string> {
    const owner = this.provider.wallet.publicKey;
    const [agentPDA] = this.getAgentPDA(owner, name);
    const newGenomeHash = this.hashGenome(newGenome);

    const discriminator = Buffer.from([81, 77, 107, 16, 169, 4, 54, 52]);

    const data = Buffer.concat([
      discriminator,
      Buffer.from(newGenomeHash),
      this.encodeString(newGenomeUri),
    ]);

    const ix = new web3.TransactionInstruction({
      keys: [
        { pubkey: agentPDA, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: false },
      ],
      programId: this.programId,
      data,
    });

    const tx = new web3.Transaction().add(ix);
    const sig = await this.provider.sendAndConfirm(tx);
    return sig;
  }

  async killAgent(name: string): Promise<string> {
    const owner = this.provider.wallet.publicKey;
    const [agentPDA] = this.getAgentPDA(owner, name);

    const discriminator = Buffer.from([152, 243, 180, 237, 215, 248, 160, 57]);

    const ix = new web3.TransactionInstruction({
      keys: [
        { pubkey: agentPDA, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: false },
      ],
      programId: this.programId,
      data: discriminator,
    });

    const tx = new web3.Transaction().add(ix);
    const sig = await this.provider.sendAndConfirm(tx);
    return sig;
  }

  // === Queries ===

  async getAgent(name: string, owner?: PublicKey): Promise<Agent | null> {
    const ownerKey = owner || this.provider.wallet.publicKey;
    const [agentPDA] = this.getAgentPDA(ownerKey, name);

    try {
      const accountInfo = await this.provider.connection.getAccountInfo(agentPDA);
      if (!accountInfo) return null;

      // Decode manually (skip 8-byte discriminator)
      const data = accountInfo.data.slice(8);
      let offset = 0;

      const id = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;

      const ownerPk = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;

      const hasParent = data[offset] === 1;
      offset += 1;
      let parent: PublicKey | null = null;
      if (hasParent) {
        parent = new PublicKey(data.slice(offset, offset + 32));
        offset += 32;
      }

      const generation = data.readUInt32LE(offset);
      offset += 4;

      const nameLen = data.readUInt32LE(offset);
      offset += 4;
      const agentName = data.slice(offset, offset + nameLen).toString();
      offset += nameLen;

      const genomeHash = Array.from(data.slice(offset, offset + 32));
      offset += 32;

      const uriLen = data.readUInt32LE(offset);
      offset += 4;
      const genomeUri = data.slice(offset, offset + uriLen).toString();
      offset += uriLen;

      const treasury = new BN(data.slice(offset, offset + 8), "le");
      offset += 8;

      const totalEarnings = new BN(data.slice(offset, offset + 8), "le");
      offset += 8;

      const totalCosts = new BN(data.slice(offset, offset + 8), "le");
      offset += 8;

      const spawnCount = data.readUInt32LE(offset);
      offset += 4;

      const serviceCount = data.readUInt32LE(offset);
      offset += 4;

      const createdAt = new BN(data.slice(offset, offset + 8), "le");
      offset += 8;

      const lastActive = new BN(data.slice(offset, offset + 8), "le");
      offset += 8;

      const isAlive = data[offset] === 1;

      return {
        id,
        owner: ownerPk,
        parent,
        generation,
        name: agentName,
        genomeHash,
        genomeUri,
        treasury,
        totalEarnings,
        totalCosts,
        spawnCount,
        serviceCount,
        createdAt,
        lastActive,
        isAlive,
      };
    } catch (e) {
      console.error("Error fetching agent:", e);
      return null;
    }
  }
}

// === Mutation Helpers ===

export function mutateGenome(parent: Genome, mutationRate: number = 0.1): Genome {
  const child = JSON.parse(JSON.stringify(parent)) as Genome;
  const mutations: any[] = [];

  // Mutate numeric settings
  if (child.settings) {
    for (const [key, value] of Object.entries(child.settings)) {
      if (typeof value === "number" && Math.random() < mutationRate) {
        const delta = (Math.random() - 0.5) * 0.4 * value; // ±20%
        const newValue = Math.max(0, value + delta);
        (child.settings as any)[key] = newValue;
        mutations.push({
          field: `settings.${key}`,
          old_value: value,
          new_value: newValue,
          mutation_type: "tweak",
        });
      }
    }
  }

  // Mutate skill params
  if (child.skills && Math.random() < mutationRate) {
    const skillIdx = Math.floor(Math.random() * child.skills.length);
    const skill = child.skills[skillIdx];
    if (skill.params) {
      for (const [key, value] of Object.entries(skill.params)) {
        if (typeof value === "number" && Math.random() < 0.5) {
          const delta = (Math.random() - 0.5) * 0.4 * value;
          const newValue = Math.max(0, value + delta);
          skill.params[key] = newValue;
          mutations.push({
            field: `skills[${skillIdx}].params.${key}`,
            old_value: value,
            new_value: newValue,
            mutation_type: "tweak",
          });
        }
      }
    }
  }

  // Record lineage
  child.lineage = {
    parent_genome_hash: crypto
      .createHash("sha256")
      .update(JSON.stringify(parent))
      .digest("hex"),
    mutation_log: mutations,
  };

  return child;
}

// Export everything
export default BroodClient;
