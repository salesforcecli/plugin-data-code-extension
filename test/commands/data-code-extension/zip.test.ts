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
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { TestContext } from '@salesforce/core/testSetup';
import { expect } from 'chai';
import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
import ScriptZip from '../../../src/commands/data-code-extension/script/zip.js';
import FunctionZip from '../../../src/commands/data-code-extension/function/zip.js';
import { type ZipResult } from '../../../src/base/zipBase.js';

/**
 * Write a minimal initialized package (no requirements.txt, so zip skips the
 * Docker dependency build) and return its payload directory.
 */
function writePackage(root: string, type: 'script' | 'function'): string {
  const sdkDir = path.join(root, '.datacustomcode_proj');
  const payload = path.join(root, 'payload');
  mkdirSync(sdkDir, { recursive: true });
  mkdirSync(payload, { recursive: true });
  writeFileSync(path.join(sdkDir, 'sdk_config.json'), JSON.stringify({ type }));
  writeFileSync(path.join(payload, 'entrypoint.py'), 'print("hello")\n');
  writeFileSync(path.join(payload, 'config.json'), JSON.stringify({ entryPoint: 'entrypoint.py' }));
  return payload;
}

describe('data-code-extension zip commands', () => {
  const $$ = new TestContext();
  let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    sfCommandStubs = stubSfCommandUx($$.SANDBOX);
    tempDir = mkdtempSync(path.join(tmpdir(), 'zip-command-'));
    // deployment.zip is written to the current directory.
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
    $$.restore();
  });

  for (const type of ['script', 'function'] as const) {
    const run = async (argv: string[]): Promise<ZipResult> =>
      type === 'script' ? ScriptZip.run(argv) : FunctionZip.run(argv);

    it(`zips a ${type} payload`, async () => {
      const payload = writePackage(path.join(tempDir, 'pkg'), type);

      const result = await run(['--package-dir', payload]);

      expect(result).to.deep.include({
        success: true,
        codeType: type,
        packageDir: payload,
        archivePath: 'deployment.zip',
        fileCount: 2,
      });
      expect(result.archiveSizeBytes).to.be.greaterThan(0);
      expect(result.message).to.be.a('string').that.is.not.empty;
      expect(existsSync(path.join(tempDir, 'deployment.zip'))).to.equal(true);

      const logged = sfCommandStubs.log.args.flat().join('\n');
      expect(logged).to.include('deployment.zip');
      expect(logged).to.match(/\d+(\.\d+)? (B|KB)/);
    });

    it(`accepts --network for a ${type} payload`, async () => {
      const payload = writePackage(path.join(tempDir, 'pkg'), type);

      const result = await run(['--package-dir', payload, '--network', 'host']);

      expect(result.success).to.equal(true);
      expect(result.codeType).to.equal(type);
    });

    it(`fails with PackageDirNotFound for a missing ${type} directory`, async () => {
      const missing = path.join(tempDir, 'does-not-exist');
      try {
        await run(['--package-dir', missing]);
        expect.fail('expected zip to throw');
      } catch (error) {
        expect(error).to.have.property('name', 'PackageDirNotFound');
        expect((error as { actions?: string[] }).actions).to.be.an('array').that.is.not.empty;
      }
    });
  }
});
