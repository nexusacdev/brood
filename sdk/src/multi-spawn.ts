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

  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const client = new BroodClient(provider);

  // Create a new lineage with 3 generations
  const baseGenome: Genome = {
    version: "1.0",
    config: { model: "claude-sonnet", tools: ["trade", "analyze"] },
    skills: [{ name: "momentum", version: "1.0", params: { threshold: 0.05 } }],
    settings: {
      risk_tolerance: 0.5,
      position_size_pct: 0.2,
      profit_target_pct: 1.5,
    },
    soul: "I seek alpha through momentum.",
  };

  console.log("🧬 Creating 3-Generation Lineage\n");

  // Gen 1: Adam
  const adamName = "Adam-" + Date.now().toString().slice(-4);
  console.log("Gen 1: Creating", adamName);
  await client.createAgent(adamName, baseGenome, "ipfs://adam");
  await client.fundTreasury(adamName, 0.3 * LAMPORTS_PER_SOL);
  
  let adam = await client.getAgent(adamName);
  console.log("  Treasury:", Number(adam?.treasury) / LAMPORTS_PER_SOL, "SOL\n");

  // Gen 2: Cain (child of Adam)
  const cainGenome = mutateGenome(baseGenome, 0.5);
  const cainName = "Cain-" + Date.now().toString().slice(-4);
  console.log("Gen 2: Spawning", cainName, "from", adamName);
  console.log("  Mutations:", cainGenome.lineage?.mutation_log?.map(m => m.field).join(", ") || "none");
  await client.spawn(adamName, cainName, cainGenome, "ipfs://cain", 0.18 * LAMPORTS_PER_SOL);
  
  let cain = await client.getAgent(cainName);
  console.log("  Treasury:", Number(cain?.treasury) / LAMPORTS_PER_SOL, "SOL\n");

  // Gen 3: Enoch (child of Cain)
  const enochGenome = mutateGenome(cainGenome, 0.5);
  const enochName = "Enoch-" + Date.now().toString().slice(-4);
  console.log("Gen 3: Spawning", enochName, "from", cainName);
  console.log("  Mutations:", enochGenome.lineage?.mutation_log?.map(m => m.field).join(", ") || "none");
  await client.spawn(cainName, enochName, enochGenome, "ipfs://enoch", 0.1 * LAMPORTS_PER_SOL);

  let enoch = await client.getAgent(enochName);
  console.log("  Treasury:", Number(enoch?.treasury) / LAMPORTS_PER_SOL, "SOL\n");

  // Final state
  adam = await client.getAgent(adamName);
  cain = await client.getAgent(cainName);
  enoch = await client.getAgent(enochName);

  console.log("═".repeat(50));
  console.log("LINEAGE COMPLETE:");
  console.log(`  ${adamName} (Gen 1) → ${adam?.spawnCount} spawns, ${Number(adam?.treasury)/LAMPORTS_PER_SOL} SOL`);
  console.log(`    └── ${cainName} (Gen 2) → ${cain?.spawnCount} spawns, ${Number(cain?.treasury)/LAMPORTS_PER_SOL} SOL`);
  console.log(`          └── ${enochName} (Gen 3) → ${enoch?.spawnCount} spawns, ${Number(enoch?.treasury)/LAMPORTS_PER_SOL} SOL`);
}

main().catch(console.error);
