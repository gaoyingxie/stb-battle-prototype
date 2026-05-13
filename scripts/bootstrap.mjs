import { spawn } from "node:child_process";

const steps = [
  ["npm", ["install"]],
  ["npm", ["run", "playwright:install"]],
  ["npm", ["run", "check"]],
];

function run(command, args) {
  return new Promise((resolve, reject) => {
    console.log(`\n> ${command} ${args.join(" ")}`);
    const child = spawn(command, args, {
      shell: process.platform === "win32",
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
      }
    });
  });
}

for (const [command, args] of steps) {
  await run(command, args);
}

console.log("\nBootstrap complete. Use `npm start` for manual local testing or `npm run smoke:browser` for UI smoke coverage.");
