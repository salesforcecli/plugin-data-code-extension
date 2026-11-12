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
import * as path from 'node:path';
import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { executeNativeInit, type NativeInitResult } from '../utils/nativeInit.js';
import { checkEnvironment } from '../utils/environmentChecker.js';
import { PythonChecker } from '../utils/pythonChecker.js';
import { SCRIPT_USE_IN_FEATURE_STREAMING } from '../utils/constants.js';
import { type SharedResultProps } from './types.js';

export type BaseInitFlags = {
  'package-dir': string;
};

export type InitResult = SharedResultProps & {
  executionResult?: NativeInitResult;
};

export abstract class InitBase<TFlags extends BaseInitFlags = BaseInitFlags> extends SfCommand<InitResult> {
  public static enableJsonFlag = false;

  public async run(): Promise<InitResult> {
    const { flags } = (await this.parse(this.constructor as typeof InitBase)) as unknown as { flags: TFlags };
    const codeType = this.getCodeType();
    const messages = this.getMessages();
    const packageDir = flags['package-dir'];

    const additionalFlags = this.getAdditionalFlags(flags);

    try {
      const { pythonInfo, packageInfo } = await checkEnvironment(this.spinner, this.log.bind(this), messages);

      // `pip show` reports site-packages even for editable installs, whose code lives elsewhere,
      // so ask Python where the SDK really is and fall back to pip's location.
      const sdkDir = await PythonChecker.findPackageDir(pythonInfo.command, 'datacustomcode');

      this.spinner.start(messages.getMessage('info.executingInit'));
      const executionResult = await executeNativeInit({
        codeType,
        packageDir,
        pythonPackageLocation: sdkDir ? path.dirname(sdkDir) : packageInfo.location,
        pythonPackageVersion: packageInfo.version,
        useInFeature: additionalFlags.useInFeature as string | undefined,
      });

      this.spinner.stop();
      this.log(messages.getMessage('info.initExecuted', [packageDir]));

      executionResult.filesCreated.forEach((file) => {
        this.log(messages.getMessage('info.fileCreated', [file]));
      });

      // The streaming read source can't be scanned from the code, so the new config.json leaves it empty.
      if (codeType === 'script' && additionalFlags.useInFeature === SCRIPT_USE_IN_FEATURE_STREAMING) {
        this.warn(messages.getMessage('warning.streamingSourceNameEmpty', [executionResult.configPath]));
      }

      return {
        success: true,
        pythonVersion: pythonInfo,
        packageInfo,
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
  protected abstract getAdditionalFlags(flags: TFlags): Record<string, unknown>;
}
