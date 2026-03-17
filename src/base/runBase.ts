import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages, Org } from '@salesforce/core';
import { PythonChecker, type PythonVersionInfo } from '../utils/pythonChecker.js';
import { PipChecker, type PipPackageInfo } from '../utils/pipChecker.js';
import {
  DatacodeBinaryChecker,
  type DatacodeBinaryInfo,
  type DatacodeRunExecutionResult,
} from '../utils/datacodeBinaryChecker.js';

export type BaseRunFlags = {
  entrypoint: string;
  'target-org': Org;
  'config-file'?: string;
  dependencies?: string;
};

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
    const { flags } = (await this.parse(this.constructor as any)) as unknown as { flags: BaseRunFlags };
    const codeType = this.getCodeType();
    const messages = this.getMessages();

    const packageDir = flags.entrypoint;
    const targetOrg = flags['target-org'];
    const configFile = flags['config-file'];
    const dependencies = flags.dependencies;

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

      const orgUsername = targetOrg.getUsername() ?? 'target org';
      this.spinner.start(messages.getMessage('info.authenticating', [orgUsername]));

      const connection = targetOrg.getConnection();
      await connection.refreshAuth();

      this.spinner.stop();
      this.log(messages.getMessage('info.authenticated', [orgUsername]));

      this.spinner.start(messages.getMessage('info.runningPackage'));
      const executionResult = await DatacodeBinaryChecker.executeBinaryRun(
        packageDir,
        orgUsername,
        configFile,
        dependencies
      );

      this.spinner.stop();
      this.log(messages.getMessage('info.runComplete', [packageDir]));

      if (executionResult.stdout) {
        this.log(executionResult.stdout);
      }

      if (executionResult.stderr) {
        this.warn(executionResult.stderr);
      }

      this.log(messages.getMessage('info.runSuccess'));

      return {
        success: true,
        pythonVersion: pythonInfo,
        packageInfo,
        binaryInfo,
        codeType,
        packageDir,
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

  protected abstract getCodeType(): 'script' | 'function';
  protected abstract getMessages(): Messages<string>;
}
