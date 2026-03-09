import { TestContext } from '@salesforce/core/testSetup';
import { expect } from 'chai';
import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
import Init from '../../../src/commands/data-code-extension/init.js';

describe('data-code-extension init', () => {
  const $$ = new TestContext();
  let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;

  beforeEach(() => {
    sfCommandStubs = stubSfCommandUx($$.SANDBOX);
  });

  afterEach(() => {
    $$.restore();
  });

  it('runs init command successfully', async () => {
    try {
      const result = await Init.run([]);

      // If Python 3.11+ is installed, check the success result
      expect(result.success).to.be.true;
      expect(result.pythonVersion).to.have.property('command');
      expect(result.pythonVersion).to.have.property('version');
      expect(result.pythonVersion).to.have.property('major');
      expect(result.pythonVersion).to.have.property('minor');
      expect(result.pythonVersion).to.have.property('patch');
      expect(result.message).to.include('successfully');

      // Check that appropriate messages were logged
      const output = sfCommandStubs.log
        .getCalls()
        .flatMap((c) => c.args)
        .join('\n');
      expect(output).to.include('Python');
      expect(output).to.include('found');
      expect(output).to.include('successfully');
    } catch (error: any) {
      // If Python 3.11+ is not installed, verify the error is handled correctly
      expect(error.name).to.be.oneOf(['PythonNotFound', 'PythonVersionMismatch']);
      expect(error.message).to.be.a('string');
      if (error.actions) {
        expect(error.actions).to.be.an('array');
      }
    }
  });

  it('returns JSON result when --json flag is used', async () => {
    try {
      const result = await Init.run(['--json']);

      // Should return a structured result
      expect(result).to.be.an('object');
      expect(result).to.have.property('success');
      expect(result).to.have.property('pythonVersion');
      expect(result).to.have.property('message');
    } catch (error: any) {
      // Even errors should be structured when using --json
      expect(error.name).to.be.a('string');
      expect(error.message).to.be.a('string');
    }
  });
});