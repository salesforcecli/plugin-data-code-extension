import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages, Org } from '@salesforce/core';
import { DatacodeBinaryExecutor, type DatacodeRunExecutionResult } from '../utils/datacodeBinaryExecutor.js';
import { checkEnvironment } from '../utils/environmentChecker.js';
import { sharedBaseFlags, type SharedResultProps } from './types.js';

export type BaseRunFlags = {
  entrypoint: string;
  'target-org': Org;
  'config-file'?: string;
  dependencies?: string;
};

export type RunResult = SharedResultProps & {
  targetOrg: string;
  status?: string;
  output?: string;
  executionResult?: DatacodeRunExecutionResult;
};

// eslint-disable-next-line sf-plugin/command-summary, sf-plugin/command-example
export abstract class RunBase extends SfCommand<RunResult> {
  // Override baseFlags to hide global flags
  public static readonly baseFlags = sharedBaseFlags;

  public async run(): Promise<RunResult> {
    const { flags } = (await this.parse(this.constructor as typeof RunBase)) as unknown as { flags: BaseRunFlags };
    const codeType = this.getCodeType();
    const messages = this.getMessages();

    const packageDir = flags.entrypoint;
    const targetOrg = flags['target-org'];
    const configFile = flags['config-file'];
    const dependencies = flags.dependencies;

    try {
      const { pythonInfo, packageInfo, binaryInfo } = await checkEnvironment(
        this.spinner,
        this.log.bind(this),
        messages
      );

      const orgUsername = targetOrg.getUsername() ?? 'target org';
      this.spinner.start(messages.getMessage('info.authenticating', [orgUsername]));

      const connection = targetOrg.getConnection();
      await connection.refreshAuth();

      this.spinner.stop();
      this.log(messages.getMessage('info.authenticated', [orgUsername]));

      this.spinner.start(messages.getMessage('info.runningPackage'));
      const executionResult = await DatacodeBinaryExecutor.executeBinaryRun(
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
