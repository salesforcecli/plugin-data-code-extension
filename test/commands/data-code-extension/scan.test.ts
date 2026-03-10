import { TestContext } from '@salesforce/core/testSetup';
import { expect } from 'chai';
import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
import { SfError } from '@salesforce/core';
import { PythonChecker } from '../../../src/utils/pythonChecker.js';
import { PipChecker } from '../../../src/utils/pipChecker.js';
import { DatacodeBinaryChecker } from '../../../src/utils/datacodeBinaryChecker.js';
import ScriptScan from '../../../src/commands/data-code-extension/script/scan.js';
import FunctionScan from '../../../src/commands/data-code-extension/function/scan.js';

describe('data-code-extension scan commands', () => {
  const $$ = new TestContext();
  let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;

  beforeEach(() => {
    sfCommandStubs = stubSfCommandUx($$.SANDBOX);
  });

  afterEach(() => {
    $$.restore();
  });

  describe('script scan', () => {
    it('should run scan successfully with default config', async () => {
      // Mock the Python checker
      $$.SANDBOX.stub(PythonChecker, 'checkPython311').resolves({
        command: 'python3',
        version: '3.11.5',
        major: 3,
        minor: 11,
        patch: 5,
      });

      // Mock the pip checker
      $$.SANDBOX.stub(PipChecker, 'checkPackage').resolves({
        name: 'salesforce-data-customcode',
        version: '1.0.0',
        location: '/usr/local/lib/python3.11/site-packages',
        pipCommand: 'pip3',
      });

      // Mock the binary checker
      $$.SANDBOX.stub(DatacodeBinaryChecker, 'checkBinary').resolves({
        command: 'datacustomcode',
        version: '1.0.0',
        path: '/usr/local/bin/datacustomcode',
      });

      // Mock the scan execution
      $$.SANDBOX.stub(DatacodeBinaryChecker, 'executeBinaryScan').resolves({
        stdout: 'Scan completed successfully',
        stderr: '',
        workingDirectory: process.cwd(),
        permissions: ['READ_DATA', 'WRITE_DATA'],
        requirements: ['pandas', 'numpy'],
        filesScanned: ['main.py', 'utils.py'],
      });

      const result = await ScriptScan.run([]);

      expect(result.success).to.be.true;
      expect(result.codeType).to.equal('script');
      expect(result.workingDirectory).to.equal(process.cwd());
      expect(result.executionResult?.permissions).to.deep.equal(['READ_DATA', 'WRITE_DATA']);
      expect(result.executionResult?.requirements).to.deep.equal(['pandas', 'numpy']);
      expect(result.executionResult?.filesScanned).to.deep.equal(['main.py', 'utils.py']);

      // Verify that logging was called
      expect(sfCommandStubs.log.called).to.be.true;
    });

    it('should run scan with custom config path', async () => {
      // Mock the Python checker
      $$.SANDBOX.stub(PythonChecker, 'checkPython311').resolves({
        command: 'python3',
        version: '3.11.5',
        major: 3,
        minor: 11,
        patch: 5,
      });

      // Mock the pip checker
      $$.SANDBOX.stub(PipChecker, 'checkPackage').resolves({
        name: 'salesforce-data-customcode',
        version: '1.0.0',
        location: '/usr/local/lib/python3.11/site-packages',
        pipCommand: 'pip3',
      });

      // Mock the binary checker
      $$.SANDBOX.stub(DatacodeBinaryChecker, 'checkBinary').resolves({
        command: 'datacustomcode',
        version: '1.0.0',
        path: '/usr/local/bin/datacustomcode',
      });

      // Mock the scan execution
      const scanStub = $$.SANDBOX.stub(DatacodeBinaryChecker, 'executeBinaryScan').resolves({
        stdout: 'Scan completed successfully',
        stderr: '',
        workingDirectory: process.cwd(),
        permissions: ['READ_DATA'],
        requirements: ['pandas'],
        filesScanned: ['main.py'],
      });

      const result = await ScriptScan.run(['--config', 'custom/config.json']);

      expect(scanStub.calledWith(process.cwd(), 'custom/config.json', false, false)).to.be.true;
      expect(result.success).to.be.true;
    });

    it('should run dry run scan', async () => {
      // Mock the Python checker
      $$.SANDBOX.stub(PythonChecker, 'checkPython311').resolves({
        command: 'python3',
        version: '3.11.5',
        major: 3,
        minor: 11,
        patch: 5,
      });

      // Mock the pip checker
      $$.SANDBOX.stub(PipChecker, 'checkPackage').resolves({
        name: 'salesforce-data-customcode',
        version: '1.0.0',
        location: '/usr/local/lib/python3.11/site-packages',
        pipCommand: 'pip3',
      });

      // Mock the binary checker
      $$.SANDBOX.stub(DatacodeBinaryChecker, 'checkBinary').resolves({
        command: 'datacustomcode',
        version: '1.0.0',
        path: '/usr/local/bin/datacustomcode',
      });

      // Mock the scan execution
      const scanStub = $$.SANDBOX.stub(DatacodeBinaryChecker, 'executeBinaryScan').resolves({
        stdout: 'Dry run completed',
        stderr: '',
        workingDirectory: process.cwd(),
        permissions: ['READ_DATA'],
        requirements: ['pandas'],
        filesScanned: ['main.py'],
      });

      const result = await ScriptScan.run(['--dry-run']);

      expect(scanStub.calledWith(process.cwd(), undefined, true, false)).to.be.true;
      expect(result.success).to.be.true;
    });

    it('should run scan without requirements update', async () => {
      // Mock the Python checker
      $$.SANDBOX.stub(PythonChecker, 'checkPython311').resolves({
        command: 'python3',
        version: '3.11.5',
        major: 3,
        minor: 11,
        patch: 5,
      });

      // Mock the pip checker
      $$.SANDBOX.stub(PipChecker, 'checkPackage').resolves({
        name: 'salesforce-data-customcode',
        version: '1.0.0',
        location: '/usr/local/lib/python3.11/site-packages',
        pipCommand: 'pip3',
      });

      // Mock the binary checker
      $$.SANDBOX.stub(DatacodeBinaryChecker, 'checkBinary').resolves({
        command: 'datacustomcode',
        version: '1.0.0',
        path: '/usr/local/bin/datacustomcode',
      });

      // Mock the scan execution
      const scanStub = $$.SANDBOX.stub(DatacodeBinaryChecker, 'executeBinaryScan').resolves({
        stdout: 'Scan completed without requirements',
        stderr: '',
        workingDirectory: process.cwd(),
        permissions: ['READ_DATA'],
        filesScanned: ['main.py'],
      });

      const result = await ScriptScan.run(['--no-requirements']);

      expect(scanStub.calledWith(process.cwd(), undefined, false, true)).to.be.true;
      expect(result.success).to.be.true;
    });

    it('should handle combination of flags', async () => {
      // Mock the Python checker
      $$.SANDBOX.stub(PythonChecker, 'checkPython311').resolves({
        command: 'python3',
        version: '3.11.5',
        major: 3,
        minor: 11,
        patch: 5,
      });

      // Mock the pip checker
      $$.SANDBOX.stub(PipChecker, 'checkPackage').resolves({
        name: 'salesforce-data-customcode',
        version: '1.0.0',
        location: '/usr/local/lib/python3.11/site-packages',
        pipCommand: 'pip3',
      });

      // Mock the binary checker
      $$.SANDBOX.stub(DatacodeBinaryChecker, 'checkBinary').resolves({
        command: 'datacustomcode',
        version: '1.0.0',
        path: '/usr/local/bin/datacustomcode',
      });

      // Mock the scan execution
      const scanStub = $$.SANDBOX.stub(DatacodeBinaryChecker, 'executeBinaryScan').resolves({
        stdout: 'Dry run completed',
        stderr: '',
        workingDirectory: process.cwd(),
        permissions: ['READ_DATA'],
        filesScanned: ['main.py'],
      });

      const result = await ScriptScan.run(['--config', 'test.json', '--dry-run', '--no-requirements']);

      expect(scanStub.calledWith(process.cwd(), 'test.json', true, true)).to.be.true;
      expect(result.success).to.be.true;
    });

    it('should handle error when not in package directory', async () => {
      // Mock the Python checker
      $$.SANDBOX.stub(PythonChecker, 'checkPython311').resolves({
        command: 'python3',
        version: '3.11.5',
        major: 3,
        minor: 11,
        patch: 5,
      });

      // Mock the pip checker
      $$.SANDBOX.stub(PipChecker, 'checkPackage').resolves({
        name: 'salesforce-data-customcode',
        version: '1.0.0',
        location: '/usr/local/lib/python3.11/site-packages',
        pipCommand: 'pip3',
      });

      // Mock the binary checker
      $$.SANDBOX.stub(DatacodeBinaryChecker, 'checkBinary').resolves({
        command: 'datacustomcode',
        version: '1.0.0',
        path: '/usr/local/bin/datacustomcode',
      });

      // Mock the scan execution to throw error
      $$.SANDBOX.stub(DatacodeBinaryChecker, 'executeBinaryScan').rejects(
        new SfError('Current directory is not an initialized Data Code Extension package', 'NotInPackageDir')
      );

      try {
        await ScriptScan.run([]);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        if (error instanceof SfError) {
          expect(error.name).to.equal('NotInPackageDir');
        }
      }
    });

    it('should handle error when config file not found', async () => {
      // Mock the Python checker
      $$.SANDBOX.stub(PythonChecker, 'checkPython311').resolves({
        command: 'python3',
        version: '3.11.5',
        major: 3,
        minor: 11,
        patch: 5,
      });

      // Mock the pip checker
      $$.SANDBOX.stub(PipChecker, 'checkPackage').resolves({
        name: 'salesforce-data-customcode',
        version: '1.0.0',
        location: '/usr/local/lib/python3.11/site-packages',
        pipCommand: 'pip3',
      });

      // Mock the binary checker
      $$.SANDBOX.stub(DatacodeBinaryChecker, 'checkBinary').resolves({
        command: 'datacustomcode',
        version: '1.0.0',
        path: '/usr/local/bin/datacustomcode',
      });

      // Mock the scan execution to throw error
      $$.SANDBOX.stub(DatacodeBinaryChecker, 'executeBinaryScan').rejects(
        new SfError('Config file not found at custom/config.json', 'ConfigNotFound')
      );

      try {
        await ScriptScan.run(['--config', 'custom/config.json']);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        if (error instanceof SfError) {
          expect(error.name).to.equal('ConfigNotFound');
        }
      }
    });

    it('should output JSON format', async () => {
      // Mock the Python checker
      $$.SANDBOX.stub(PythonChecker, 'checkPython311').resolves({
        command: 'python3',
        version: '3.11.5',
        major: 3,
        minor: 11,
        patch: 5,
      });

      // Mock the pip checker
      $$.SANDBOX.stub(PipChecker, 'checkPackage').resolves({
        name: 'salesforce-data-customcode',
        version: '1.0.0',
        location: '/usr/local/lib/python3.11/site-packages',
        pipCommand: 'pip3',
      });

      // Mock the binary checker
      $$.SANDBOX.stub(DatacodeBinaryChecker, 'checkBinary').resolves({
        command: 'datacustomcode',
        version: '1.0.0',
        path: '/usr/local/bin/datacustomcode',
      });

      // Mock the scan execution
      $$.SANDBOX.stub(DatacodeBinaryChecker, 'executeBinaryScan').resolves({
        stdout: 'Scan completed successfully',
        stderr: '',
        workingDirectory: process.cwd(),
        permissions: ['READ_DATA'],
        requirements: ['pandas'],
        filesScanned: ['main.py'],
      });

      const result = await ScriptScan.run(['--json']);

      expect(result).to.be.an('object');
      expect(result.success).to.be.true;
      expect(result.codeType).to.equal('script');
      expect(result.workingDirectory).to.equal(process.cwd());
      expect(result.executionResult?.permissions).to.deep.equal(['READ_DATA']);
      expect(result.executionResult?.requirements).to.deep.equal(['pandas']);
    });
  });

  describe('function scan', () => {
    it('should run function scan successfully', async () => {
      // Mock the Python checker
      $$.SANDBOX.stub(PythonChecker, 'checkPython311').resolves({
        command: 'python3',
        version: '3.11.5',
        major: 3,
        minor: 11,
        patch: 5,
      });

      // Mock the pip checker
      $$.SANDBOX.stub(PipChecker, 'checkPackage').resolves({
        name: 'salesforce-data-customcode',
        version: '1.0.0',
        location: '/usr/local/lib/python3.11/site-packages',
        pipCommand: 'pip3',
      });

      // Mock the binary checker
      $$.SANDBOX.stub(DatacodeBinaryChecker, 'checkBinary').resolves({
        command: 'datacustomcode',
        version: '1.0.0',
        path: '/usr/local/bin/datacustomcode',
      });

      // Mock the scan execution
      $$.SANDBOX.stub(DatacodeBinaryChecker, 'executeBinaryScan').resolves({
        stdout: 'Scan completed successfully',
        stderr: '',
        workingDirectory: process.cwd(),
        permissions: ['READ_DATA'],
        requirements: ['pandas'],
        filesScanned: ['handler.py'],
      });

      const result = await FunctionScan.run([]);

      expect(result.success).to.be.true;
      expect(result.codeType).to.equal('function');
      expect(result.workingDirectory).to.equal(process.cwd());
      expect(result.executionResult?.permissions).to.deep.equal(['READ_DATA']);
      expect(result.executionResult?.requirements).to.deep.equal(['pandas']);
      expect(result.executionResult?.filesScanned).to.deep.equal(['handler.py']);

      // Verify that logging was called
      expect(sfCommandStubs.log.called).to.be.true;
    });
  });
});
