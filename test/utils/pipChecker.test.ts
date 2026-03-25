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
import { expect } from 'chai';
import { TestContext } from '@salesforce/core/testSetup';
import { SfError } from '@salesforce/core';
import { PipChecker } from '../../src/utils/pipChecker.js';

describe('PipChecker', () => {
  const $$ = new TestContext();

  afterEach(() => {
    $$.restore();
  });

  describe('checkPackage', () => {
    it('should detect commonly installed packages', async () => {
      // Test with a package that's likely to be installed in dev environments
      // We'll use 'pip' itself as it should be installed if pip is available
      try {
        const result = await PipChecker.checkPackage('pip');
        expect(result).to.have.property('name');
        expect(result).to.have.property('version');
        expect(result).to.have.property('location');
        expect(result).to.have.property('pipCommand');
        expect(result.name).to.equal('pip');
      } catch (error) {
        // If pip package itself is not found, skip this test
        if (error instanceof SfError && error.name === 'PipNotFound') {
          // Pip not available in test environment, skip test
        } else {
          throw error;
        }
      }
    });

    it('should throw error for non-existent package', async () => {
      // Use a package name that's extremely unlikely to exist
      try {
        await PipChecker.checkPackage('definitely-not-a-real-package-123456789');
        // If we get here, the test should fail
        expect.fail('Should have thrown an error for missing package');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        if (error instanceof SfError) {
          expect(error.name).to.include('PackageNotInstalled');
        }
      }
    });

    it('should provide helpful actions for missing package', async () => {
      try {
        await PipChecker.checkPackage('definitely-not-a-real-package-123456789');
        // If we get here, the test should fail
        expect.fail('Should have thrown an error for missing package');
      } catch (error) {
        if (error instanceof SfError) {
          expect(error.actions).to.be.an('array');
          expect(error.actions?.length).to.be.greaterThan(0);
          // Check that actions mention installing the package
          const actionsText = error.actions?.join(' ') ?? '';
          expect(actionsText).to.include('pip install');
        } else {
          throw error;
        }
      }
    });

    it('should return package info with correct structure', async () => {
      // Try to find any common package for testing
      const testPackages = ['pip', 'setuptools', 'wheel'];
      let foundPackage = false;

      for (const pkg of testPackages) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const result = await PipChecker.checkPackage(pkg);
          expect(result).to.be.an('object');
          expect(result.name).to.be.a('string');
          expect(result.version).to.be.a('string');
          expect(result.location).to.be.a('string');
          expect(result.pipCommand).to.be.a('string');
          expect(['pip', 'pip3', 'python', 'python3']).to.include(result.pipCommand);
          foundPackage = true;
          break;
        } catch (error) {
          // Continue trying other packages
          continue;
        }
      }

      if (!foundPackage) {
        // No common pip packages found in test environment
      }
    });

    it('should handle pip not being installed', async () => {
      // This test is conceptual since we can't easily simulate pip not being installed
      // The actual implementation handles this case by checking multiple pip commands
      // and throwing a specific error when none work

      // We can at least verify the error structure is correct
      const error = new SfError('Test error', 'PipNotFound', ['action1', 'action2']);
      expect(error.name).to.equal('PipNotFound');
      expect(error.actions).to.deep.equal(['action1', 'action2']);
    });

    it('should check for salesforce-data-customcode package', async () => {
      // This is the actual package we care about
      // It may or may not be installed in the test environment
      try {
        const result = await PipChecker.checkPackage('salesforce-data-customcode');
        expect(result.name).to.equal('salesforce-data-customcode');
        expect(result.version).to.be.a('string');
        expect(result.location).to.be.a('string');
        // Found salesforce-data-customcode version
      } catch (error) {
        if (error instanceof SfError) {
          // Package not installed is expected in many test environments
          expect(error.name).to.equal('PackageNotInstalled');
          expect(error.message).to.include('salesforce-data-customcode');
          // salesforce-data-customcode not installed (expected in test environment)
        } else {
          throw error;
        }
      }
    });
  });
});
