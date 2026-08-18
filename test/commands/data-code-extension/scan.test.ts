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
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { TestContext } from '@salesforce/core/testSetup';
import { expect } from 'chai';
import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
import { setPipreqsMock } from '../../../src/utils/nativeScan.js';
import { PythonChecker } from '../../../src/utils/pythonChecker.js';
import { PipChecker } from '../../../src/utils/pipChecker.js';
import ScriptScan from '../../../src/commands/data-code-extension/script/scan.js';
import FunctionScan from '../../../src/commands/data-code-extension/function/scan.js';

describe('data-code-extension scan commands', () => {
  const $$ = new TestContext();
  let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;
  let testDir: string;
  let originalCwd: string;

  function makeScriptPackage(scanCode: string, configJson: Record<string, unknown> = { dataspace: 'default' }): void {
    fs.mkdirSync(path.join(testDir, '.datacustomcode_proj'), { recursive: true });
    fs.writeFileSync(path.join(testDir, '.datacustomcode_proj', 'sdk_config.json'), JSON.stringify({ type: 'script' }));
    fs.mkdirSync(path.join(testDir, 'payload'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'payload', 'entrypoint.py'), scanCode);
    fs.writeFileSync(path.join(testDir, 'payload', 'config.json'), JSON.stringify(configJson));
  }

  function makeFunctionPackage(scanCode: string): void {
    fs.mkdirSync(path.join(testDir, '.datacustomcode_proj'), { recursive: true });
    fs.writeFileSync(
      path.join(testDir, '.datacustomcode_proj', 'sdk_config.json'),
      JSON.stringify({ type: 'function' })
    );
    fs.mkdirSync(path.join(testDir, 'payload'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'payload', 'entrypoint.py'), scanCode);
    fs.writeFileSync(path.join(testDir, 'payload', 'config.json'), JSON.stringify({}));
  }

  beforeEach(() => {
    sfCommandStubs = stubSfCommandUx($$.SANDBOX);
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-scan-'));
    originalCwd = process.cwd();
    process.chdir(testDir);
    setPipreqsMock(async () => 'pandas\nnumpy\n');

    $$.SANDBOX.stub(PythonChecker, 'checkPython311').resolves({
      command: 'python3',
      version: '3.11.5',
      major: 3,
      minor: 11,
      patch: 5,
    });

    $$.SANDBOX.stub(PipChecker, 'checkPackage').resolves({
      name: 'salesforce-data-customcode',
      version: '1.0.0',
      location: '/usr/local/lib/python3.11/site-packages',
      pipCommand: 'pip3',
    });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    setPipreqsMock(null);
    $$.restore();
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('script scan', () => {
    it('updates config.json with scanned permissions', async () => {
      makeScriptPackage(
        'from datacustomcode.client import Client\n' +
          'def main():\n' +
          '    c = Client()\n' +
          '    c.read_dlo("Source__dll")\n' +
          '    c.write_to_dlo("Dest__dll", df)\n'
      );

      const result = await ScriptScan.run([]);

      expect(result.success).to.be.true;
      expect(result.codeType).to.equal('script');
      expect(result.executionResult.dryRun).to.be.false;

      const written = JSON.parse(fs.readFileSync(path.join(testDir, 'payload', 'config.json'), 'utf8')) as Record<
        string,
        unknown
      > & { permissions: { read: { dlo?: string[] }; write: { dlo?: string[] } } };
      expect(written.entryPoint).to.equal('entrypoint.py');
      expect(written.dataspace).to.equal('default');
      expect(written.permissions.read.dlo).to.deep.equal(['Source__dll']);
      expect(written.permissions.write.dlo).to.deep.equal(['Dest__dll']);
      expect(sfCommandStubs.log.called).to.be.true;
    });

    it('writes requirements.txt by default and merges with existing entries', async () => {
      makeScriptPackage(
        'import pandas\n' +
          'from numpy import array\n' +
          'from datacustomcode.client import Client\n' +
          'def main():\n' +
          '    Client().read_dlo("X__dll")\n' +
          '    Client().write_to_dlo("Y__dll", df)\n'
      );
      // Pre-existing requirements.txt should be merged with newly discovered packages.
      fs.writeFileSync(path.join(testDir, 'requirements.txt'), 'requests\npandas\n');

      await ScriptScan.run([]);

      const reqs = fs
        .readFileSync(path.join(testDir, 'requirements.txt'), 'utf8')
        .split('\n')
        .filter((l) => l.trim().length > 0);
      expect(reqs).to.deep.equal(['numpy', 'pandas', 'requests']);
    });

    it('skips writing requirements when --no-requirements is set', async () => {
      makeScriptPackage(
        'import pandas\nfrom datacustomcode.client import Client\n' +
          'def main():\n' +
          '    Client().read_dlo("X__dll")\n' +
          '    Client().write_to_dlo("Y__dll", df)\n'
      );

      await ScriptScan.run(['--no-requirements']);

      expect(fs.existsSync(path.join(testDir, 'requirements.txt'))).to.be.false;
    });

    it('does not write files in --dry-run mode', async () => {
      makeScriptPackage(
        'from datacustomcode.client import Client\n' +
          'def main():\n' +
          '    Client().read_dlo("X__dll")\n' +
          '    Client().write_to_dlo("Y__dll", df)\n'
      );
      const before = fs.readFileSync(path.join(testDir, 'payload', 'config.json'), 'utf8');

      const result = await ScriptScan.run(['--dry-run']);

      expect(result.executionResult.dryRun).to.be.true;
      expect(fs.readFileSync(path.join(testDir, 'payload', 'config.json'), 'utf8')).to.equal(before);
      expect(fs.existsSync(path.join(testDir, 'requirements.txt'))).to.be.false;
    });

    it('writes to --config-file path when supplied', async () => {
      makeScriptPackage(
        'from datacustomcode.client import Client\n' +
          'def main():\n' +
          '    Client().read_dlo("X__dll")\n' +
          '    Client().write_to_dlo("Y__dll", df)\n'
      );
      const altConfig = path.join(testDir, 'alt-config.json');
      fs.writeFileSync(altConfig, JSON.stringify({ dataspace: 'CustomSpace', extraField: 1 }));

      await ScriptScan.run(['--config-file', altConfig]);

      const written = JSON.parse(fs.readFileSync(altConfig, 'utf8')) as {
        dataspace: string;
        entryPoint: string;
        extraField?: number;
        permissions: { read: { dlo?: string[] } };
      };
      expect(written.dataspace).to.equal('CustomSpace');
      expect(written.extraField).to.equal(1);
      expect(written.entryPoint).to.equal('entrypoint.py');
      expect(written.permissions.read.dlo).to.deep.equal(['X__dll']);
      // Default config.json should be untouched.
      const defaultCfg = JSON.parse(fs.readFileSync(path.join(testDir, 'payload', 'config.json'), 'utf8')) as Record<
        string,
        unknown
      >;
      expect(defaultCfg.permissions).to.be.undefined;
    });

    it('throws when entrypoint is missing', async () => {
      makeScriptPackage('def main():\n    pass\n');
      fs.unlinkSync(path.join(testDir, 'payload', 'entrypoint.py'));

      try {
        await ScriptScan.run([]);
        expect.fail('Expected EntrypointNotFound');
      } catch (err) {
        expect(err).to.have.property('name', 'EntrypointNotFound');
      }
    });

    it('throws when entrypoint has no read calls', async () => {
      makeScriptPackage('def main():\n    pass\n');

      try {
        await ScriptScan.run([]);
        expect.fail('Expected InvalidEntrypoint');
      } catch (err) {
        expect(err).to.have.property('name', 'InvalidEntrypoint');
      }
    });
  });

  describe('function scan', () => {
    it('updates config.json with entryPoint and skips permissions', async () => {
      makeFunctionPackage(
        'from datacustomcode.function import Runtime\n' +
          'def function(request, runtime: Runtime):\n' +
          '    return {}\n'
      );

      const result = await FunctionScan.run([]);

      expect(result.success).to.be.true;
      expect(result.codeType).to.equal('function');

      const written = JSON.parse(fs.readFileSync(path.join(testDir, 'payload', 'config.json'), 'utf8')) as Record<
        string,
        unknown
      >;
      expect(written.entryPoint).to.equal('entrypoint.py');
      expect(written.permissions).to.be.undefined;
      expect(written.dataspace).to.be.undefined;
    });

    it('writes requirements.txt for function packages too', async () => {
      setPipreqsMock(async () => 'pandas\n');

      makeFunctionPackage(
        'from datacustomcode.function import Runtime\n' +
          'import pandas\n' +
          'def function(request, runtime: Runtime):\n' +
          '    return {}\n'
      );

      await FunctionScan.run([]);

      const reqs = fs
        .readFileSync(path.join(testDir, 'requirements.txt'), 'utf8')
        .split('\n')
        .filter((l) => l.trim().length > 0);
      expect(reqs).to.deep.equal(['pandas']);
    });
  });
});
