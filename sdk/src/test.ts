import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { BroodClient, Genome, mutateGenome } from "./index";
import * as fs from "fs";
import * as path from "path";

async function main() {
  // Connect to devnet
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  
  // Load wallet from default Solana config
  const walletPath = path.join(
    process.env.HOME || "~",
    ".config/solana/id.json"
  );
  const secretKey = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  const wallet = new Wallet(keypair);

  console.log("Wallet:", keypair.publicKey.toBase58());

  // Check balance
  const balance = await connection.getBalance(keypair.publicKey);
  console.log("Balance:", balance / LAMPORTS_PER_SOL, "SOL");

  // Create provider and client
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  const client = new BroodClient(provider);

  // Define a test genome
  const genome: Genome = {
    version: "1.0",
    config: {
      model: "anthropic/claude-sonnet-4-20250514",
      thinking: "low",
      tools: ["exec", "read", "write", "web_search"],
      heartbeat_interval_minutes: 30,
    },
    skills: [
      {
        name: "solana-edge",
        version: "1.0.0",
        params: {
          min_liquidity: 10000,
          max_age_hours: 24,
          social_verification: true,
        },
      },
    ],
    settings: {
      risk_tolerance: 0.3,
      position_size_pct: 0.1,
      profit_target_pct: 2.0,
      stop_loss_pct: 0.5,
      min_confidence: 0.7,
      max_concurrent_positions: 3,
      cooldown_minutes: 15,
    },
    soul: "I am Alpha, the first Brood agent. I trade cautiously but decisively.",
  };

  const agentName = "Alpha-" + Date.now().toString().slice(-6);
  console.log("\n=== Creating Agent:", agentName, "===\n");

  try {
    // Create the agent
    const genomeUri = "ipfs://QmPLACEHOLDER"; // Would be real IPFS in production
    const tx = await client.createAgent(agentName, genome, genomeUri);
    console.log("Created agent! Tx:", tx);

    // Fetch the agent
    const agent = await client.getAgent(agentName);
    if (agent) {
      console.log("\nAgent state:");
      console.log("  ID:", agent.id.toBase58());
      console.log("  Name:", agent.name);
      console.log("  Generation:", agent.generation);
      console.log("  Treasury:", agent.treasury.toString(), "lamports");
      console.log("  Is Alive:", agent.isAlive);
      console.log("  Genome URI:", agent.genomeUri);
    }

    // Test mutation
    console.log("\n=== Testing Genome Mutation ===\n");
    const childGenome = mutateGenome(genome, 0.5); // 50% mutation rate for demo
    console.log("Mutations applied:");
    childGenome.lineage?.mutation_log?.forEach((m) => {
      console.log(`  ${m.field}: ${m.old_value} -> ${m.new_value}`);
    });

  } catch (error) {
    console.error("Error:", error);
  }
}

main().catch(console.error);
