import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const webRoot = path.resolve(import.meta.dirname, "../web");
const modules = ["game.js", "assets.js", "atlas.js", "lobby.js"];

function checkModule(filePath) {
  return spawnSync(process.execPath, ["--input-type=module", "--check"], {
    input: readFileSync(filePath),
    encoding: "utf8",
  });
}

test("browser client modules parse as ES modules", () => {
  for (const name of modules) {
    const filePath = path.join(webRoot, name);
    const result = checkModule(filePath);
    assert.equal(result.status, 0, `${name}\n${result.stderr}`);
  }
});

test("game.js imports without a syntax error", async () => {
  const fileUrl = pathToFileURL(path.join(webRoot, "game.js")).href;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `await import(${JSON.stringify(fileUrl)})`],
    { encoding: "utf8" }
  );
  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(output.includes("SyntaxError"), false, output);
  assert.equal(result.status, 0, output);
});
