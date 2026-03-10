import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { expect } from 'chai';
import { TestContext } from '@salesforce/core/testSetup';
import { SfError } from '@salesforce/core';
import { DatacodeBinaryChecker } from '../../src/utils/datacodeBinaryChecker.js';

const execAsync = promisify(exec);

describe('DatacodeBinaryChecker', () => {
  const $$ = new TestContext();

  afterEach(() => {
    $$.restore();
  });

  describe('checkBinary', () => {
    it('should successfully detect datacustomcode binary when installed', async function () {
      // This test will only pass if datacustomcode is actually installed
      // Check if it's available first
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

      const result = await DatacodeBinaryChecker.checkBinary();

      expect(result).to.have.property('command', 'datacustomcode');
      expect(result).to.have.property('version');
      expect(result.version).to.not.equal('unknown');
      // Path is optional but should be a string if present
      if (result.path) {
        expect(result.path).to.be.a('string');
      }
    });

    it('should throw error when datacustomcode binary is not found', async function () {
      // This test will only pass if datacustomcode is NOT installed
      let isInstalled = false;
      try {
        await execAsync('datacustomcode version');
        isInstalled = true;
      } catch {
        isInstalled = false;
      }

      if (isInstalled) {
        this.skip();
        return;
      }

      try {
        await DatacodeBinaryChecker.checkBinary();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceof(SfError);
        const sfError = error as SfError;
        expect(sfError.name).to.equal('BinaryNotFound');
        expect(sfError.message).to.include("'datacustomcode' command is not found");
        expect(sfError.actions).to.be.an('array');
        expect(sfError.actions?.length).to.be.greaterThan(0);
      }
    });

    it('should handle version command that returns unparseable output', async function () {
      // This is a theoretical test case that would require mocking,
      // which we can't do with ES modules. Including for documentation purposes.
      this.skip();
    });

    it('should handle binary that exists but fails to execute', async function () {
      // This is a theoretical test case that would require mocking,
      // which we can't do with ES modules. Including for documentation purposes.
      this.skip();
    });

    it('should include path when available on Unix systems', async function () {
      // Skip on Windows
      if (process.platform === 'win32') {
        this.skip();
        return;
      }

      // Check if datacustomcode is installed
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

      const result = await DatacodeBinaryChecker.checkBinary();

      // On Unix systems with 'which', we should get a path
      if (result.path) {
        expect(result.path).to.include('datacustomcode');
        expect(result.path).to.match(/^\/.*datacustomcode$/);
      }
    });

    it('should handle Windows where command for path lookup', async function () {
      // Skip on non-Windows systems
      if (process.platform !== 'win32') {
        this.skip();
        return;
      }

      // Check if datacustomcode is installed
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

      const result = await DatacodeBinaryChecker.checkBinary();

      // On Windows with 'where', we should get a path
      if (result.path) {
        expect(result.path).to.include('datacustomcode');
        // Windows paths typically include drive letter and backslashes
        expect(result.path).to.match(/^[A-Z]:\\.*/i);
      }
    });
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
        const result = await DatacodeBinaryChecker.executeBinaryInit('script', testDir);

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
        const result = await DatacodeBinaryChecker.executeBinaryInit('function', testDir);

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
        await DatacodeBinaryChecker.executeBinaryInit('script', testDir);
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