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
import ScriptDeploy from '../../../src/commands/data-code-extension/script/deploy.js';
import FunctionDeploy from '../../../src/commands/data-code-extension/function/deploy.js';
import { NativeDeployer } from '../../../src/utils/nativeDeploy.js';

describe('data-code-extension deploy', () => {
  const $$ = new TestContext();
  let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;
  let deployStub: sinon.SinonStub;
  let mockOrg: Org;
  let mockConnection: Connection;
  let testDir: string;

  beforeEach(() => {
    // Create a temporary directory to satisfy the required, existing --package-dir flag.
    testDir = path.join(os.tmpdir(), `test-deploy-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    sfCommandStubs = stubSfCommandUx($$.SANDBOX);

    mockConnection = {
      refreshAuth: $$.SANDBOX.stub().resolves(),
    } as unknown as Connection;

    mockOrg = {
      getUsername: () => 'test@example.com',
      getConnection: () => mockConnection,
    } as unknown as Org;

    $$.SANDBOX.stub(Org, 'create').resolves(mockOrg);

    // The command now delegates the whole deploy to NativeDeployer.deploy (the native
    // TypeScript port of the SDK's deploy_full); stub it the way the old suite stubbed
    // DatacodeBinaryExecutor.executeBinaryDeploy. It returns a NativeDeployResult.
    deployStub = $$.SANDBOX.stub(NativeDeployer, 'deploy').resolves({
      success: true,
      codeType: 'script',
      name: 'test_script',
      version: '1.0.0',
      status: 'Deployed',
    });
  });

  afterEach(() => {
    $$.restore();
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('script deploy', () => {
    it('should deploy a script package successfully', async () => {
      await ScriptDeploy.run([
        '--name',
        'test-script',
        '--package-version',
        '1.0.0',
        '--description',
        'Test script deployment',
        '--package-dir',
        testDir,
        '--target-org',
        'test@example.com',
      ]);

      expect(sfCommandStubs.log.calledWith('Data Code Extension deployment completed successfully!')).to.be.true;
      expect(deployStub.calledOnce).to.be.true;
      const opts = deployStub.firstCall.args[0] as Record<string, unknown>;
      expect(opts.name).to.equal('test-script');
      expect(opts.version).to.equal('1.0.0');
      expect(opts.description).to.equal('Test script deployment');
      expect(opts.packageDir).to.equal(testDir);
      expect(opts.cpuSize).to.equal('CPU_2XL'); // Default CPU size
      expect(opts.connection).to.equal(mockConnection);
    });

    it('should deploy with custom CPU size', async () => {
      await ScriptDeploy.run([
        '--name',
        'test-script',
        '--package-version',
        '1.0.0',
        '--description',
        'Test script deployment',
        '--package-dir',
        testDir,
        '--target-org',
        'test@example.com',
        '--cpu-size',
        'CPU_4XL',
      ]);

      const opts = deployStub.firstCall.args[0] as Record<string, unknown>;
      expect(opts.cpuSize).to.equal('CPU_4XL');
    });

    it('should deploy with network configuration', async () => {
      await ScriptDeploy.run([
        '--name',
        'test-script',
        '--package-version',
        '1.0.0',
        '--description',
        'Test script deployment',
        '--package-dir',
        testDir,
        '--target-org',
        'test@example.com',
        '--network',
        'host',
      ]);

      const opts = deployStub.firstCall.args[0] as Record<string, unknown>;
      expect(opts.network).to.equal('host');
    });

    it('should handle authentication failure', async () => {
      mockConnection.refreshAuth = $$.SANDBOX.stub().rejects(new Error('Authentication failed'));

      try {
        await ScriptDeploy.run([
          '--name',
          'test-script',
          '--package-version',
          '1.0.0',
          '--description',
          'Test script deployment',
          '--package-dir',
          testDir,
          '--target-org',
          'test@example.com',
        ]);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
      }
      // The deploy must not run when auth fails.
      expect(deployStub.called).to.be.false;
    });

    it('should surface a deployment name conflict from the deployer', async () => {
      deployStub.rejects(
        new SfError('Deployment test_script exists. Please use a different name.', 'DeploymentExists')
      );

      try {
        await ScriptDeploy.run([
          '--name',
          'test-script',
          '--package-version',
          '1.0.0',
          '--description',
          'Test script deployment',
          '--package-dir',
          testDir,
          '--target-org',
          'test@example.com',
        ]);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('DeploymentExists');
      }
    });
  });

  describe('function deploy', () => {
    it('should deploy a function package successfully', async () => {
      await FunctionDeploy.run([
        '--name',
        'test-function',
        '--package-version',
        '1.0.0',
        '--description',
        'Test function deployment',
        '--package-dir',
        testDir,
        '--target-org',
        'test@example.com',
      ]);

      expect(sfCommandStubs.log.calledWith('Data Code Extension deployment completed successfully!')).to.be.true;
      expect(deployStub.calledOnce).to.be.true;
      const opts = deployStub.firstCall.args[0] as Record<string, unknown>;
      expect(opts.name).to.equal('test-function');
    });

    it('should validate CPU size options', async () => {
      try {
        await FunctionDeploy.run([
          '--name',
          'test-function',
          '--package-version',
          '1.0.0',
          '--description',
          'Test function deployment',
          '--package-dir',
          testDir,
          '--target-org',
          'test@example.com',
          '--cpu-size',
          'INVALID_SIZE',
        ]);
        expect.fail('Should have thrown an error');
      } catch (error) {
        // Flag validation should catch invalid CPU size before deploy runs.
        expect(error).to.be.instanceOf(Error);
        expect(deployStub.called).to.be.false;
      }
    });

    it('should surface a quota exceeded error from the deployer', async () => {
      deployStub.rejects(new SfError('Deployment quota exceeded for the organization', 'DeployQuotaExceeded'));

      try {
        await FunctionDeploy.run([
          '--name',
          'test-function',
          '--package-version',
          '1.0.0',
          '--description',
          'Test function deployment',
          '--package-dir',
          testDir,
          '--target-org',
          'test@example.com',
        ]);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('DeployQuotaExceeded');
      }
    });

    it('should surface a package validation error from the deployer', async () => {
      deployStub.rejects(new SfError('Package validation failed', 'DeployPackageInvalid'));

      try {
        await FunctionDeploy.run([
          '--name',
          'test-function',
          '--package-version',
          '1.0.0',
          '--description',
          'Test function deployment',
          '--package-dir',
          testDir,
          '--target-org',
          'test@example.com',
        ]);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('DeployPackageInvalid');
      }
    });
  });

  describe('deployment result handling', () => {
    it('should return a structured result with the deployer name/version/status', async () => {
      const result = await ScriptDeploy.run([
        '--name',
        'test-script',
        '--package-version',
        '1.0.0',
        '--description',
        'Test script deployment',
        '--package-dir',
        testDir,
        '--target-org',
        'test@example.com',
      ]);

      expect(result).to.have.property('success', true);
      expect(result).to.have.property('codeType', 'script');
      expect(result).to.have.property('name', 'test_script');
      expect(result).to.have.property('version', '1.0.0');
      expect(result).to.have.property('status', 'Deployed');
      expect(result).to.have.property('targetOrg', 'test@example.com');
    });

    it('should report the function code type in the result', async () => {
      const result = await FunctionDeploy.run([
        '--name',
        'test-function',
        '--package-version',
        '1.0.0',
        '--description',
        'Test function deployment',
        '--package-dir',
        testDir,
        '--target-org',
        'test@example.com',
      ]);

      expect(result).to.have.property('codeType', 'function');
    });
  });

  describe('error scenarios', () => {
    it('should surface a network error from the deployer', async () => {
      deployStub.rejects(new SfError('Network error occurred during deployment', 'DeployNetworkError'));

      try {
        await ScriptDeploy.run([
          '--name',
          'test-script',
          '--package-version',
          '1.0.0',
          '--description',
          'Test script deployment',
          '--package-dir',
          testDir,
          '--target-org',
          'test@example.com',
        ]);
        expect.fail('Should have thrown an error');
      } catch (error: unknown) {
        expect(error).to.be.instanceOf(Error);
        // The framework may wrap the thrown SfError as a cause on the command error.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const cause = (error as any).cause;
        if (cause) {
          expect(cause).to.be.instanceOf(SfError);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(cause.name).to.equal('DeployNetworkError');
        } else if (error instanceof SfError) {
          expect(error.name).to.equal('DeployNetworkError');
        }
      }
    });
  });

  describe('flag validation', () => {
    const baseFlags = [
      '--package-version',
      '1.0.0',
      '--description',
      'Test',
      '--package-dir',
      '',
      '--target-org',
      'test@example.com',
    ];

    it('should reject an empty --name value', async () => {
      try {
        await ScriptDeploy.run(['--name', '', ...baseFlags]);
        expect.fail('Should have thrown an error');
      } catch (error: unknown) {
        expect(error).to.be.instanceOf(Error);
      }
    });

    it('should reject --name longer than 64 characters', async () => {
      try {
        await ScriptDeploy.run(['--name', 'a'.repeat(65), ...baseFlags]);
        expect.fail('Should have thrown an error');
      } catch (error: unknown) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('InvalidFlagValue');
      }
    });

    it('should accept --name at the 64-character boundary', async () => {
      // parse() throws for >64 but must not throw for exactly 64
      try {
        await ScriptDeploy.run(['--name', 'a'.repeat(64), ...baseFlags]);
      } catch (error: unknown) {
        if (error instanceof SfError && (error as SfError).name === 'InvalidFlagValue') {
          expect.fail('Should not have thrown InvalidFlagValue for a 64-char name');
        }
        // Other errors (e.g. directory not found) are acceptable in this test
      }
    });

    it('should reject an empty --package-version value', async () => {
      try {
        await ScriptDeploy.run([
          '--name',
          'test',
          '--package-version',
          '',
          '--description',
          'Test',
          '--package-dir',
          testDir,
          '--target-org',
          'test@example.com',
        ]);
        expect.fail('Should have thrown an error');
      } catch (error: unknown) {
        expect(error).to.be.instanceOf(Error);
      }
    });

    it('should reject --package-version longer than 64 characters', async () => {
      try {
        await ScriptDeploy.run([
          '--name',
          'test',
          '--package-version',
          'a'.repeat(65),
          '--description',
          'Test',
          '--package-dir',
          testDir,
          '--target-org',
          'test@example.com',
        ]);
        expect.fail('Should have thrown an error');
      } catch (error: unknown) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('InvalidFlagValue');
      }
    });

    it('should accept --package-version at the 64-character boundary', async () => {
      try {
        await ScriptDeploy.run([
          '--name',
          'test',
          '--package-version',
          'a'.repeat(64),
          '--description',
          'Test',
          '--package-dir',
          testDir,
          '--target-org',
          'test@example.com',
        ]);
      } catch (error: unknown) {
        if (error instanceof SfError && (error as SfError).name === 'InvalidFlagValue') {
          expect.fail('Should not have thrown InvalidFlagValue for a 64-char package-version');
        }
      }
    });

    it('should reject an empty --description value', async () => {
      try {
        await ScriptDeploy.run([
          '--name',
          'test',
          '--package-version',
          '1.0.0',
          '--description',
          '',
          '--package-dir',
          testDir,
          '--target-org',
          'test@example.com',
        ]);
        expect.fail('Should have thrown an error');
      } catch (error: unknown) {
        expect(error).to.be.instanceOf(Error);
      }
    });

    it('should reject --description longer than 255 characters', async () => {
      try {
        await ScriptDeploy.run([
          '--name',
          'test',
          '--package-version',
          '1.0.0',
          '--description',
          'a'.repeat(256),
          '--package-dir',
          testDir,
          '--target-org',
          'test@example.com',
        ]);
        expect.fail('Should have thrown an error');
      } catch (error: unknown) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('InvalidFlagValue');
      }
    });

    it('should accept --description at the 255-character boundary', async () => {
      try {
        await ScriptDeploy.run([
          '--name',
          'test',
          '--package-version',
          '1.0.0',
          '--description',
          'a'.repeat(255),
          '--package-dir',
          testDir,
          '--target-org',
          'test@example.com',
        ]);
      } catch (error: unknown) {
        if (error instanceof SfError && (error as SfError).name === 'InvalidFlagValue') {
          expect.fail('Should not have thrown InvalidFlagValue for a 255-char description');
        }
      }
    });
  });
});
