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
import { existsSync } from 'node:fs';
import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages, SfError } from '@salesforce/core';
import { zipWithSfError, type ZipResult as ZipBuilderResult } from '../utils/zipBuilder.js';

export type BaseZipFlags = {
  'package-dir': string;
  network?: string;
};

export type ZipResult = {
  success: boolean;
  codeType: 'script' | 'function';
  packageDir: string;
  archivePath: string;
  fileCount: number;
  archiveSizeBytes: number;
  message: string;
};

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

export abstract class ZipBase extends SfCommand<ZipResult> {
  public static enableJsonFlag = false;

  public async run(): Promise<ZipResult> {
    const { flags } = (await this.parse(this.constructor as typeof ZipBase)) as unknown as { flags: BaseZipFlags };
    const codeType = this.getCodeType();
    const messages = this.getMessages();
    const packageDir = flags['package-dir'];
    const network = flags.network ?? 'default';

    if (!existsSync(packageDir)) {
      throw new SfError(
        messages.getMessage('error.packageDirNotFound', [packageDir]),
        'PackageDirNotFound',
        messages.getMessages('actions.packageDirNotFound')
      );
    }

    try {
      this.spinner.start(messages.getMessage('info.executingZip'));
      const result: ZipBuilderResult = await zipWithSfError(packageDir, network, this.log.bind(this));
      this.spinner.stop();

      this.log(messages.getMessage('info.archiveCreated', [result.archivePath]));
      this.log(messages.getMessage('info.filesIncluded', [result.fileCount.toString()]));
      this.log(messages.getMessage('info.archiveSize', [formatBytes(result.archiveSizeBytes)]));

      return {
        success: true,
        codeType,
        packageDir,
        archivePath: result.archivePath,
        fileCount: result.fileCount,
        archiveSizeBytes: result.archiveSizeBytes,
        message: messages.getMessage('info.zipCompleted'),
      };
    } catch (error) {
      this.spinner.stop();
      throw error;
    }
  }

  protected abstract getCodeType(): 'script' | 'function';
  protected abstract getMessages(): Messages<string>;
}
