import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { PythonChecker } from '../utils/pythonChecker.js';
import { PipChecker } from '../utils/pipChecker.js';
import { DatacodeBinaryChecker, type DatacodeDeployExecutionResult } from '../utils/datacodeBinaryChecker.js';

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
export abstract class DeployBase extends SfCommand<DeployResult> {
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

  // Store parsed flags for use in getAdditionalFlags
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected parsedFlags: any;

  public async run(): Promise<DeployResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    const { flags } = await this.parse(this.constructor as any);
    const codeType = this.getCodeType();
    const messages = this.getMessages();

    // Store parsed flags for use in getAdditionalFlags
    this.parsedFlags = { flags };

    // Get flag values
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const name = flags['name'];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const version = flags['version'];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const description = flags['description'];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const packageDir = flags['package-dir'];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const targetOrg = flags['target-org'];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const cpuSize = flags['cpu-size'] || 'CPU_2XL';
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const network = flags['network'];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const profile = flags['profile'];

    // Get additional flags from subclass (for function-specific flags)
    const additionalFlags = this.getAdditionalFlags();

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

      // Get org connection for authentication
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      const connection = targetOrg.getConnection();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      await connection.refreshAuth();

      this.spinner.stop();
      this.log(messages.getMessage('info.authenticated', [orgUsername]));

      // Execute datacustomcode deploy
      this.spinner.start(messages.getMessage('info.deployingPackage'));
      const executionResult = await DatacodeBinaryChecker.executeBinaryDeploy(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        name,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        version,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        description,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        packageDir,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        orgUsername,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        cpuSize,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        network,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        additionalFlags.functionInvokeOpt as string | undefined,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        profile
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        packageDir,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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

  // Abstract methods that subclasses must implement
  protected abstract getCodeType(): 'script' | 'function';
  protected abstract getMessages(): Messages<string>;
  protected abstract getAdditionalFlags(): Record<string, unknown>;
}