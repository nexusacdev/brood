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

  // Cain's genome (mutated from Adam)
  const cainGenome: Genome = {
    version: "1.0",
    config: { model: "claude-sonnet", tools: ["trade"] },
    skills: [{ name: "momentum", version: "1.0", params: { threshold: 0.09 } }],
    settings: {
      risk_tolerance: 0.65,
      position_size_pct: 0.18,
      profit_target_pct: 0.35,
      stop_loss_pct: 0.18,
      min_confidence: 0.42,
      max_concurrent_positions: 4,
    },
    soul: "I inherited my father's aggression but learned caution.",
  };

  console.log("🧬 SPAWNING GENERATION 3 FROM CAIN\n");

  const cain = await client.getAgent("Cain-0113");
  if (!cain) {
    console.log("Cain not found!");
    return;
  }

  console.log("Parent: Cain-0113 (Gen 2)");
  console.log("Treasury:", Number(cain.treasury) / LAMPORTS_PER_SOL, "SOL");

  // Need at least 0.15 SOL (0.1 seed + 0.05 reserve)
  if (Number(cain.treasury) < 0.15 * LAMPORTS_PER_SOL) {
    console.log("❌ Not enough treasury to spawn (need 0.15 SOL)");
    return;
  }

  // Mutate!
  const childGenome = mutateGenome(cainGenome, 0.35);
  console.log("\nMutations:");
  childGenome.lineage?.mutation_log?.forEach((m) => {
    console.log(`  ${m.field}: ${m.old_value.toFixed?.(3) || m.old_value} → ${m.new_value.toFixed?.(3) || m.new_value}`);
  });

  const childName = "Enoch-" + Date.now().toString().slice(-4);
  console.log("\nSpawning:", childName, "(Generation 3!)");

  try {
    const tx = await client.spawn(
      "Cain-0113",
      childName,
      childGenome,
      "ipfs://enoch-genome",
      0.1 * LAMPORTS_PER_SOL
    );
    console.log("✅ Success! Tx:", tx.slice(0, 40) + "...");

    const child = await client.getAgent(childName);
    console.log("\n🎉 GENERATION 3 ACHIEVED!");
    console.log("  Name:", childName);
    console.log("  Generation:", child?.generation);
    console.log("  Treasury:", Number(child?.treasury) / LAMPORTS_PER_SOL, "SOL");
    console.log("  Lineage: Adam → Cain →", childName);

  } catch (e: any) {
    console.log("❌ Failed:", e.message?.slice(0, 100));
  }
}

main().catch(console.error);
