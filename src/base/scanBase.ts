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
import { DatacodeBinaryExecutor, type ScanResult } from '../utils/datacodeBinaryExecutor.js';
import { checkEnvironment } from '../utils/environmentChecker.js';

export type BaseScanFlags = {
  entrypoint?: string;
  'config-file'?: string;
  'dry-run': boolean;
  'no-requirements': boolean;
};

// eslint-disable-next-line sf-plugin/command-summary, sf-plugin/command-example
export abstract class ScanBase extends SfCommand<ScanResult> {
  public static enableJsonFlag = false;

  public async run(): Promise<ScanResult> {
    const { flags } = (await this.parse(this.constructor as typeof ScanBase)) as unknown as { flags: BaseScanFlags };
    const codeType = this.getCodeType();
    const messages = this.getMessages();

    const config = flags.entrypoint;
    const configFile = flags['config-file'];
    const dryRun = flags['dry-run'];
    const noRequirements = flags['no-requirements'];

    const workingDir = process.cwd();

    try {
      const { pythonInfo, packageInfo, binaryInfo } = await checkEnvironment(
        this.spinner,
        this.log.bind(this),
        messages
      );

      this.spinner.start(messages.getMessage('info.executingScan'));
      const executionResult = await DatacodeBinaryExecutor.executeBinaryScan(
        workingDir,
        config,
        dryRun,
        noRequirements,
        configFile
      );

      this.spinner.stop();
      this.log(messages.getMessage('info.scanExecuted', [workingDir]));

      if (executionResult.stdout) {
        this.log(executionResult.stdout);
      }

      if (executionResult.stderr) {
        this.warn(executionResult.stderr);
      }

      if (dryRun) {
        this.log(messages.getMessage('info.dryRunNotice'));
      }

      return {
        success: true,
        pythonVersion: pythonInfo,
        packageInfo,
        binaryInfo,
        codeType,
        workingDirectory: workingDir,
        executionResult,
        message: messages.getMessage('info.scanCompleted'),
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
