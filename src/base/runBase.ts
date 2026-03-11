import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { PythonChecker, type PythonVersionInfo } from '../utils/pythonChecker.js';
import { PipChecker, type PipPackageInfo } from '../utils/pipChecker.js';
import { DatacodeBinaryChecker, type DatacodeBinaryInfo, type DatacodeRunExecutionResult } from '../utils/datacodeBinaryChecker.js';

export type RunResult = {
  success: boolean;
  pythonVersion: PythonVersionInfo;
  packageInfo?: PipPackageInfo;
  binaryInfo?: DatacodeBinaryInfo;
  codeType: 'script' | 'function';
  packageDir: string;
  targetOrg: string;
  status?: string;
  output?: string;
  message: string;
  executionResult?: DatacodeRunExecutionResult;
};

// eslint-disable-next-line sf-plugin/command-summary, sf-plugin/command-example
export abstract class RunBase extends SfCommand<RunResult> {
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

  public async run(): Promise<RunResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    const { flags } = await this.parse(this.constructor as any);
    const codeType = this.getCodeType();
    const messages = this.getMessages();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const packageDir = flags['package-dir'];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const targetOrg = flags['target-org'];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const configFile = flags['config-file'];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const dependencies = flags['dependencies'];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const profile = flags['profile'];

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

      // Authenticate with the target org
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      const orgUsername = targetOrg.getUsername() || 'target org';
      this.spinner.start(messages.getMessage('info.authenticating', [orgUsername]));

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      const connection = targetOrg.getConnection();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      await connection.refreshAuth();

      this.spinner.stop();
      this.log(messages.getMessage('info.authenticated', [orgUsername]));

      // Execute datacustomcode run
      this.spinner.start(messages.getMessage('info.runningPackage'));
      const executionResult = await DatacodeBinaryChecker.executeBinaryRun(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        packageDir,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        orgUsername,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        configFile,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        dependencies,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        profile
      );

      this.spinner.stop();
      this.log(messages.getMessage('info.runComplete', [packageDir]));

      if (executionResult.status) {
        this.log(messages.getMessage('info.runStatus', [executionResult.status]));
      }

      if (executionResult.output) {
        this.log(messages.getMessage('info.runOutput', [executionResult.output]));
      }

      this.log(messages.getMessage('info.runSuccess'));

      return {
        success: true,
        pythonVersion: pythonInfo,
        packageInfo,
        binaryInfo,
        codeType,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        packageDir,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        targetOrg: orgUsername,
        status: executionResult.status,
        output: executionResult.output,
        executionResult,
        message: messages.getMessage('info.runSuccess'),
      };
    } catch (error) {
      this.spinner.stop();
      throw error;
    }
  }

  // Abstract methods that subclasses must implement
  protected abstract getCodeType(): 'script' | 'function';
  protected abstract getMessages(): Messages<string>;
}
