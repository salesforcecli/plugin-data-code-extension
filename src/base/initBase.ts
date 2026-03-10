import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { PythonChecker, type PythonVersionInfo } from '../utils/pythonChecker.js';
import { PipChecker, type PipPackageInfo } from '../utils/pipChecker.js';
import { DatacodeBinaryChecker, type DatacodeBinaryInfo, type DatacodeInitExecutionResult } from '../utils/datacodeBinaryChecker.js';

export type InitResult = {
  success: boolean;
  pythonVersion: PythonVersionInfo;
  packageInfo?: PipPackageInfo;
  binaryInfo?: DatacodeBinaryInfo;
  codeType: 'script' | 'function';
  packageDir: string;
  message: string;
  executionResult?: DatacodeInitExecutionResult;
};

// eslint-disable-next-line sf-plugin/command-summary, sf-plugin/command-example
export abstract class InitBase extends SfCommand<InitResult> {
  // Override baseFlags to hide global flags
  public static readonly baseFlags = {
    ...SfCommand.baseFlags,
    // eslint-disable-next-line sf-plugin/no-hardcoded-messages-flags
    'flags-dir': Flags.directory({
      summary: 'Import flag values from a directory.',
      helpGroup: 'GLOBAL',
      hidden: false,  // Hide from help output
    }),
    // eslint-disable-next-line sf-plugin/no-json-flag, sf-plugin/no-hardcoded-messages-flags
    json: Flags.boolean({
      summary: 'Format output as json.',
      helpGroup: 'GLOBAL',
      hidden: true,  // Hide from help output
    }),
  };

  public async run(): Promise<InitResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    const { flags } = await this.parse(this.constructor as any);
    const codeType = this.getCodeType();
    const messages = this.getMessages();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const packageDir = flags['package-dir'];

    this.spinner.start(messages.getMessage('info.checkingPython'));

    try {
      // Check Python 3.11+ is installed
      const pythonInfo = await PythonChecker.checkPython311();

      this.spinner.stop();
      this.log(messages.getMessage('info.pythonFound', [pythonInfo.version, pythonInfo.command]));

      // Check required pip packages
      this.spinner.start(messages.getMessage('info.checkingPackages'));
      const packageInfo = await PipChecker.checkPackage('salesforce-data-customcode');

      this.spinner.stop();
      this.log(messages.getMessage('info.packageFound', [packageInfo.name, packageInfo.version]));

      // Check datacustomcode binary
      this.spinner.start(messages.getMessage('info.checkingBinary'));
      const binaryInfo = await DatacodeBinaryChecker.checkBinary();

      this.spinner.stop();
      this.log(messages.getMessage('info.binaryFound', [binaryInfo.version]));

      // Execute datacustomcode init
      this.spinner.start(messages.getMessage('info.executingInit'));
      const executionResult = await DatacodeBinaryChecker.executeBinaryInit(
        codeType,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        packageDir
      );

      this.spinner.stop();
      this.log(messages.getMessage('info.initExecuted', [packageDir]));

      // Log created files if available
      if (executionResult.filesCreated && executionResult.filesCreated.length > 0) {
        executionResult.filesCreated.forEach(file => {
          this.log(messages.getMessage('info.fileCreated', [file]));
        });
      }

      return {
        success: true,
        pythonVersion: pythonInfo,
        packageInfo,
        binaryInfo,
        codeType,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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

  // Abstract methods that subclasses must implement
  protected abstract getCodeType(): 'script' | 'function';
  protected abstract getMessages(): Messages<string>;
}