import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { BroodClient, Agent } from "./index";
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

  // Known agent names (in production would scan all PDAs)
  const agentNames = [
    "Alpha-719523", 
    "Eve-9682",
    "Child-0906",
    "Adam-8379",
    "Cain-0113",
  ];

  console.log("🧬 BROOD FAMILY TREE");
  console.log("═".repeat(60));
  console.log();

  const agents: Map<string, Agent> = new Map();
  
  // Fetch all agents
  for (const name of agentNames) {
    const agent = await client.getAgent(name);
    if (agent) {
      agents.set(agent.id.toBase58(), agent);
    }
  }

  // Build tree
  const roots: Agent[] = [];
  const children: Map<string, Agent[]> = new Map();

  for (const agent of agents.values()) {
    if (!agent.parent) {
      roots.push(agent);
    } else {
      const parentId = agent.parent.toBase58();
      if (!children.has(parentId)) {
        children.set(parentId, []);
      }
      children.get(parentId)!.push(agent);
    }
  }

  // Print tree
  function printAgent(agent: Agent, indent: string, isLast: boolean) {
    const prefix = isLast ? "└── " : "├── ";
    const status = agent.isAlive ? "🟢" : "💀";
    const treasury = (Number(agent.treasury) / LAMPORTS_PER_SOL).toFixed(3);
    
    console.log(`${indent}${prefix}${status} ${agent.name} (Gen ${agent.generation})`);
    console.log(`${indent}${isLast ? "    " : "│   "}   💰 ${treasury} SOL | 👶 ${agent.spawnCount} spawns`);
    console.log(`${indent}${isLast ? "    " : "│   "}   📍 ${agent.id.toBase58().slice(0, 8)}...`);
    
    const agentChildren = children.get(agent.id.toBase58()) || [];
    agentChildren.forEach((child, i) => {
      const childIndent = indent + (isLast ? "    " : "│   ");
      printAgent(child, childIndent, i === agentChildren.length - 1);
    });
  }

  if (roots.length === 0) {
    console.log("No agents found.");
  } else {
    roots.forEach((root, i) => {
      printAgent(root, "", i === roots.length - 1);
      console.log();
    });
  }

  // Summary
  console.log("═".repeat(60));
  console.log(`Total Agents: ${agents.size}`);
  console.log(`Alive: ${Array.from(agents.values()).filter(a => a.isAlive).length}`);
  console.log(`Max Generation: ${Math.max(...Array.from(agents.values()).map(a => a.generation))}`);
}

main().catch(console.error);
