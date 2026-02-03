import { Program, AnchorProvider, web3, BN } from '@coral-xyz/anchor';
import { PublicKey, Connection, Keypair, SystemProgram } from '@solana/web3.js';

// Types matching the on-chain program
export interface AgentParams {
  riskTolerance: number;
  tradeFrequency: number;
  profitTarget: number;
  stopLoss: number;
  strategyType: number;
}

export interface Agent {
  id: PublicKey;
  owner: PublicKey;
  parent: PublicKey | null;
  generation: number;
  name: string;
  params: AgentParams;
  treasury: bigint;
  totalEarnings: bigint;
  totalCosts: bigint;
  spawnCount: number;
  serviceCount: bigint;
  performanceScore: bigint;
  createdAt: bigint;
  lastActive: bigint;
  isAlive: boolean;
}

export class BroodClient {
  private program: Program;
  private provider: AnchorProvider;

  constructor(
    connection: Connection,
    wallet: any,
    programId: PublicKey
  ) {
    this.provider = new AnchorProvider(connection, wallet, {});
    // In production, load IDL properly
    // this.program = new Program(IDL, programId, this.provider);
  }

  /**
   * Get PDA for an agent account
   */
  getAgentPDA(owner: PublicKey, name: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('agent'), owner.toBuffer(), Buffer.from(name)],
      this.program.programId
    );
  }

  /**
   * Get PDA for agent treasury
   */
  getTreasuryPDA(agentPDA: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('treasury'), agentPDA.toBuffer()],
      this.program.programId
    );
  }

  /**
   * Create a new agent
   */
  async createAgent(
    name: string,
    params: AgentParams
  ): Promise<string> {
    const [agentPDA] = this.getAgentPDA(this.provider.wallet.publicKey, name);

    const tx = await this.program.methods
      .createAgent(name, params)
      .accounts({
        agent: agentPDA,
        owner: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return tx;
  }

  /**
   * Fund agent treasury
   */
  async fundTreasury(
    agentPDA: PublicKey,
    amount: number
  ): Promise<string> {
    const [treasuryPDA] = this.getTreasuryPDA(agentPDA);

    const tx = await this.program.methods
      .fundTreasury(new BN(amount))
      .accounts({
        agent: agentPDA,
        treasury: treasuryPDA,
        funder: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return tx;
  }

  /**
   * Pay for agent service (as a user)
   */
  async payForService(
    agentPDA: PublicKey,
    amount: number
  ): Promise<string> {
    const [treasuryPDA] = this.getTreasuryPDA(agentPDA);

    const tx = await this.program.methods
      .payForService(new BN(amount))
      .accounts({
        agent: agentPDA,
        treasury: treasuryPDA,
        user: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return tx;
  }

  /**
   * Spawn a child agent with mutations
   */
  async spawn(
    parentPDA: PublicKey,
    childName: string,
    seedAmount: number,
    mutationRate: number = 10
  ): Promise<string> {
    const [childPDA] = this.getAgentPDA(this.provider.wallet.publicKey, childName);
    const [parentTreasuryPDA] = this.getTreasuryPDA(parentPDA);
    const [childTreasuryPDA] = this.getTreasuryPDA(childPDA);

    const tx = await this.program.methods
      .spawn(childName, new BN(seedAmount), mutationRate)
      .accounts({
        parentAgent: parentPDA,
        childAgent: childPDA,
        parentTreasury: parentTreasuryPDA,
        childTreasury: childTreasuryPDA,
        owner: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return tx;
  }

  /**
   * Get agent data
   */
  async getAgent(agentPDA: PublicKey): Promise<Agent> {
    const agent = await this.program.account.agent.fetch(agentPDA);
    return agent as Agent;
  }

  /**
   * Get all agents owned by a wallet
   */
  async getAgentsByOwner(owner: PublicKey): Promise<Agent[]> {
    const agents = await this.program.account.agent.all([
      {
        memcmp: {
          offset: 8 + 32, // After discriminator + id
          bytes: owner.toBase58(),
        },
      },
    ]);
    return agents.map(a => a.account as Agent);
  }

  /**
   * Get all living agents
   */
  async getLivingAgents(): Promise<Agent[]> {
    const agents = await this.program.account.agent.all([
      {
        memcmp: {
          offset: 8 + 32 + 32 + 33 + 4 + 36 + 5 + 8 + 8 + 8 + 4 + 8 + 8 + 8 + 8, // isAlive offset
          bytes: '1', // true
        },
      },
    ]);
    return agents.map(a => a.account as Agent);
  }

  /**
   * Get agent family tree (ancestors)
   */
  async getLineage(agentPDA: PublicKey): Promise<Agent[]> {
    const lineage: Agent[] = [];
    let current = await this.getAgent(agentPDA);
    lineage.push(current);

    while (current.parent) {
      current = await this.getAgent(current.parent);
      lineage.push(current);
    }

    return lineage;
  }

  /**
   * Get agent children
   */
  async getChildren(parentPDA: PublicKey): Promise<Agent[]> {
    const agents = await this.program.account.agent.all([
      {
        memcmp: {
          offset: 8 + 32 + 32 + 1, // parent offset (after option discriminator)
          bytes: parentPDA.toBase58(),
        },
      },
    ]);
    return agents.map(a => a.account as Agent);
  }
}

// Default params for different strategies
export const DEFAULT_PARAMS: Record<string, AgentParams> = {
  conservative: {
    riskTolerance: 20,
    tradeFrequency: 30,
    profitTarget: 10,
    stopLoss: 5,
    strategyType: 0,
  },
  balanced: {
    riskTolerance: 50,
    tradeFrequency: 50,
    profitTarget: 25,
    stopLoss: 15,
    strategyType: 1,
  },
  aggressive: {
    riskTolerance: 80,
    tradeFrequency: 80,
    profitTarget: 50,
    stopLoss: 30,
    strategyType: 2,
  },
};

export default BroodClient;
