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
import { Messages } from '@salesforce/core';
import { DatacodeBinaryExecutor, type DatacodeInitExecutionResult } from '../utils/datacodeBinaryExecutor.js';
import { checkEnvironment } from '../utils/environmentChecker.js';
import { sharedBaseFlags, type SharedResultProps } from './types.js';

export type BaseInitFlags = {
  'package-dir': string;
};

export type InitResult = SharedResultProps & {
  executionResult?: DatacodeInitExecutionResult;
};

// eslint-disable-next-line sf-plugin/command-summary, sf-plugin/command-example
export abstract class InitBase extends SfCommand<InitResult> {
  // Override baseFlags to hide global flags
  public static readonly baseFlags = sharedBaseFlags;

  public async run(): Promise<InitResult> {
    const { flags } = (await this.parse(this.constructor as typeof InitBase)) as unknown as { flags: BaseInitFlags };
    const codeType = this.getCodeType();
    const messages = this.getMessages();
    const packageDir = flags['package-dir'];

    try {
      const { pythonInfo, packageInfo, binaryInfo } = await checkEnvironment(
        this.spinner,
        this.log.bind(this),
        messages
      );

      this.spinner.start(messages.getMessage('info.executingInit'));
      const executionResult = await DatacodeBinaryExecutor.executeBinaryInit(codeType, packageDir);

      this.spinner.stop();
      this.log(messages.getMessage('info.initExecuted', [packageDir]));

      if (executionResult.filesCreated && executionResult.filesCreated.length > 0) {
        executionResult.filesCreated.forEach((file) => {
          this.log(messages.getMessage('info.fileCreated', [file]));
        });
      }

      return {
        success: true,
        pythonVersion: pythonInfo,
        packageInfo,
        binaryInfo,
        codeType,
        packageDir,
        executionResult,
        message: messages.getMessage('info.initCompleted'),
      };
    } catch (error) {
      this.spinner.stop();

      // The error will be properly handled by the Salesforce CLI framework
      // as an SfError with actions, so we just throw it
      throw error;
    }
  }

  protected abstract getCodeType(): 'script' | 'function';
  protected abstract getMessages(): Messages<string>;
}
