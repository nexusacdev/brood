import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { BroodClient, Genome, mutateGenome } from "./index";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  
  const walletPath = path.join(process.env.HOME || "~", ".config/solana/id.json");
  const secretKey = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  const wallet = new Wallet(keypair);

  console.log("Wallet:", keypair.publicKey.toBase58());
  const balance = await connection.getBalance(keypair.publicKey);
  console.log("Balance:", balance / LAMPORTS_PER_SOL, "SOL\n");

  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const client = new BroodClient(provider);

  // Parent genome
  const parentGenome: Genome = {
    version: "1.0",
    config: {
      model: "anthropic/claude-sonnet-4-20250514",
      tools: ["exec", "read", "write", "web_search"],
    },
    skills: [
      {
        name: "token-scanner",
        version: "1.0.0",
        params: { min_liquidity: 10000, max_age_hours: 24 },
      },
    ],
    settings: {
      risk_tolerance: 0.3,
      position_size_pct: 0.1,
      profit_target_pct: 2.0,
      stop_loss_pct: 0.5,
    },
    soul: "I am Eve, the first mother of Brood agents.",
  };

  const parentName = "Eve-" + Date.now().toString().slice(-4);
  console.log("=== Step 1: Create Parent Agent ===");
  console.log("Name:", parentName);

  try {
    const tx1 = await client.createAgent(parentName, parentGenome, "ipfs://QmParentGenome");
    console.log("Created! Tx:", tx1);

    const parent = await client.getAgent(parentName);
    console.log("Parent ID:", parent?.id.toBase58());
    console.log("Treasury:", parent?.treasury.toString(), "lamports\n");

    // Fund the parent (need at least 0.15 SOL for spawn seed + reserve)
    console.log("=== Step 2: Fund Parent Treasury ===");
    const fundAmount = 0.2 * LAMPORTS_PER_SOL; // 0.2 SOL
    const tx2 = await client.fundTreasury(parentName, fundAmount);
    console.log("Funded! Tx:", tx2);

    const parentAfterFund = await client.getAgent(parentName);
    console.log("Treasury after fund:", parentAfterFund?.treasury.toString(), "lamports\n");

    // Mutate genome for child
    console.log("=== Step 3: Mutate Genome ===");
    const childGenome = mutateGenome(parentGenome, 0.8); // High mutation for demo
    console.log("Mutations:");
    childGenome.lineage?.mutation_log?.forEach((m) => {
      console.log(`  ${m.field}: ${m.old_value} → ${m.new_value}`);
    });

    // Spawn child
    console.log("\n=== Step 4: Spawn Child Agent ===");
    const childName = "Child-" + Date.now().toString().slice(-4);
    const seedAmount = 0.1 * LAMPORTS_PER_SOL; // 0.1 SOL seed
    
    const tx3 = await client.spawn(
      parentName,
      childName,
      childGenome,
      "ipfs://QmChildGenome",
      seedAmount
    );
    console.log("Spawned! Tx:", tx3);

    // Verify both agents
    console.log("\n=== Step 5: Verify Agents ===");
    
    const parentFinal = await client.getAgent(parentName);
    console.log("\nParent:", parentName);
    console.log("  Treasury:", parentFinal?.treasury.toString(), "lamports");
    console.log("  Spawn Count:", parentFinal?.spawnCount);
    console.log("  Generation:", parentFinal?.generation);

    const child = await client.getAgent(childName);
    console.log("\nChild:", childName);
    console.log("  ID:", child?.id.toBase58());
    console.log("  Treasury:", child?.treasury.toString(), "lamports");
    console.log("  Parent:", child?.parent?.toBase58());
    console.log("  Generation:", child?.generation);
    console.log("  Is Alive:", child?.isAlive);

    console.log("\n🧬 EVOLUTION SUCCESSFUL! First spawn on devnet!");

  } catch (error: any) {
    console.error("Error:", error.message);
    if (error.logs) {
      console.error("Logs:", error.logs);
    }
  }
}

main().catch(console.error);
