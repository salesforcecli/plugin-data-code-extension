import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { PythonChecker } from '../utils/pythonChecker.js';
import { PipChecker } from '../utils/pipChecker.js';
import { DatacodeBinaryChecker, type ScanResult } from '../utils/datacodeBinaryChecker.js';

export type BaseScanFlags = {
  entrypoint?: string;
  'config-file'?: string;
  'dry-run': boolean;
  'no-requirements': boolean;
};

// eslint-disable-next-line sf-plugin/command-summary, sf-plugin/command-example
export abstract class ScanBase extends SfCommand<ScanResult> {
  // Override baseFlags to hide global flags
  public static readonly baseFlags = {
    ...SfCommand.baseFlags,
    // eslint-disable-next-line sf-plugin/no-hardcoded-messages-flags
    'flags-dir': Flags.directory({
      summary: 'Import flag values from a directory.',
      helpGroup: 'GLOBAL',
      hidden: false,
    }),
    // eslint-disable-next-line sf-plugin/no-json-flag, sf-plugin/no-hardcoded-messages-flags
    json: Flags.boolean({
      summary: 'Format output as json.',
      helpGroup: 'GLOBAL',
      hidden: true,
    }),
  };

  public async run(): Promise<ScanResult> {
    const { flags } = (await this.parse(this.constructor as typeof ScanBase)) as unknown as { flags: BaseScanFlags };
    const codeType = this.getCodeType();
    const messages = this.getMessages();

    const config = flags.entrypoint;
    const configFile = flags['config-file'];
    const dryRun = flags['dry-run'];
    const noRequirements = flags['no-requirements'];

    const workingDir = process.cwd();

    this.spinner.start(messages.getMessage('info.checkingPython'));

    try {
      const pythonInfo = await PythonChecker.checkPython311();

      this.spinner.stop();
      this.log(messages.getMessage('info.pythonFound', [pythonInfo.version, pythonInfo.command]));

      this.spinner.start(messages.getMessage('info.checkingPackages'));
      const packageInfo = await PipChecker.checkPackage('salesforce-data-customcode');

      this.spinner.stop();
      this.log(messages.getMessage('info.packageFound', [packageInfo.name, packageInfo.version]));

      this.spinner.start(messages.getMessage('info.checkingBinary'));
      const binaryInfo = await DatacodeBinaryChecker.checkBinary();

      this.spinner.stop();
      this.log(messages.getMessage('info.binaryFound', [binaryInfo.version]));

      this.spinner.start(messages.getMessage('info.executingScan'));
      const executionResult = await DatacodeBinaryChecker.executeBinaryScan(
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
