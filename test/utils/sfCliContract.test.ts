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

/**
 * Contract tests: verify that DatacodeBinaryExecutor passes exactly the argument
 * signatures that the Python CLI (datacustomcode) expects.
 *
 * Mirror of: datacloud-customcode-python-sdk/tests/test_sf_cli_contract.py
 *
 * These tests do NOT exercise business logic. They verify that:
 * 1. All flags passed by the SF CLI plugin are present in each executeBinary*() call.
 * 2. The arg arrays match what the Python CLI expects for each command.
 * 3. stdout regex patterns used to parse Python CLI output work correctly.
 *
 * Source of truth for expected args and stdout regex patterns:
 * src/utils/datacodeBinaryExecutor.ts
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect } from 'chai';
import { DatacodeBinaryExecutor } from '../../src/utils/datacodeBinaryExecutor.js';

// ── Fake binary ───────────────────────────────────────────────────────────────
//
// Each test runs a fake `datacustomcode` Node.js script installed into a temp dir
// that is prepended to PATH. The script records argv[2..] to DC_FAKE_ARGS_FILE and
// writes the stdout patterns that the SF CLI plugin's regexes expect.
//
// This mirrors the Python tests' use of CliRunner.invoke() — the real executor code
// runs unchanged; only the binary it spawns is replaced.

const FAKE_BINARY_SCRIPT = `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
const argsFile = process.env.DC_FAKE_ARGS_FILE;
if (argsFile) fs.writeFileSync(argsFile, JSON.stringify(args));
const cmd = args[0];
if (cmd === 'init') {
  const pkgDir = args[args.length - 1];
  process.stdout.write('Copying template to ' + pkgDir + '\\n');
} else if (cmd === 'scan') {
  const entrypoint = args[args.length - 1];
  process.stdout.write('Scanning ' + entrypoint + '...\\n');
}
process.exit(0);
`;

function installFakeBinary(binDir: string): void {
  const binPath = path.join(binDir, 'datacustomcode');
  fs.writeFileSync(binPath, FAKE_BINARY_SCRIPT, { mode: 0o755 });
}

function readRecordedArgs(argsFile: string): string[] {
  return JSON.parse(fs.readFileSync(argsFile, 'utf8')) as string[];
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('SF CLI ↔ Python CLI arg contract (DatacodeBinaryExecutor)', () => {
  let tmpDir: string;
  let argsFile: string;
  let origPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-contract-'));
    argsFile = path.join(tmpDir, 'args.json');
    installFakeBinary(tmpDir);
    origPath = process.env.PATH ?? '';
    process.env.PATH = `${tmpDir}${path.delimiter}${origPath}`;
    process.env.DC_FAKE_ARGS_FILE = argsFile;
  });

  afterEach(() => {
    process.env.PATH = origPath;
    delete process.env.DC_FAKE_ARGS_FILE;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── init ────────────────────────────────────────────────────────────────────

  describe('TestInitArgContract', () => {
    /**
     * SF CLI spawn: datacustomcode init --code-type <script|function> <packageDir>
     * Ref: executeBinaryInit()
     */

    it('accepts --code-type script', async () => {
      await DatacodeBinaryExecutor.executeBinaryInit('script', 'mydir');
      expect(readRecordedArgs(argsFile)).to.deep.equal(['init', '--code-type', 'script', 'mydir']);
    });

    it('accepts --code-type function', async () => {
      await DatacodeBinaryExecutor.executeBinaryInit('function', 'mydir');
      expect(readRecordedArgs(argsFile)).to.deep.equal(['init', '--code-type', 'function', 'mydir']);
    });
  });

  // ── scan ────────────────────────────────────────────────────────────────────

  describe('TestScanArgContract', () => {
    /**
     * SF CLI spawn: datacustomcode scan [--dry-run] [--no-requirements] [--config <file>] <entrypoint>
     * Ref: executeBinaryScan()
     */

    it('accepts positional entrypoint', async () => {
      await DatacodeBinaryExecutor.executeBinaryScan(tmpDir, 'payload/entrypoint.py');
      expect(readRecordedArgs(argsFile)).to.deep.equal(['scan', 'payload/entrypoint.py']);
    });

    it('accepts --dry-run flag', async () => {
      await DatacodeBinaryExecutor.executeBinaryScan(tmpDir, 'payload/entrypoint.py', true);
      expect(readRecordedArgs(argsFile)).to.deep.equal(['scan', '--dry-run', 'payload/entrypoint.py']);
    });

    it('accepts --no-requirements flag', async () => {
      await DatacodeBinaryExecutor.executeBinaryScan(tmpDir, 'payload/entrypoint.py', false, true);
      expect(readRecordedArgs(argsFile)).to.deep.equal(['scan', '--no-requirements', 'payload/entrypoint.py']);
    });

    it('accepts --config flag', async () => {
      await DatacodeBinaryExecutor.executeBinaryScan(
        tmpDir,
        'payload/entrypoint.py',
        false,
        false,
        'custom/config.json'
      );
      expect(readRecordedArgs(argsFile)).to.deep.equal([
        'scan',
        '--config',
        'custom/config.json',
        'payload/entrypoint.py',
      ]);
    });
  });

  // ── zip ─────────────────────────────────────────────────────────────────────

  describe('TestZipArgContract', () => {
    /**
     * SF CLI spawn: datacustomcode zip [--network <network>] <packageDir>
     * Ref: executeBinaryZip()
     */

    it('accepts positional <packageDir>', async () => {
      await DatacodeBinaryExecutor.executeBinaryZip('payload');
      expect(readRecordedArgs(argsFile)).to.deep.equal(['zip', 'payload']);
    });

    it('accepts --network flag', async () => {
      await DatacodeBinaryExecutor.executeBinaryZip('payload', 'custom');
      expect(readRecordedArgs(argsFile)).to.deep.equal(['zip', '--network', 'custom', 'payload']);
    });
  });

  // ── deploy ──────────────────────────────────────────────────────────────────

  describe('TestDeployArgContract', () => {
    /**
     * SF CLI spawn: datacustomcode deploy
     * --name <name> --version <ver> --description <desc>
     * --path <dir> --sf-cli-org <org> --cpu-size <size>
     * [--network <net>] [--function-invoke-opt <opt>]
     * Ref: executeBinaryDeploy()
     */

    const BASE_ARGS = [
      'deploy',
      '--name',
      'my-pkg',
      '--version',
      '1.0.0',
      '--description',
      'My description',
      '--path',
      'payload',
      '--sf-cli-org',
      'my-org',
      '--cpu-size',
      'CPU_2XL',
    ];

    it('accepts required flags', async () => {
      await DatacodeBinaryExecutor.executeBinaryDeploy(
        'my-pkg',
        '1.0.0',
        'My description',
        'payload',
        'my-org',
        'CPU_2XL'
      );
      expect(readRecordedArgs(argsFile)).to.deep.equal(BASE_ARGS);
    });

    it('accepts --network flag', async () => {
      await DatacodeBinaryExecutor.executeBinaryDeploy(
        'my-pkg',
        '1.0.0',
        'My description',
        'payload',
        'my-org',
        'CPU_2XL',
        'custom'
      );
      expect(readRecordedArgs(argsFile)).to.deep.equal([...BASE_ARGS, '--network', 'custom']);
    });

    it('accepts --function-invoke-opt flag', async () => {
      await DatacodeBinaryExecutor.executeBinaryDeploy(
        'my-pkg',
        '1.0.0',
        'My description',
        'payload',
        'my-org',
        'CPU_2XL',
        undefined,
        'ASYNC'
      );
      expect(readRecordedArgs(argsFile)).to.deep.equal([...BASE_ARGS, '--function-invoke-opt', 'ASYNC']);
    });
  });

  // ── run ─────────────────────────────────────────────────────────────────────

  describe('TestRunArgContract', () => {
    /**
     * SF CLI spawn: datacustomcode run --sf-cli-org <org>
     * [--config-file <file>] [--dependencies <deps>] <packageDir>
     * Ref: executeBinaryRun()
     *
     * Known incompatibility: SF CLI passes `--dependencies` once as a single string.
     * Python CLI declares multiple=True, so the value arrives as a 1-tuple containing
     * the raw string rather than individual dep names.
     */

    it('accepts --sf-cli-org and positional <packageDir>', async () => {
      await DatacodeBinaryExecutor.executeBinaryRun('payload/entrypoint.py', 'my-org');
      expect(readRecordedArgs(argsFile)).to.deep.equal(['run', '--sf-cli-org', 'my-org', 'payload/entrypoint.py']);
    });

    it('accepts --config-file flag', async () => {
      await DatacodeBinaryExecutor.executeBinaryRun('payload/entrypoint.py', 'my-org', 'payload/config.json');
      expect(readRecordedArgs(argsFile)).to.deep.equal([
        'run',
        '--sf-cli-org',
        'my-org',
        '--config-file',
        'payload/config.json',
        'payload/entrypoint.py',
      ]);
    });

    it('passes --dependencies as a single string (Python multiple=True receives it as a 1-tuple)', async () => {
      // SF CLI passes --dependencies once as a comma-separated string.
      // Python CLI uses multiple=True, so run_entrypoint receives ("dep1,dep2",)
      // not ("dep1", "dep2"). The string is NOT split on commas.
      await DatacodeBinaryExecutor.executeBinaryRun('payload/entrypoint.py', 'my-org', undefined, 'dep1,dep2');
      expect(readRecordedArgs(argsFile)).to.deep.equal([
        'run',
        '--sf-cli-org',
        'my-org',
        '--dependencies',
        'dep1,dep2',
        'payload/entrypoint.py',
      ]);
    });
  });

  // ── stdout regex contract ────────────────────────────────────────────────────

  describe('TestSfCliOutputRegexContract', () => {
    /**
     * The SF CLI plugin parses stdout from each command with regex patterns.
     * These tests verify that executeBinary*() correctly extracts structured data
     * from the Python CLI's actual output patterns (v0.1.4).
     *
     * Ref: stdout parsing in each executeBinary*() method of datacodeBinaryExecutor.ts.
     */

    it('init: parses "Copying template to <dir>" into filesCreated', async () => {
      // Fake binary outputs: "Copying template to mydir"
      const result = await DatacodeBinaryExecutor.executeBinaryInit('script', 'mydir');
      expect(result.filesCreated).to.deep.equal(['mydir']);
    });

    it('scan: parses "Scanning <file>..." into filesScanned', async () => {
      // Fake binary outputs: "Scanning payload/entrypoint.py..."
      const result = await DatacodeBinaryExecutor.executeBinaryScan(tmpDir, 'payload/entrypoint.py', true);
      expect(result.filesScanned).to.deep.equal(['payload/entrypoint.py']);
    });
  });
});
