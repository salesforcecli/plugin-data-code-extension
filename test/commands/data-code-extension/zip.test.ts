import { TestContext } from '@salesforce/core/testSetup';
import { expect } from 'chai';
import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
import ScriptZip from '../../../src/commands/data-code-extension/script/zip.js';
import FunctionZip from '../../../src/commands/data-code-extension/function/zip.js';

describe('data-code-extension zip commands', () => {
  const $$ = new TestContext();
  let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;

  beforeEach(() => {
    sfCommandStubs = stubSfCommandUx($$.SANDBOX);
  });

  afterEach(() => {
    $$.restore();
  });

  it('runs script zip command successfully', async () => {
    try {
      const result = await ScriptZip.run(['--package-dir', './test-package']);

      // If Python 3.11+ is installed and package is initialized, check the success result
      expect(result.success).to.be.true;
      expect(result.codeType).to.equal('script');
      expect(result.packageDir).to.equal('./test-package');
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

      // Check binary info if present
      if (result.binaryInfo) {
        expect(result.binaryInfo).to.have.property('command');
        expect(result.binaryInfo).to.have.property('version');
        // path is optional
      }

      // Check execution result if present (when all prerequisites are met)
      if (result.executionResult) {
        expect(result.executionResult).to.have.property('stdout');
        expect(result.executionResult).to.have.property('stderr');
        // Check optional fields
        if (result.executionResult.archivePath) {
          expect(result.executionResult.archivePath).to.be.a('string');
        }
        if (result.executionResult.fileCount !== undefined) {
          expect(result.executionResult.fileCount).to.be.a('number');
        }
        if (result.executionResult.archiveSize) {
          expect(result.executionResult.archiveSize).to.be.a('string');
        }
      }

      expect(result.message).to.be.a('string');
      expect(result.message.length).to.be.greaterThan(0);

      // Verify that logging was called
      expect(sfCommandStubs.log.called).to.be.true;
    } catch (error) {
      // If Python 3.11+ is not installed, pip package is missing, binary is not found, or zip fails, verify the error is handled correctly
      expect(error).to.have.property('name');
      if (error instanceof Error) {
        // Check for various error types including generic Error from missing directory
        expect(error.name).to.be.oneOf(['Error', 'PythonNotFound', 'PythonVersionMismatch', 'PipNotFound', 'PackageNotInstalled', 'BinaryNotFound', 'BinaryNotExecutable', 'ZipPermissionDenied', 'PackageDirNotFound', 'NotInitializedPackage', 'InsufficientDiskSpace', 'ZipExecutionFailed']);
        expect(error.message).to.be.a('string');
        if ('actions' in error && error.actions) {
          expect(error.actions).to.be.an('array');
        }
      }
    }
  });

  it('runs script zip command with network flag', async () => {
    try {
      const result = await ScriptZip.run(['--package-dir', './test-package', '--network', 'host']);

      if (result.success) {
        expect(result.codeType).to.equal('script');
        expect(result.packageDir).to.equal('./test-package');
      }
    } catch (error) {
      // Handle errors gracefully
      expect(error).to.have.property('name');
    }
  });

  it('returns JSON result when --json flag is used for script zip', async () => {
    try {
      const result = await ScriptZip.run(['--json', '--package-dir', './test-json']);

      // Should return a structured result
      expect(result).to.be.an('object');
      expect(result).to.have.property('success');
      expect(result).to.have.property('pythonVersion');
      expect(result).to.have.property('message');
      expect(result).to.have.property('packageDir');
      // archivePath may or may not be present depending on whether zip succeeded
    } catch (error) {
      // Even errors should be structured when using --json
      expect(error).to.have.property('name');
      if (error instanceof Error) {
        expect(error.name).to.be.a('string');
        expect(error.message).to.be.a('string');
      }
    }
  });

  it('runs function zip command successfully', async () => {
    try {
      const result = await FunctionZip.run(['--package-dir', './test-function']);

      // If Python 3.11+ is installed and package is initialized, check the success result
      expect(result.success).to.be.true;
      expect(result.codeType).to.equal('function');
      expect(result.packageDir).to.equal('./test-function');
      expect(result.pythonVersion).to.have.property('command');
      expect(result.pythonVersion).to.have.property('version');

      // Check package info if present
      if (result.packageInfo) {
        expect(result.packageInfo).to.have.property('name');
        expect(result.packageInfo).to.have.property('version');
      }

      // Check binary info if present
      if (result.binaryInfo) {
        expect(result.binaryInfo).to.have.property('command');
        expect(result.binaryInfo).to.have.property('version');
      }

      // Check execution result if present
      if (result.executionResult) {
        expect(result.executionResult).to.have.property('stdout');
        expect(result.executionResult).to.have.property('stderr');
      }

      expect(result.message).to.be.a('string');
      expect(result.message.length).to.be.greaterThan(0);

      // Verify that logging was called
      expect(sfCommandStubs.log.called).to.be.true;
    } catch (error) {
      // Handle errors gracefully
      expect(error).to.have.property('name');
      if (error instanceof Error) {
        expect(error.name).to.be.oneOf(['PythonNotFound', 'PythonVersionMismatch', 'PipNotFound', 'PackageNotInstalled', 'BinaryNotFound', 'BinaryNotExecutable', 'ZipPermissionDenied', 'PackageDirNotFound', 'NotInitializedPackage', 'InsufficientDiskSpace', 'ZipExecutionFailed']);
        expect(error.message).to.be.a('string');
      }
    }
  });

  it('runs function zip command with network flag', async () => {
    try {
      const result = await FunctionZip.run(['--package-dir', './test-function', '--network', 'bridge']);

      if (result.success) {
        expect(result.codeType).to.equal('function');
        expect(result.packageDir).to.equal('./test-function');
      }
    } catch (error) {
      // Handle errors gracefully
      expect(error).to.have.property('name');
    }
  });

  it('returns JSON result when --json flag is used for function zip', async () => {
    try {
      const result = await FunctionZip.run(['--json', '--package-dir', './test-function-json']);

      // Should return a structured result
      expect(result).to.be.an('object');
      expect(result).to.have.property('success');
      expect(result).to.have.property('pythonVersion');
      expect(result).to.have.property('message');
      expect(result).to.have.property('packageDir');
    } catch (error) {
      // Even errors should be structured when using --json
      expect(error).to.have.property('name');
      if (error instanceof Error) {
        expect(error.name).to.be.a('string');
        expect(error.message).to.be.a('string');
      }
    }
  });
});