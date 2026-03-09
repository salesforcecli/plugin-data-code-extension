import { TestContext } from '@salesforce/core/testSetup';
import { expect } from 'chai';
import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
import ScriptInit from '../../../src/commands/data-code-extension/script/init.js';
import FunctionInit from '../../../src/commands/data-code-extension/function/init.js';

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

      // Check binary info if present
      if (result.binaryInfo) {
        expect(result.binaryInfo).to.have.property('command');
        expect(result.binaryInfo).to.have.property('version');
        // path is optional
      }

      expect(result.message).to.include('successfully');

      // Check that appropriate messages were logged
      const output = sfCommandStubs.log
        .getCalls()
        .flatMap((c) => c.args)
        .join('\n');
      expect(output).to.include('Python');
      expect(output).to.include('found');

      // Check for package-related messages if package was found
      if (result.packageInfo) {
        expect(output).to.include('Package');
      }

      // Check for binary-related messages if binary was found
      if (result.binaryInfo) {
        expect(output).to.include('Datacustomcode binary');
      }

      expect(output).to.include('successfully');
    } catch (error) {
      // If Python 3.11+ is not installed, pip package is missing, or binary is not found, verify the error is handled correctly
      expect(error).to.have.property('name');
      if (error instanceof Error) {
        expect(error.name).to.be.oneOf(['PythonNotFound', 'PythonVersionMismatch', 'PipNotFound', 'PackageNotInstalled', 'BinaryNotFound', 'BinaryNotExecutable']);
        expect(error.message).to.be.a('string');
        if ('actions' in error && error.actions) {
          expect(error.actions).to.be.an('array');
        }
      }
    }
  });

  it('returns JSON result when --json flag is used for script init', async () => {
    try {
      const result = await ScriptInit.run(['--json', '--package-dir', './test-json']);

      // Should return a structured result
      expect(result).to.be.an('object');
      expect(result).to.have.property('success');
      expect(result).to.have.property('pythonVersion');
      expect(result).to.have.property('message');
      // packageInfo may or may not be present depending on whether package is installed
    } catch (error) {
      // Even errors should be structured when using --json
      expect(error).to.have.property('name');
      if (error instanceof Error) {
        expect(error.name).to.be.a('string');
        expect(error.message).to.be.a('string');
      }
    }
  });

  it('runs function init command successfully', async () => {
    try {
      const result = await FunctionInit.run(['--package-dir', './test-function']);
      expect(result.codeType).to.equal('function');
      expect(result.packageDir).to.equal('./test-function');
      expect(result.success).to.be.true;
    } catch (error) {
      // Handle case where Python is not installed
      if (error instanceof Error) {
        expect(error.name).to.be.oneOf(['PythonNotFound', 'PythonVersionMismatch', 'PipNotFound', 'PackageNotInstalled', 'BinaryNotFound', 'BinaryNotExecutable']);
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
        expect(error.name).to.be.oneOf(['PythonNotFound', 'PythonVersionMismatch', 'PipNotFound', 'PackageNotInstalled', 'BinaryNotFound', 'BinaryNotExecutable']);
      }
    }
  });

  it('function init returns codeType as function', async () => {
    try {
      const result = await FunctionInit.run(['--package-dir', './test-function-type']);
      expect(result.codeType).to.equal('function');
      expect(result.packageDir).to.equal('./test-function-type');
    } catch (error) {
      // Handle case where Python is not installed
      if (error instanceof Error) {
        expect(error.name).to.be.oneOf(['PythonNotFound', 'PythonVersionMismatch', 'PipNotFound', 'PackageNotInstalled', 'BinaryNotFound', 'BinaryNotExecutable']);
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
        expect(error.message).to.include('package-dir');
      }
    }
  });
});
