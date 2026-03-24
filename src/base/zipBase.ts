import { existsSync } from 'node:fs';
import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages, SfError } from '@salesforce/core';
import { DatacodeBinaryExecutor, type DatacodeZipExecutionResult } from '../utils/datacodeBinaryExecutor.js';
import { checkEnvironment } from '../utils/environmentChecker.js';
import { type SharedResultProps } from './types.js';

export type BaseZipFlags = {
  'package-dir': string;
  network?: string;
};

export type ZipResult = SharedResultProps & {
  archivePath?: string;
  executionResult?: DatacodeZipExecutionResult;
};

// eslint-disable-next-line sf-plugin/command-summary, sf-plugin/command-example
export abstract class ZipBase extends SfCommand<ZipResult> {
  public static enableJsonFlag = false;

  public async run(): Promise<ZipResult> {
    const { flags } = (await this.parse(this.constructor as typeof ZipBase)) as unknown as { flags: BaseZipFlags };
    const codeType = this.getCodeType();
    const messages = this.getMessages();
    const packageDir = flags['package-dir'];
    const network = flags.network;

    if (!existsSync(packageDir)) {
      throw new SfError(
        messages.getMessage('error.packageDirNotFound', [packageDir]),
        'PackageDirNotFound',
        messages.getMessages('actions.packageDirNotFound')
      );
    }

    try {
      const { pythonInfo, packageInfo, binaryInfo } = await checkEnvironment(
        this.spinner,
        this.log.bind(this),
        messages
      );

      this.spinner.start(messages.getMessage('info.executingZip'));
      const executionResult = await DatacodeBinaryExecutor.executeBinaryZip(packageDir, network);

      this.spinner.stop();

      if (executionResult.archivePath) {
        this.log(messages.getMessage('info.archiveCreated', [executionResult.archivePath]));
      }

      if (executionResult.fileCount !== undefined) {
        this.log(messages.getMessage('info.filesIncluded', [executionResult.fileCount.toString()]));
      }

      if (executionResult.archiveSize) {
        this.log(messages.getMessage('info.archiveSize', [executionResult.archiveSize]));
      }

      return {
        success: true,
        pythonVersion: pythonInfo,
        packageInfo,
        binaryInfo,
        codeType,
        packageDir,
        archivePath: executionResult.archivePath,
        executionResult,
        message: messages.getMessage('info.zipCompleted'),
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
