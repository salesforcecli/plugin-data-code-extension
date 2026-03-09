import { TestContext } from '@salesforce/core/testSetup';
import { expect } from 'chai';
import { PythonChecker } from '../../src/utils/pythonChecker.js';
import { SfError } from '@salesforce/core';

describe('PythonChecker', () => {
  const $$ = new TestContext();

  afterEach(() => {
    $$.restore();
  });

  describe('checkPython311', () => {
    // Since we're using ES modules and can't easily stub child_process.exec,
    // we'll test the actual Python installation on the system
    it('should successfully check Python version on the system', async () => {
      try {
        const result = await PythonChecker.checkPython311();

        // Should have all required properties
        expect(result).to.have.property('command');
        expect(result).to.have.property('version');
        expect(result).to.have.property('major');
        expect(result).to.have.property('minor');
        expect(result).to.have.property('patch');

        // Command should be python3 or python
        expect(result.command).to.be.oneOf(['python3', 'python']);

        // Version should be 3.11 or higher
        expect(result.major).to.be.at.least(3);
        if (result.major === 3) {
          expect(result.minor).to.be.at.least(11);
        }

        // Version string should match the components
        expect(result.version).to.equal(`${result.major}.${result.minor}.${result.patch}`);
      } catch (error) {
        // If Python 3.11+ is not installed, that's okay for the test
        if (error instanceof SfError) {
          expect(error.name).to.be.oneOf(['PythonNotFound', 'PythonVersionMismatch']);
          if (error.actions) {
            expect(error.actions).to.be.an('array');
            expect(error.actions.length).to.be.greaterThan(0);
          }
        } else {
          throw error;
        }
      }
    });

    // Test the internal version checking logic by accessing the private method through reflection
    it('should correctly identify sufficient versions', () => {
      const checker = PythonChecker as any;

      // Test cases for version checking
      const testCases = [
        { version: { major: 3, minor: 11, patch: 0 }, expected: true },
        { version: { major: 3, minor: 11, patch: 5 }, expected: true },
        { version: { major: 3, minor: 12, patch: 0 }, expected: true },
        { version: { major: 4, minor: 0, patch: 0 }, expected: true },
        { version: { major: 3, minor: 10, patch: 9 }, expected: false },
        { version: { major: 2, minor: 7, patch: 18 }, expected: false },
      ];

      testCases.forEach(({ version, expected }) => {
        const result = checker.isVersionSufficient(version);
        expect(result).to.equal(expected,
          `Version ${version.major}.${version.minor}.${version.patch} should be ${expected ? 'accepted' : 'rejected'}`);
      });
    });
  });
});