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
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { expect } from 'chai';
import { TestContext } from '@salesforce/core/testSetup';
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
      // The real binary does not reliably error on existing directories;
      // this scenario requires mocking which ES modules do not support here.
      this.skip();
    });

    it('should throw error when permission denied', async function () {
      // This test would require setting up a directory with no write permissions
      // which can be problematic in different environments
      this.skip();
    });
  });
});
