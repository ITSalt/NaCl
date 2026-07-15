import { spawn } from "node:child_process";
import { assertSecretAbsentFromArgv, redactText } from "./redaction.mjs";

export function createProcessRunner(options = {}) {
  const spawnProcess = options.spawnProcess ?? spawn;

  return {
    run(spec) {
      const args = spec.args ?? [];
      const sensitiveValues = spec.sensitiveValues ?? [];
      assertSecretAbsentFromArgv(args, sensitiveValues);
      return new Promise((resolve) => {
        let child;
        try {
          child = spawnProcess(spec.command, args, {
            cwd: spec.cwd,
            env: spec.env ?? process.env,
            stdio: ["pipe", "pipe", "pipe"],
          });
        } catch (error) {
          resolve({ status: null, errorCode: error.code ?? "SPAWN_ERROR", stdout: "", stderr: "" });
          return;
        }
        const stdout = [];
        const stderr = [];
        child.stdout.on("data", (chunk) => stdout.push(chunk));
        child.stderr.on("data", (chunk) => stderr.push(chunk));
        child.on("error", (error) => {
          resolve({ status: null, errorCode: error.code ?? "SPAWN_ERROR", stdout: "", stderr: "" });
        });
        child.on("close", (status) => {
          const rawStdout = Buffer.concat(stdout).toString("utf8");
          const rawStderr = Buffer.concat(stderr).toString("utf8");
          resolve({
            status,
            errorCode: null,
            stdout: spec.sensitiveOutput ? "" : redactText(rawStdout, sensitiveValues),
            sensitiveStdout: spec.sensitiveOutput ? rawStdout : undefined,
            stderr: redactText(rawStderr, sensitiveValues),
          });
        });
        if (spec.input !== undefined) child.stdin.end(spec.input);
        else child.stdin.end();
      });
    },
  };
}
