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

  // Adam's genome (the aggressive one)
  const adamGenome: Genome = {
    version: "1.0",
    config: { model: "claude-sonnet", tools: ["trade"] },
    skills: [{ name: "momentum", version: "1.0", params: { threshold: 0.1 } }],
    settings: {
      risk_tolerance: 0.7,
      position_size_pct: 0.2,
      profit_target_pct: 0.3,
      stop_loss_pct: 0.2,
      min_confidence: 0.4,
      max_concurrent_positions: 4,
    },
    soul: "I am aggressive. Fortune favors the bold.",
  };

  console.log("🧬 SPAWNING FROM ADAM\n");

  // Check Adam's current state
  const adam = await client.getAgent("Adam-8379");
  if (!adam) {
    console.log("Adam not found!");
    return;
  }

  console.log("Parent: Adam-8379 (Gen 1)");
  console.log("Treasury:", Number(adam.treasury) / LAMPORTS_PER_SOL, "SOL");
  console.log("Spawns so far:", adam.spawnCount);

  // Mutate genome for child
  const childGenome = mutateGenome(adamGenome, 0.4);
  console.log("\nMutations for child:");
  childGenome.lineage?.mutation_log?.forEach((m) => {
    console.log(`  ${m.field}: ${m.old_value} → ${m.new_value}`);
  });

  // Spawn!
  const childName = "Abel-" + Date.now().toString().slice(-4);
  console.log("\nSpawning:", childName);

  try {
    const tx = await client.spawn(
      "Adam-8379",
      childName,
      childGenome,
      "ipfs://abel-genome",
      0.1 * LAMPORTS_PER_SOL // 0.1 SOL seed (minimum required)
    );
    console.log("✅ Success! Tx:", tx);

    // Verify
    const child = await client.getAgent(childName);
    const adamAfter = await client.getAgent("Adam-8379");

    console.log("\n📊 Results:");
    console.log("Adam treasury:", Number(adamAfter?.treasury) / LAMPORTS_PER_SOL, "SOL");
    console.log("Adam spawn count:", adamAfter?.spawnCount);
    console.log("\nNew child:", childName);
    console.log("  Generation:", child?.generation);
    console.log("  Treasury:", Number(child?.treasury) / LAMPORTS_PER_SOL, "SOL");
    console.log("  Parent:", child?.parent?.toBase58().slice(0, 8) + "...");

  } catch (e: any) {
    console.log("❌ Failed:", e.message);
    if (e.logs) console.log("Logs:", e.logs);
  }
}

main().catch(console.error);
