import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { PythonChecker, type PythonVersionInfo } from '../../../utils/pythonChecker.js';
import { PipChecker, type PipPackageInfo } from '../../../utils/pipChecker.js';
import { DatacodeBinaryChecker, type DatacodeBinaryInfo, type DatacodeInitExecutionResult } from '../../../utils/datacodeBinaryChecker.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('data-code-extension', 'init.function');

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

export default class Init extends SfCommand<InitResult> {
  // Override baseFlags to hide global flags
  public static readonly baseFlags = {
    ...SfCommand.baseFlags,
    'flags-dir': Flags.directory({
      summary: 'Import flag values from a directory.',
      helpGroup: 'GLOBAL',
      hidden: true,  // Hide from help output
    }),
    // eslint-disable-next-line sf-plugin/no-json-flag
    json: Flags.boolean({
      summary: 'Format output as json.',
      helpGroup: 'GLOBAL',
      hidden: true,  // Hide from help output
    }),
  };

  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'package-dir': Flags.directory({
      char: 'p',
      summary: messages.getMessage('flags.packageDir.summary'),
      description: messages.getMessage('flags.packageDir.description'),
      required: true,
      exists: false,  // Allow non-existing directories (will be created)
    }),
  };

  public async run(): Promise<InitResult> {
    const { flags } = await this.parse(Init);
    const codeType = 'function' as const;
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
}
