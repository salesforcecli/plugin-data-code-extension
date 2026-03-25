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
import { TestContext } from '@salesforce/core/testSetup';
import { SfError } from '@salesforce/core';
import { expect } from 'chai';
import { PythonChecker } from '../../src/utils/pythonChecker.js';

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
  });
});
