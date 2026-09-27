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
import { SfError, Org, Connection } from '@salesforce/core';
import * as sinon from 'sinon';
import ScriptRun from '../../../src/commands/data-code-extension/script/run.js';
import FunctionRun from '../../../src/commands/data-code-extension/function/run.js';
import { PythonRunner } from '../../../src/utils/pythonRunner.js';
import { PythonChecker } from '../../../src/utils/pythonChecker.js';
import { PipChecker } from '../../../src/utils/pipChecker.js';

describe('data-code-extension run', () => {
  const $$ = new TestContext();
  let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;
  let runStub: sinon.SinonStub;
  let orgCreateStub: sinon.SinonStub;
  let mockOrg: Org;
  let mockConnection: Connection;
  let testDir: string;
  let entrypointPath: string;
  let testJsonPath: string;
  let configPath: string;

  beforeEach(() => {
    // Real files on disk: --entrypoint/--test-with/--config-file are Flags.file({ exists: true }).
    testDir = path.join(os.tmpdir(), `test-run-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    entrypointPath = path.join(testDir, 'entrypoint.py');
    fs.writeFileSync(entrypointPath, 'print("hi")\n');
    testJsonPath = path.join(testDir, 'test.json');
    fs.writeFileSync(testJsonPath, '{}');
    configPath = path.join(testDir, 'config.json');
    fs.writeFileSync(configPath, '{}');

    sfCommandStubs = stubSfCommandUx($$.SANDBOX);

    mockConnection = {
      refreshAuth: $$.SANDBOX.stub().resolves(),
    } as unknown as Connection;

    mockOrg = {
      getUsername: () => 'test@example.com',
      getConnection: () => mockConnection,
    } as unknown as Org;

    orgCreateStub = $$.SANDBOX.stub(Org, 'create').resolves(mockOrg);

    // The environment check shells out to Python/pip; stub the static checkers so the
    // command exercises its own logic without a real interpreter.
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
      location: '/site-packages',
      pipCommand: 'pip',
    });
    $$.SANDBOX.stub(PipChecker, 'checkForUpdate').resolves(null);

    // The command delegates the whole local run to PythonRunner.run (the wrapper around
    // the SDK-library shim); stub it the way deploy stubs NativeDeployer.deploy.
    runStub = $$.SANDBOX.stub(PythonRunner, 'run').resolves({ stdout: 'ran ok', stderr: '', exitCode: 0 });
  });

  afterEach(() => {
    $$.restore();
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('script run', () => {
    it('runs a script package and forwards the resolved options', async () => {
      const result = await ScriptRun.run(['--entrypoint', entrypointPath, '--target-org', 'test@example.com']);

      expect(runStub.calledOnce).to.be.true;
      const opts = runStub.firstCall.args[0] as Record<string, unknown>;
      expect(opts.pythonCommand).to.equal('python3');
      expect(opts.entrypoint).to.equal(entrypointPath);
      expect(opts.sfCliOrg).to.equal('test@example.com');
      expect(opts.dependencies).to.deep.equal([]);
      // Live streaming must be wired so the entrypoint's output reaches the terminal.
      expect(opts.onStdout).to.be.a('function');
      expect(opts.onStderr).to.be.a('function');

      // The org is authenticated before the run.
      expect((mockConnection.refreshAuth as sinon.SinonStub).calledOnce).to.be.true;

      expect(result).to.have.property('success', true);
      expect(result).to.have.property('codeType', 'script');
      expect(result).to.have.property('status', 'Success');
      expect(result).to.have.property('output', 'ran ok');
      expect(result).to.have.property('targetOrg', 'test@example.com');
      expect(sfCommandStubs.log.calledWith('Data Code Extension run completed successfully!')).to.be.true;
    });

    it('requires --target-org (errors when none given and no default org)', async () => {
      // requiredOrg falls back to the default org; with no default configured, Org.create
      // fails to resolve one and the command must error before running anything.
      orgCreateStub.rejects(new SfError('No default environment found', 'NoDefaultEnv'));

      try {
        await ScriptRun.run(['--entrypoint', entrypointPath]);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
      }
      expect(runStub.called).to.be.false;
    });

    it('forwards a custom --config-file', async () => {
      await ScriptRun.run([
        '--entrypoint',
        entrypointPath,
        '--target-org',
        'test@example.com',
        '--config-file',
        configPath,
      ]);

      const opts = runStub.firstCall.args[0] as Record<string, unknown>;
      expect(opts.configFile).to.equal(configPath);
    });

    it('comma-splits --dependencies into a list', async () => {
      await ScriptRun.run([
        '--entrypoint',
        entrypointPath,
        '--target-org',
        'test@example.com',
        '--dependencies',
        'pandas, numpy ,,scipy',
      ]);

      const opts = runStub.firstCall.args[0] as Record<string, unknown>;
      expect(opts.dependencies).to.deep.equal(['pandas', 'numpy', 'scipy']);
    });

    it('does not run when authentication fails', async () => {
      mockConnection.refreshAuth = $$.SANDBOX.stub().rejects(new Error('Authentication failed'));

      try {
        await ScriptRun.run(['--entrypoint', entrypointPath, '--target-org', 'test@example.com']);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
      }
      expect(runStub.called).to.be.false;
    });

    it('surfaces a RunExecutionFailed error from the runner', async () => {
      runStub.rejects(new SfError('The package run failed: boom', 'RunExecutionFailed'));

      try {
        await ScriptRun.run(['--entrypoint', entrypointPath, '--target-org', 'test@example.com']);
        expect.fail('Should have thrown an error');
      } catch (error: unknown) {
        expect(error).to.be.instanceOf(Error);
        // The framework may wrap the thrown SfError as a cause on the command error.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        const cause = (error as any).cause;
        if (cause) {
          expect(cause).to.be.instanceOf(SfError);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(cause.name).to.equal('RunExecutionFailed');
        } else if (error instanceof SfError) {
          expect(error.name).to.equal('RunExecutionFailed');
        }
      }
    });
  });

  describe('function run', () => {
    it('requires --test-with', async () => {
      try {
        await FunctionRun.run(['--entrypoint', entrypointPath]);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
      }
      expect(runStub.called).to.be.false;
    });

    it('runs a function package with --test-with and no org', async () => {
      // optionalOrg's default resolves via Org.create(); make it fail so no org is used.
      orgCreateStub.rejects(new SfError('No default environment found', 'NoDefaultEnv'));

      const result = await FunctionRun.run(['--entrypoint', entrypointPath, '--test-with', testJsonPath]);

      expect(runStub.calledOnce).to.be.true;
      const opts = runStub.firstCall.args[0] as Record<string, unknown>;
      expect(opts.testFile).to.equal(testJsonPath);
      expect(opts.sfCliOrg).to.equal(undefined);
      // With no org there is nothing to authenticate.
      expect((mockConnection.refreshAuth as sinon.SinonStub).called).to.be.false;
      expect(result).to.have.property('codeType', 'function');
      expect(result).to.have.property('status', 'Success');
    });

    it('forwards the org and test file when --target-org is given', async () => {
      await FunctionRun.run([
        '--entrypoint',
        entrypointPath,
        '--test-with',
        testJsonPath,
        '--target-org',
        'test@example.com',
      ]);

      const opts = runStub.firstCall.args[0] as Record<string, unknown>;
      expect(opts.testFile).to.equal(testJsonPath);
      expect(opts.sfCliOrg).to.equal('test@example.com');
      expect((mockConnection.refreshAuth as sinon.SinonStub).calledOnce).to.be.true;
    });
  });
});
