import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { PythonChecker } from '../utils/pythonChecker.js';
import { PipChecker } from '../utils/pipChecker.js';
import { DatacodeBinaryChecker, type ScanResult } from '../utils/datacodeBinaryChecker.js';

// eslint-disable-next-line sf-plugin/command-summary, sf-plugin/command-example
export abstract class ScanBase extends SfCommand<ScanResult> {
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

  public async run(): Promise<ScanResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    const { flags } = await this.parse(this.constructor as any);
    const codeType = this.getCodeType();
    const messages = this.getMessages();

    // Get flag values
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const config = flags['config'];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const dryRun = flags['dry-run'] || false;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const noRequirements = flags['no-requirements'] || false;

    // Use current working directory as the scan directory
    const workingDir = process.cwd();

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

      // Execute datacustomcode scan
      this.spinner.start(messages.getMessage('info.executingScan'));
      const executionResult = await DatacodeBinaryChecker.executeBinaryScan(
        workingDir,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        config,
        // Cast to boolean to ensure type safety
        Boolean(dryRun),
        Boolean(noRequirements)
      );

      this.spinner.stop();
      this.log(messages.getMessage('info.scanExecuted', [workingDir]));

      // Log scan results if available
      if (executionResult.permissions && executionResult.permissions.length > 0) {
        executionResult.permissions.forEach(permission => {
          this.log(messages.getMessage('info.permissionFound', [permission]));
        });
      }

      if (executionResult.requirements && executionResult.requirements.length > 0) {
        executionResult.requirements.forEach(requirement => {
          this.log(messages.getMessage('info.requirementFound', [requirement]));
        });
      }

      if (executionResult.filesScanned && executionResult.filesScanned.length > 0) {
        executionResult.filesScanned.forEach(file => {
          this.log(messages.getMessage('info.fileScanned', [file]));
        });
      }

      // Show dry run notice if applicable
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

  // Abstract methods that subclasses must implement
  protected abstract getCodeType(): 'script' | 'function';
  protected abstract getMessages(): Messages<string>;
}
