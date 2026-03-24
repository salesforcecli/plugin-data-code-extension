import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages, Org } from '@salesforce/core';
import { DatacodeBinaryExecutor, type DatacodeDeployExecutionResult } from '../utils/datacodeBinaryExecutor.js';
import { checkEnvironment } from '../utils/environmentChecker.js';
import { type SharedResultProps } from './types.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-data-code-extension', 'deploy');

export type BaseDeployFlags = {
  name: string;
  'package-version': string;
  description: string;
  'package-dir': string;
  'target-org': Org;
  'cpu-size': string;
  network?: string;
};

export type DeployResult = SharedResultProps & {
  targetOrg: string;
  deploymentId?: string;
  endpointUrl?: string;
  status?: string;
  executionResult?: DatacodeDeployExecutionResult;
};

// eslint-disable-next-line sf-plugin/command-summary, sf-plugin/command-example
export abstract class DeployBase<TFlags extends BaseDeployFlags = BaseDeployFlags> extends SfCommand<DeployResult> {
  public static enableJsonFlag = false;

  public static readonly flags = {
    name: Flags.string({
      char: 'n',
      summary: messages.getMessage('flags.name.summary'),
      description: messages.getMessage('flags.name.description'),
      required: true,
    }),
    'package-version': Flags.string({
      summary: messages.getMessage('flags.version.summary'),
      description: messages.getMessage('flags.version.description'),
      required: true,
    }),
    description: Flags.string({
      char: 'd',
      summary: messages.getMessage('flags.description.summary'),
      description: messages.getMessage('flags.description.description'),
      required: true,
    }),
    network: Flags.string({
      summary: messages.getMessage('flags.network.summary'),
      description: messages.getMessage('flags.network.description'),
      required: false,
    }),
    'package-dir': Flags.directory({
      char: 'p',
      summary: messages.getMessage('flags.packageDir.summary'),
      description: messages.getMessage('flags.packageDir.description'),
      required: true,
      exists: true,
    }),
    'cpu-size': Flags.string({
      summary: messages.getMessage('flags.cpuSize.summary'),
      description: messages.getMessage('flags.cpuSize.description'),
      options: ['CPU_L', 'CPU_XL', 'CPU_2XL', 'CPU_4XL'],
      default: 'CPU_2XL',
    }),
    'target-org': Flags.requiredOrg({
      char: 'o',
      summary: messages.getMessage('flags.targetOrg.summary'),
      description: messages.getMessage('flags.targetOrg.description'),
      required: true,
    }),
  };

  public async run(): Promise<DeployResult> {
    const { flags } = (await this.parse(this.constructor as typeof DeployBase)) as unknown as { flags: TFlags };
    const codeType = this.getCodeType();
    const cmdMessages = this.getMessages();

    const name = flags.name;
    const version = flags['package-version'];
    const description = flags.description;
    const packageDir = flags['package-dir'];
    const targetOrg = flags['target-org'];
    const cpuSize = flags['cpu-size'] || 'CPU_2XL';
    const network = flags.network;

    const additionalFlags = this.getAdditionalFlags(flags);

    try {
      const { pythonInfo, packageInfo, binaryInfo } = await checkEnvironment(
        this.spinner,
        this.log.bind(this),
        cmdMessages
      );

      const orgUsername = targetOrg.getUsername() ?? 'target org';
      this.spinner.start(cmdMessages.getMessage('info.authenticating', [orgUsername]));

      const connection = targetOrg.getConnection();
      await connection.refreshAuth();

      this.spinner.stop();
      this.log(cmdMessages.getMessage('info.authenticated', [orgUsername]));

      this.log(cmdMessages.getMessage('info.deployingPackage'));
      const executionResult = await DatacodeBinaryExecutor.executeBinaryDeploy(
        name,
        version,
        description,
        packageDir,
        orgUsername,
        cpuSize,
        network,
        additionalFlags.functionInvokeOpt as string | undefined
      );

      this.log(cmdMessages.getMessage('info.deploymentComplete', [name, version]));

      this.log(cmdMessages.getMessage('info.deploySuccess'));

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
        message: cmdMessages.getMessage('info.deploySuccess'),
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
