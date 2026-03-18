import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { expect } from 'chai';
import { TestContext } from '@salesforce/core/testSetup';
import { SfError } from '@salesforce/core';
import { DatacodeBinaryExecutor } from '../../src/utils/datacodeBinaryExecutor.js';

const execAsync = promisify(exec);

describe('DatacodeBinaryExecutor', () => {
  const $$ = new TestContext();

  afterEach(() => {
    $$.restore();
  });

  describe('executeBinaryInit', () => {
    it('should successfully execute datacustomcode init for script type', async function () {
      // This test will only pass if datacustomcode is actually installed
      let isInstalled = false;
      try {
        await execAsync('datacustomcode version');
        isInstalled = true;
      } catch {
        isInstalled = false;
      }

      if (!isInstalled) {
        this.skip();
        return;
      }

      // Create a temporary test directory name
      const testDir = `/tmp/test-script-${Date.now()}`;

      try {
        const result = await DatacodeBinaryExecutor.executeBinaryInit('script', testDir);

        expect(result).to.have.property('stdout');
        expect(result).to.have.property('stderr');
        expect(result).to.have.property('projectPath', testDir);
        expect(result).to.have.property('filesCreated');
        expect(result.filesCreated).to.be.an('array');

        // Clean up the test directory
        await execAsync(`rm -rf ${testDir}`);
      } catch (error) {
        // Clean up even if test fails
        await execAsync(`rm -rf ${testDir}`).catch(() => {});
        throw error;
      }
    });

    it('should successfully execute datacustomcode init for function type', async function () {
      // This test will only pass if datacustomcode is actually installed
      let isInstalled = false;
      try {
        await execAsync('datacustomcode version');
        isInstalled = true;
      } catch {
        isInstalled = false;
      }

      if (!isInstalled) {
        this.skip();
        return;
      }

      // Create a temporary test directory name
      const testDir = `/tmp/test-function-${Date.now()}`;

      try {
        const result = await DatacodeBinaryExecutor.executeBinaryInit('function', testDir);

        expect(result).to.have.property('stdout');
        expect(result).to.have.property('stderr');
        expect(result).to.have.property('projectPath', testDir);
        expect(result).to.have.property('filesCreated');
        expect(result.filesCreated).to.be.an('array');

        // Clean up the test directory
        await execAsync(`rm -rf ${testDir}`);
      } catch (error) {
        // Clean up even if test fails
        await execAsync(`rm -rf ${testDir}`).catch(() => {});
        throw error;
      }
    });

    it('should throw error when directory already exists', async function () {
      // This test will only pass if datacustomcode is actually installed
      let isInstalled = false;
      try {
        await execAsync('datacustomcode version');
        isInstalled = true;
      } catch {
        isInstalled = false;
      }

      if (!isInstalled) {
        this.skip();
        return;
      }

      // Create a temporary test directory that already exists
      const testDir = `/tmp/test-exists-${Date.now()}`;
      await execAsync(`mkdir -p ${testDir} && echo "test" > ${testDir}/file.txt`);

      try {
        await DatacodeBinaryExecutor.executeBinaryInit('script', testDir);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceof(SfError);
        const sfError = error as SfError;
        // The error type depends on how datacustomcode handles existing directories
        expect(sfError.message).to.include(testDir);
      } finally {
        // Clean up the test directory
        await execAsync(`rm -rf ${testDir}`).catch(() => {});
      }
    });

    it('should throw error when permission denied', async function () {
      // This test would require setting up a directory with no write permissions
      // which can be problematic in different environments
      this.skip();
    });
  });
});
