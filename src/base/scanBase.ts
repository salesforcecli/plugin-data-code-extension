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
import path from 'node:path';
import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { executeNativeScan, type NativeScanResult } from '../utils/nativeScan.js';
import { checkEnvironment, type EnvironmentCheckResult } from '../utils/environmentChecker.js';

export type BaseScanFlags = {
  entrypoint?: string;
  'config-file'?: string;
  'dry-run': boolean;
  'no-requirements': boolean;
};

export type ScanResult = {
  success: boolean;
  codeType: 'script' | 'function';
  workingDirectory: string;
  message: string;
  executionResult: NativeScanResult;
} & EnvironmentCheckResult;

// eslint-disable-next-line sf-plugin/command-summary, sf-plugin/command-example
export abstract class ScanBase extends SfCommand<ScanResult> {
  public static enableJsonFlag = false;

  public async run(): Promise<ScanResult> {
    const { flags } = (await this.parse(this.constructor as typeof ScanBase)) as unknown as { flags: BaseScanFlags };
    const codeType = this.getCodeType();
    const messages = this.getMessages();

    const workingDir = process.cwd();

    try {
      const { pythonInfo, packageInfo } = await checkEnvironment(this.spinner, this.log.bind(this), messages);

      this.spinner.start(messages.getMessage('info.executingScan'));
      const executionResult = await executeNativeScan({
        workingDir,
        entrypoint: flags.entrypoint,
        configFile: flags['config-file'],
        dryRun: flags['dry-run'],
        noRequirements: flags['no-requirements'],
        packageType: codeType,
      });
      this.spinner.stop();

      this.log(messages.getMessage('info.scanExecuted', [workingDir]));

      // Echo the resulting config — mirrors the Python CLI's behavior of printing the
      // scan output to stdout for the user to review.
      this.log(JSON.stringify(executionResult.config, null, 2));

      for (const file of executionResult.filesScanned) {
        this.log(messages.getMessage('info.fileScanned', [file]));
      }

      if (!executionResult.dryRun && executionResult.requirementsPath) {
        this.log(`Generated requirements file: ${path.relative(workingDir, executionResult.requirementsPath)}`);
      }

      if (executionResult.dryRun) {
        this.log(messages.getMessage('info.dryRunNotice'));
      }

      return {
        success: true,
        pythonInfo,
        packageInfo,
        codeType,
        workingDirectory: workingDir,
        executionResult,
        message: messages.getMessage('info.scanCompleted'),
      };
    } catch (error) {
      this.spinner.stop();
      throw error;
    }
  }

  protected abstract getCodeType(): 'script' | 'function';
  protected abstract getMessages(): Messages<string>;
}
