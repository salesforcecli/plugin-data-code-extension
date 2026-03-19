import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { DatacodeBinaryExecutor, type ScanResult } from '../utils/datacodeBinaryExecutor.js';
import { checkEnvironment } from '../utils/environmentChecker.js';
import { sharedBaseFlags } from './types.js';

export type BaseScanFlags = {
  entrypoint?: string;
  'config-file'?: string;
  'dry-run': boolean;
  'no-requirements': boolean;
};

// eslint-disable-next-line sf-plugin/command-summary, sf-plugin/command-example
export abstract class ScanBase extends SfCommand<ScanResult> {
  // Override baseFlags to hide global flags
  public static readonly baseFlags = sharedBaseFlags;

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
