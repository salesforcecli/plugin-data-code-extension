import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages, Org } from '@salesforce/core';
import { PythonChecker } from '../utils/pythonChecker.js';
import { PipChecker } from '../utils/pipChecker.js';
import { DatacodeBinaryChecker, type DatacodeDeployExecutionResult } from '../utils/datacodeBinaryChecker.js';

export type BaseDeployFlags = {
  name: string;
  version: string;
  description: string;
  'package-dir': string;
  'target-org': Org;
  'cpu-size': string;
  network?: string;
};

export type DeployResult = {
  success: boolean;
  pythonVersion: {
    version: string;
    command: string;
  };
  packageInfo?: {
    name: string;
    version: string;
  };
  binaryInfo?: {
    command: string;
    version: string;
  };
  codeType: 'script' | 'function';
  packageDir: string;
  targetOrg: string;
  deploymentId?: string;
  endpointUrl?: string;
  status?: string;
  message: string;
  executionResult?: DatacodeDeployExecutionResult;
};

// eslint-disable-next-line sf-plugin/command-summary, sf-plugin/command-example
export abstract class DeployBase<TFlags extends BaseDeployFlags = BaseDeployFlags> extends SfCommand<DeployResult> {
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

  public async run(): Promise<DeployResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    const { flags } = (await this.parse(this.constructor as any)) as unknown as { flags: TFlags };
    const codeType = this.getCodeType();
    const messages = this.getMessages();

    const name = flags.name;
    const version = flags.version;
    const description = flags.description;
    const packageDir = flags['package-dir'];
    const targetOrg = flags['target-org'];
    const cpuSize = flags['cpu-size'] || 'CPU_2XL';
    const network = flags.network;

    const additionalFlags = this.getAdditionalFlags(flags);

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

      this.spinner.start(messages.getMessage('info.deployingPackage'));
      const executionResult = await DatacodeBinaryChecker.executeBinaryDeploy(
        name,
        version,
        description,
        packageDir,
        orgUsername,
        cpuSize,
        network,
        additionalFlags.functionInvokeOpt as string | undefined
      );

      this.spinner.stop();
      this.log(messages.getMessage('info.deploymentComplete', [name, version]));

      if (executionResult.stdout) {
        this.log(executionResult.stdout);
      }

      if (executionResult.stderr) {
        this.warn(executionResult.stderr);
      }

      this.log(messages.getMessage('info.deploySuccess'));

      return {
        success: true,
        pythonVersion: pythonInfo,
        packageInfo,
        binaryInfo,
        codeType,
        packageDir,
        targetOrg: orgUsername,
        deploymentId: executionResult.deploymentId,
        endpointUrl: executionResult.endpointUrl,
        status: executionResult.status,
        executionResult,
        message: messages.getMessage('info.deploySuccess'),
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
