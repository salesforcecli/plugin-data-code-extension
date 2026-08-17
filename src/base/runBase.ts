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
import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages, Org } from '@salesforce/core';
import { checkEnvironment } from '../utils/environmentChecker.js';
import { PythonRunner, splitDependencies } from '../utils/pythonRunner.js';
import { type SharedResultProps } from './types.js';

export type BaseRunFlags = {
  entrypoint: string;
  'target-org'?: Org;
  'test-with'?: string;
  'config-file'?: string;
  dependencies?: string;
};

export type RunResult = SharedResultProps & {
  targetOrg?: string;
  status?: string;
  output?: string;
};

// eslint-disable-next-line sf-plugin/command-summary, sf-plugin/command-example
export abstract class RunBase extends SfCommand<RunResult> {
  public static enableJsonFlag = false;

  public async run(): Promise<RunResult> {
    const { flags } = (await this.parse(this.constructor as typeof RunBase)) as unknown as { flags: BaseRunFlags };
    const codeType = this.getCodeType();
    const messages = this.getMessages();

    const entrypoint = flags.entrypoint;
    const targetOrg = flags['target-org'];
    const testWith = flags['test-with'];
    const configFile = flags['config-file'];
    const dependencies = splitDependencies(flags.dependencies);

    try {
      // `run` invokes the SDK library (datacustomcode.run.run_entrypoint) through
      // Python, so it needs Python + the salesforce-data-customcode package.
      const { pythonInfo, packageInfo } = await checkEnvironment(this.spinner, this.log.bind(this), messages);

      let orgUsername: string | undefined;

      if (targetOrg) {
        orgUsername = targetOrg.getUsername() ?? 'target org';
        this.spinner.start(messages.getMessage('info.authenticating', [orgUsername]));

        const connection = targetOrg.getConnection();
        await connection.refreshAuth();

        this.spinner.stop();
        this.log(messages.getMessage('info.authenticated', [orgUsername]));
      }

      // Stream the entrypoint's output live (no spinner, so it doesn't clobber the stream).
      this.log(messages.getMessage('info.runningPackage'));
      const executionResult = await PythonRunner.run({
        pythonCommand: pythonInfo.command,
        entrypoint,
        configFile,
        dependencies,
        testFile: testWith,
        sfCliOrg: orgUsername,
        onStdout: (chunk) => process.stdout.write(chunk),
        onStderr: (chunk) => process.stderr.write(chunk),
      });

      this.log(messages.getMessage('info.runComplete', [entrypoint]));
      this.log(messages.getMessage('info.runSuccess'));

      return {
        success: true,
        pythonVersion: pythonInfo,
        packageInfo,
        codeType,
        packageDir: entrypoint,
        targetOrg: orgUsername,
        status: 'Success',
        output: executionResult.stdout,
        message: messages.getMessage('info.runSuccess'),
      };
    } catch (error) {
      this.spinner.stop();
      throw error;
    }
  }

  protected abstract getCodeType(): 'script' | 'function';
  protected abstract getMessages(): Messages<string>;
}
