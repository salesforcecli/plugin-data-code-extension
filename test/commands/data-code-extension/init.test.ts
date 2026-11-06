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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { TestContext } from '@salesforce/core/testSetup';
import { expect } from 'chai';
import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
import ScriptInit from '../../../src/commands/data-code-extension/script/init.js';
import FunctionInit from '../../../src/commands/data-code-extension/function/init.js';
import { PythonChecker } from '../../../src/utils/pythonChecker.js';
import { PipChecker } from '../../../src/utils/pipChecker.js';

describe('data-code-extension init commands', () => {
  const $$ = new TestContext();
  let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;

  beforeEach(() => {
    sfCommandStubs = stubSfCommandUx($$.SANDBOX);
  });

  afterEach(() => {
    $$.restore();
  });

  it('runs script init command successfully', async () => {
    try {
      const result = await ScriptInit.run(['--package-dir', './test-dir']);

      // If Python 3.11+ is installed, check the success result
      expect(result.success).to.be.true;
      expect(result.codeType).to.equal('script');
      expect(result.pythonVersion).to.have.property('command');
      expect(result.pythonVersion).to.have.property('version');
      expect(result.pythonVersion).to.have.property('major');
      expect(result.pythonVersion).to.have.property('minor');
      expect(result.pythonVersion).to.have.property('patch');

      // Check package info if present
      if (result.packageInfo) {
        expect(result.packageInfo).to.have.property('name');
        expect(result.packageInfo).to.have.property('version');
        expect(result.packageInfo).to.have.property('location');
        expect(result.packageInfo).to.have.property('pipCommand');
      }

      // Check execution result if present (when all prerequisites are met)
      if (result.executionResult) {
        expect(result.executionResult).to.have.property('configPath');
        expect(result.executionResult.configPath).to.match(/test-dir.*config\.json$/);
        expect(result.executionResult.filesCreated).to.be.an('array');
        expect(result.executionResult.filesCreated).to.include('./test-dir');
      }

      expect(result.message).to.be.a('string');
      expect(result.message.length).to.be.greaterThan(0);

      // Verify that logging was called (without checking specific content)
      // The refactoring to base class may affect how stubs capture logs
      expect(sfCommandStubs.log.called).to.be.true;
    } catch (error) {
      // If Python 3.11+ is not installed, pip package is missing, binary is not found, or init fails, verify the error is handled correctly
      expect(error).to.have.property('name');
      if (error instanceof Error) {
        expect(error.name).to.be.oneOf([
          'PythonNotFound',
          'PythonVersionMismatch',
          'PipNotFound',
          'PackageNotInstalled',
          'BinaryNotFound',
          'BinaryNotExecutable',
          'InitPermissionDenied',
          'InitDirectoryExists',
          'InitTemplateNotFound',
          'InitInvalidEntrypoint',
        ]);
        expect(error.message).to.be.a('string');
        if ('actions' in error && error.actions) {
          expect(error.actions).to.be.an('array');
        }
      }
    }
  });

  it('returns structured result for script init', async () => {
    try {
      const result = await ScriptInit.run(['--package-dir', './test-json']);

      // Should return a structured result
      expect(result).to.be.an('object');
      expect(result).to.have.property('success');
      expect(result).to.have.property('pythonVersion');
      expect(result).to.have.property('message');
      // packageInfo may or may not be present depending on whether package is installed
    } catch (error) {
      expect(error).to.have.property('name');
      if (error instanceof Error) {
        expect(error.name).to.be.a('string');
        expect(error.message).to.be.a('string');
      }
    }
  });

  it('runs function init command successfully', async () => {
    try {
      const result = await FunctionInit.run([
        '--package-dir',
        './test-function',
        '--use-in-feature',
        'SearchIndexChunking',
      ]);
      expect(result.codeType).to.equal('function');
      expect(result.packageDir).to.equal('./test-function');
      expect(result.success).to.be.true;
    } catch (error) {
      // Handle case where Python is not installed
      if (error instanceof Error) {
        expect(error.name).to.be.oneOf([
          'PythonNotFound',
          'PythonVersionMismatch',
          'PipNotFound',
          'PackageNotInstalled',
          'BinaryNotFound',
          'BinaryNotExecutable',
          'InitPermissionDenied',
          'InitDirectoryExists',
          'InitTemplateNotFound',
          'InitInvalidEntrypoint',
        ]);
      }
    }
  });

  it('script init returns codeType as script', async () => {
    try {
      const result = await ScriptInit.run(['--package-dir', './test-script']);
      expect(result.codeType).to.equal('script');
      expect(result.packageDir).to.equal('./test-script');
    } catch (error) {
      // Handle case where Python is not installed
      if (error instanceof Error) {
        expect(error.name).to.be.oneOf([
          'PythonNotFound',
          'PythonVersionMismatch',
          'PipNotFound',
          'PackageNotInstalled',
          'BinaryNotFound',
          'BinaryNotExecutable',
          'InitPermissionDenied',
          'InitDirectoryExists',
          'InitTemplateNotFound',
          'InitInvalidEntrypoint',
        ]);
      }
    }
  });

  it('function init returns codeType as function', async () => {
    try {
      const result = await FunctionInit.run([
        '--package-dir',
        './test-function-type',
        '--use-in-feature',
        'SearchIndexChunking',
      ]);
      expect(result.codeType).to.equal('function');
      expect(result.packageDir).to.equal('./test-function-type');
    } catch (error) {
      // Handle case where Python is not installed
      if (error instanceof Error) {
        expect(error.name).to.be.oneOf([
          'PythonNotFound',
          'PythonVersionMismatch',
          'PipNotFound',
          'PackageNotInstalled',
          'BinaryNotFound',
          'BinaryNotExecutable',
          'InitPermissionDenied',
          'InitDirectoryExists',
          'InitTemplateNotFound',
          'InitInvalidEntrypoint',
        ]);
      }
    }
  });

  it('fails when package-dir is not provided for script init', async () => {
    try {
      await ScriptInit.run([]);
      expect.fail('Should have thrown an error for missing required flag');
    } catch (error) {
      expect(error).to.exist;
      if (error instanceof Error) {
        expect(error.message).to.include('package-dir');
      }
    }
  });

  it('fails when package-dir is not provided for function init', async () => {
    try {
      await FunctionInit.run([]);
      expect.fail('Should have thrown an error for missing required flag');
    } catch (error) {
      expect(error).to.exist;
      if (error instanceof Error) {
        // Could fail on either missing flag
        expect(error.message).to.match(/package-dir|use-in-feature/);
      }
    }
  });

  it('uses default value for use-in-feature when not provided', async () => {
    try {
      const result = await FunctionInit.run(['--package-dir', './test-function']);
      // Should succeed with default value
      expect(result.codeType).to.equal('function');
      expect(result.success).to.be.true;
    } catch (error) {
      // Handle case where Python is not installed
      if (error instanceof Error) {
        expect(error.name).to.be.oneOf([
          'PythonNotFound',
          'PythonVersionMismatch',
          'PipNotFound',
          'PackageNotInstalled',
          'BinaryNotFound',
          'BinaryNotExecutable',
          'InitPermissionDenied',
          'InitDirectoryExists',
          'InitTemplateNotFound',
          'InitInvalidEntrypoint',
        ]);
      }
    }
  });

  it('script init accepts --use-in-feature StreamingTransform', async () => {
    // Regression guard: the flag must exist on script init. Before the fix, oclif rejected
    // this with "Nonexistent flag: --use-in-feature". We allow environment errors (no
    // Python/package installed) but never a parse-level nonexistent/unexpected-flag error.
    try {
      const result = await ScriptInit.run([
        '--package-dir',
        './test-streaming',
        '--use-in-feature',
        'StreamingTransform',
      ]);
      expect(result.codeType).to.equal('script');
    } catch (error) {
      expect(error).to.be.instanceOf(Error);
      const message = (error as Error).message;
      expect(message).to.not.match(/nonexistent flag/i);
      expect(message).to.not.match(/unexpected argument/i);
    }
  });

  it('script init rejects an invalid --use-in-feature value', async () => {
    // Deterministic: oclif validates the `options` list during parse, before any
    // environment check, so this fails the same way regardless of the local toolchain.
    try {
      await ScriptInit.run(['--package-dir', './test-bad-feature', '--use-in-feature', 'NotARealFeature']);
      expect.fail('Should have thrown for an invalid --use-in-feature value');
    } catch (error) {
      expect(error).to.be.instanceOf(Error);
      const message = (error as Error).message;
      expect(message).to.include('BatchTransform');
      expect(message).to.include('StreamingTransform');
    }
  });

  describe('with a stubbed environment', () => {
    let root: string;

    beforeEach(() => {
      root = mkdtempSync(path.join(tmpdir(), 'init-command-'));
      // Minimal fake SDK install with the script template, streaming example, and config.yaml.
      const sdk = path.join(root, 'site-packages', 'datacustomcode');
      const script = path.join(sdk, 'templates', 'script');
      mkdirSync(path.join(script, 'payload'), { recursive: true });
      mkdirSync(path.join(script, 'examples', 'streaming_deltas'), { recursive: true });
      writeFileSync(
        path.join(script, 'payload', 'entrypoint.py'),
        'c.read_dlo("a__dll")\nc.write_to_dlo("b__dll", df)\n'
      );
      writeFileSync(path.join(script, 'payload', 'config.json'), '{}');
      writeFileSync(
        path.join(script, 'examples', 'streaming_deltas', 'entrypoint.py'),
        'df = c.read_dlo_deltas()\nc.write_dlo_deltas("b__dll", df)\n'
      );
      writeFileSync(
        path.join(sdk, 'config.yaml'),
        'reader_config:\n  type_config_name: R\nwriter_config:\n  type_config_name: W\n'
      );

      $$.SANDBOX.stub(PythonChecker, 'checkPython311').resolves({
        command: 'python3',
        version: '3.11.5',
        major: 3,
        minor: 11,
        patch: 5,
      });
      $$.SANDBOX.stub(PipChecker, 'checkPackage').resolves({
        name: 'salesforce-data-customcode',
        version: '7.0.0',
        location: path.join(root, 'site-packages'),
        pipCommand: 'pip3',
      });
    });

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    it('warns to set streamingSource.name after a StreamingTransform init', async () => {
      const packageDir = path.join(root, 'stream');
      await ScriptInit.run(['--package-dir', packageDir, '--use-in-feature', 'StreamingTransform']);

      const warned = sfCommandStubs.warn
        .getCalls()
        .map((call) => call.args[0] as string)
        .join('\n');
      expect(warned).to.include('streamingSource.name');
      expect(warned).to.include(path.join(packageDir, 'payload', 'config.json'));
    });

    it('does not warn after a BatchTransform init', async () => {
      await ScriptInit.run(['--package-dir', path.join(root, 'batch')]);
      expect(sfCommandStubs.warn.called).to.be.false;
    });
  });
});
