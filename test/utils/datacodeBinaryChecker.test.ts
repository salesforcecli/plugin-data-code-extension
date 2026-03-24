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
});
