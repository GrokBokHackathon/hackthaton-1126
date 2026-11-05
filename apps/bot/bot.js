#!/usr/bin/env node
// Simple bot client with basic AI
import { WebSocket } from "ws";

const serverUrl = process.argv[2] || "ws://127.0.0.1:8080/ws";
const botName = process.argv[3] || `Bot${Math.floor(Math.random() * 1000)}`;

console.log(`Connecting to ${serverUrl} as ${botName}`);

let ws = null;
let playerId = null;
let team = null;
let map = null;
let state = null;
let reconnectAttempts = 0;

function connect() {
  ws = new WebSocket(serverUrl);

  ws.on("open", () => {
    console.log("Connected");
    reconnectAttempts = 0;
    send({ type: "join", name: botName, kind: "bot" });
  });

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleMessage(msg);
    } catch (err) {
      console.error("Failed to parse message:", err);
    }
  });

  ws.on("close", () => {
    console.log("Disconnected");
    reconnectAttempts++;
    const wait = Math.min(5000, 500 * reconnectAttempts);
    console.log(`Reconnecting in ${wait}ms...`);
    setTimeout(connect, wait);
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
  });
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function handleMessage(msg) {
  if (msg.type === "welcome") {
    playerId = msg.playerId;
    team = msg.team;
    map = msg.map;
    console.log(`Joined as ${team} team (ID: ${playerId})`);
  } else if (msg.type === "state") {
    state = msg;
    think();
  } else if (msg.type === "newMap") {
    map = msg.map;
    console.log("New map generated");
  } else if (msg.type === "scored") {
    console.log(`${msg.team} scored! Score: Red ${msg.score.red} - Bot ${msg.score.bot}`);
  } else if (msg.type === "matchEnd") {
    console.log(`Match ended! ${msg.winner} wins with score ${msg.finalScore.red} - ${msg.finalScore.bot}`);
  }
}

function distance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function think() {
  if (!state || !map || !playerId) return;

  const me = state.players.find((p) => p.id === playerId);
  if (!me) return;

  // Skip if respawning or tagged
  if (me.state === "tagged" || me.state === "respawn") {
    send({ type: "input", dx: 0, dy: 0 });
    return;
  }

  const enemyTeam = team === "red" ? "bot" : "red";
  const enemyFlag = state.flags[enemyTeam];
  const myBase = map.bases[team];

  let targetX, targetY;

  if (me.hasFlag) {
    // Bring flag home
    targetX = myBase.x;
    targetY = myBase.y;
  } else if (!enemyFlag.carrier) {
    // Go get enemy flag
    targetX = enemyFlag.x;
    targetY = enemyFlag.y;
  } else {
    // Enemy has our flag, chase them
    const carrier = state.players.find((p) => p.id === enemyFlag.carrier);
    if (carrier) {
      targetX = carrier.x;
      targetY = carrier.y;
    } else {
      // Default: go to enemy flag position
      targetX = enemyFlag.x;
      targetY = enemyFlag.y;
    }
  }

  // Simple pathfinding: move towards target
  const dx = targetX - me.x;
  const dy = targetY - me.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 0.1) {
    const ndx = dx / dist;
    const ndy = dy / dist;
    send({ type: "input", dx: ndx, dy: ndy });
  } else {
    send({ type: "input", dx: 0, dy: 0 });
  }
}

connect();

// Keep process alive
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  if (ws) ws.close();
  process.exit(0);
});
