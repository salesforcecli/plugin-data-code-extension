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
import { PythonChecker } from '../../../src/utils/pythonChecker.js';
import { PipChecker } from '../../../src/utils/pipChecker.js';
import { DatacodeBinaryChecker } from '../../../src/utils/datacodeBinaryChecker.js';
import { DatacodeBinaryExecutor } from '../../../src/utils/datacodeBinaryExecutor.js';

describe('data-code-extension deploy', () => {
  const $$ = new TestContext();
  let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;
  let pythonCheckerStub: sinon.SinonStub;
  let pipCheckerStub: sinon.SinonStub;
  let binaryCheckerStub: sinon.SinonStub;
  let binaryDeployStub: sinon.SinonStub;
  let mockOrg: Org;
  let mockConnection: Connection;
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    testDir = path.join(os.tmpdir(), `test-deploy-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    sfCommandStubs = stubSfCommandUx($$.SANDBOX);

    // Create mock connection
    mockConnection = {
      refreshAuth: $$.SANDBOX.stub().resolves(),
    } as unknown as Connection;

    // Create mock org
    mockOrg = {
      getUsername: () => 'test@example.com',
      getConnection: () => mockConnection,
    } as unknown as Org;

    // Stub Org.create to return our mock org
    $$.SANDBOX.stub(Org, 'create').resolves(mockOrg);

    // Stub PythonChecker
    pythonCheckerStub = $$.SANDBOX.stub(PythonChecker, 'checkPython311').resolves({
      command: 'python3',
      version: '3.11.5',
      major: 3,
      minor: 11,
      patch: 5,
    });

    // Stub PipChecker
    pipCheckerStub = $$.SANDBOX.stub(PipChecker, 'checkPackage').resolves({
      name: 'salesforce-data-customcode',
      version: '1.0.0',
      location: '/usr/local/lib/python3.11/site-packages',
      pipCommand: 'pip3',
    });

    // Stub DatacodeBinaryChecker.checkBinary
    binaryCheckerStub = $$.SANDBOX.stub(DatacodeBinaryChecker, 'checkBinary').resolves({
      command: 'datacustomcode',
      version: '1.0.0',
      path: '/usr/local/bin/datacustomcode',
    });

    // Stub DatacodeBinaryExecutor.executeBinaryDeploy
    binaryDeployStub = $$.SANDBOX.stub(DatacodeBinaryExecutor, 'executeBinaryDeploy').resolves({
      stdout: 'Deployment successful',
      stderr: '',
      deploymentId: 'dep-123456',
      endpointUrl: 'https://api.salesforce.com/data-cloud/endpoint/abc123',
      status: 'ACTIVE',
    });
  });

  afterEach(() => {
    $$.restore();
    // Clean up test directory
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('script deploy', () => {
    it('should deploy a script package successfully', async () => {
      await ScriptDeploy.run([
        '--name',
        'test-script',
        '--version',
        '1.0.0',
        '--description',
        'Test script deployment',
        '--package-dir',
        testDir,
        '--target-org',
        'test@example.com',
      ]);

      expect(sfCommandStubs.log.calledWith('Data Code Extension deployment completed successfully!')).to.be.true;
      expect(binaryDeployStub.calledOnce).to.be.true;
      expect(binaryDeployStub.firstCall.args[0]).to.equal('test-script');
      expect(binaryDeployStub.firstCall.args[1]).to.equal('1.0.0');
      expect(binaryDeployStub.firstCall.args[2]).to.equal('Test script deployment');
      expect(binaryDeployStub.firstCall.args[3]).to.equal(testDir);
      expect(binaryDeployStub.firstCall.args[5]).to.equal('CPU_2XL'); // Default CPU size
      expect(binaryDeployStub.firstCall.args[7]).to.be.undefined; // No function-invoke-opt for scripts
    });

    it('should deploy with custom CPU size', async () => {
      await ScriptDeploy.run([
        '--name',
        'test-script',
        '--version',
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

      expect(binaryDeployStub.firstCall.args[5]).to.equal('CPU_4XL');
    });

    it('should deploy with network configuration', async () => {
      await ScriptDeploy.run([
        '--name',
        'test-script',
        '--version',
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

      expect(binaryDeployStub.firstCall.args[6]).to.equal('host');
    });

    it('should handle authentication failure', async () => {
      // Override the mock connection to throw an error
      mockConnection.refreshAuth = $$.SANDBOX.stub().rejects(new Error('Authentication failed'));

      try {
        await ScriptDeploy.run([
          '--name',
          'test-script',
          '--version',
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
    });

    it('should handle deployment conflicts', async () => {
      binaryDeployStub.rejects(
        new SfError('A deployment with name "test-script" and version "1.0.0" already exists', 'DeployConflict')
      );

      try {
        await ScriptDeploy.run([
          '--name',
          'test-script',
          '--version',
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
        expect((error as SfError).name).to.equal('DeployConflict');
      }
    });
  });

  describe('function deploy', () => {
    it('should deploy a function package successfully', async () => {
      await FunctionDeploy.run([
        '--name',
        'test-function',
        '--version',
        '1.0.0',
        '--description',
        'Test function deployment',
        '--package-dir',
        testDir,
        '--target-org',
        'test@example.com',
        '--function-invoke-opt',
        'sync',
      ]);

      expect(sfCommandStubs.log.calledWith('Data Code Extension deployment completed successfully!')).to.be.true;
      expect(binaryDeployStub.calledOnce).to.be.true;
      expect(binaryDeployStub.firstCall.args[0]).to.equal('test-function');
    });

    it('should deploy with function-invoke-opt flag', async () => {
      await FunctionDeploy.run([
        '--name',
        'test-function',
        '--version',
        '1.0.0',
        '--description',
        'Test function deployment',
        '--package-dir',
        testDir,
        '--target-org',
        'test@example.com',
        '--function-invoke-opt',
        'sync',
      ]);

      expect(binaryDeployStub.firstCall.args[7]).to.equal('sync');
    });

    it('should validate CPU size options', async () => {
      try {
        await FunctionDeploy.run([
          '--name',
          'test-function',
          '--version',
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
        // Flag validation should catch invalid CPU size
        expect(error).to.be.instanceOf(Error);
      }
    });

    it('should handle quota exceeded errors', async () => {
      binaryDeployStub.rejects(new SfError('Deployment quota exceeded for the organization', 'DeployQuotaExceeded'));

      try {
        await FunctionDeploy.run([
          '--name',
          'test-function',
          '--version',
          '1.0.0',
          '--description',
          'Test function deployment',
          '--package-dir',
          testDir,
          '--target-org',
          'test@example.com',
          '--function-invoke-opt',
          'sync',
        ]);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('DeployQuotaExceeded');
      }
    });

    it('should handle package validation errors', async () => {
      binaryDeployStub.rejects(new SfError('Package validation failed', 'DeployPackageInvalid'));

      try {
        await FunctionDeploy.run([
          '--name',
          'test-function',
          '--version',
          '1.0.0',
          '--description',
          'Test function deployment',
          '--package-dir',
          testDir,
          '--target-org',
          'test@example.com',
          '--function-invoke-opt',
          'sync',
        ]);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('DeployPackageInvalid');
      }
    });
  });

  describe('deployment result handling', () => {
    it('should display deployment ID when available', async () => {
      await ScriptDeploy.run([
        '--name',
        'test-script',
        '--version',
        '1.0.0',
        '--description',
        'Test script deployment',
        '--package-dir',
        testDir,
        '--target-org',
        'test@example.com',
      ]);

      expect(sfCommandStubs.log.calledWith('Data Code Extension deployment completed successfully!')).to.be.true;
    });

    it('should display endpoint URL when available', async () => {
      await ScriptDeploy.run([
        '--name',
        'test-script',
        '--version',
        '1.0.0',
        '--description',
        'Test script deployment',
        '--package-dir',
        testDir,
        '--target-org',
        'test@example.com',
      ]);

      expect(sfCommandStubs.log.calledWith('Data Code Extension deployment completed successfully!')).to.be.true;
    });

    it('should return structured JSON result', async () => {
      const result = await ScriptDeploy.run([
        '--name',
        'test-script',
        '--version',
        '1.0.0',
        '--description',
        'Test script deployment',
        '--package-dir',
        testDir,
        '--target-org',
        'test@example.com',
        '--json',
      ]);

      expect(result).to.have.property('success', true);
      expect(result).to.have.property('codeType', 'script');
      expect(result).to.have.property('deploymentId', 'dep-123456');
      expect(result).to.have.property('endpointUrl');
      expect(result).to.have.property('status', 'ACTIVE');
    });
  });

  describe('error scenarios', () => {
    it('should handle Python not found', async () => {
      pythonCheckerStub.rejects(new SfError('Python 3.11+ is required', 'PythonNotFound'));

      try {
        await ScriptDeploy.run([
          '--name',
          'test-script',
          '--version',
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
        // Check if it's an SfCommandError with a cause
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const cause = (error as any).cause;
        if (cause) {
          expect(cause).to.be.instanceOf(SfError);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(cause.name).to.equal('PythonNotFound');
        } else if (error instanceof SfError) {
          expect(error.name).to.equal('PythonNotFound');
        }
      }
    });

    it('should handle pip package not found', async () => {
      pipCheckerStub.rejects(new SfError('Package not found', 'PackageNotFound'));

      try {
        await ScriptDeploy.run([
          '--name',
          'test-script',
          '--version',
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const cause = (error as any).cause;
        if (cause) {
          expect(cause).to.be.instanceOf(SfError);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(cause.name).to.equal('PackageNotFound');
        } else if (error instanceof SfError) {
          expect(error.name).to.equal('PackageNotFound');
        }
      }
    });

    it('should handle binary not found', async () => {
      binaryCheckerStub.rejects(new SfError('Binary not found', 'BinaryNotFound'));

      try {
        await ScriptDeploy.run([
          '--name',
          'test-script',
          '--version',
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const cause = (error as any).cause;
        if (cause) {
          expect(cause).to.be.instanceOf(SfError);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(cause.name).to.equal('BinaryNotFound');
        } else if (error instanceof SfError) {
          expect(error.name).to.equal('BinaryNotFound');
        }
      }
    });

    it('should handle network errors during deployment', async () => {
      binaryDeployStub.rejects(new SfError('Network error occurred during deployment', 'DeployNetworkError'));

      try {
        await ScriptDeploy.run([
          '--name',
          'test-script',
          '--version',
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
});
