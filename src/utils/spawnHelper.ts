/*
 * Copyright 2026, Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { spawn } from 'node:child_process';

export type SpawnResult = { stdout: string; stderr: string };

export type SpawnError = Error & SpawnResult & { exitCode: number | null };

export type SpawnOptions = {
  timeout?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

/**
 * Spawns a child process without a shell, accumulates stdout/stderr, and resolves
 * when the process exits with code 0. Rejects with a SpawnError (carrying stdout,
 * stderr, and exitCode) on non-zero exit or spawn failure.
 *
 * Using an args array instead of a shell string eliminates shell injection risk —
 * the OS passes each element directly to the process's argv without interpretation.
 */
export async function spawnAsync(command: string, args: string[], options?: SpawnOptions): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      timeout: options?.timeout,
      cwd: options?.cwd,
      env: options?.env ?? process.env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        const err = new Error(`Process exited with code ${code ?? 'unknown'}`) as SpawnError;
        err.stdout = stdout;
        err.stderr = stderr;
        err.exitCode = code;
        reject(err);
        return;
      }
      resolve({ stdout, stderr });
    });

    child.on('error', (err) => {
      const spawnErr = err as SpawnError;
      spawnErr.stdout = stdout;
      spawnErr.stderr = stderr;
      spawnErr.exitCode = null;
      reject(spawnErr);
    });
  });
}
