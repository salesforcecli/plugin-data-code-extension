import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { SfError } from '@salesforce/core';
import { Messages } from '@salesforce/core';
import { type PythonVersionInfo } from './pythonChecker.js';
import { type PipPackageInfo } from './pipChecker.js';

const execAsync = promisify(exec);

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('data-code-extension', 'datacodeBinaryChecker');

export type DatacodeBinaryInfo = {
  command: string;
  version: string;
  path?: string;
};

export type DatacodeInitExecutionResult = {
  stdout: string;
  stderr: string;
  filesCreated?: string[];
  projectPath: string;
};

export type DatacodeScanExecutionResult = {
  stdout: string;
  stderr: string;
  workingDirectory: string;
  permissions?: string[];
  requirements?: string[];
  filesScanned?: string[];
};

export type ScanResult = {
  success: boolean;
  pythonVersion: PythonVersionInfo;
  packageInfo?: PipPackageInfo;
  binaryInfo?: DatacodeBinaryInfo;
  codeType: 'script' | 'function';
  workingDirectory: string;
  message: string;
  executionResult?: DatacodeScanExecutionResult;
};

export class DatacodeBinaryChecker {
  /**
   * Checks if the datacustomcode binary is installed and accessible.
   *
   * @returns DatacodeBinaryInfo if the binary is found and executable
   * @throws SfError if binary is not found or not executable
   */
  public static async checkBinary(): Promise<DatacodeBinaryInfo> {
    const command = 'datacustomcode';

    // First check if the command exists
    const commandExists = await this.isCommandAvailable(command);

    if (!commandExists) {
      // Binary not found in PATH
      throw new SfError(
        messages.getMessage('error.binaryNotFound'),
        'BinaryNotFound',
        messages.getMessages('actions.binaryNotFound')
      );
    }

    // Command exists, try to get version info
    const versionInfo = await this.getBinaryVersion(command);

    if (versionInfo) {
      return versionInfo;
    }

    // Binary found but couldn't get version info
    throw new SfError(
      messages.getMessage('error.binaryNotExecutable'),
      'BinaryNotExecutable',
      messages.getMessages('actions.binaryNotExecutable')
    );
  }

  /**
   * Executes datacustomcode init with the specified parameters.
   *
   * @param codeType The type of code package to initialize
   * @param packageDir The directory to initialize the package in
   * @returns Execution result with stdout, stderr, and parsed file list
   * @throws SfError if execution fails
   */
  public static async executeBinaryInit(
    codeType: 'script' | 'function',
    packageDir: string
  ): Promise<DatacodeInitExecutionResult> {
    const command = `datacustomcode init --code-type ${codeType} ${packageDir}`;

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 30_000, // 30 second timeout
      });

      // Parse created files from output if available
      const filesCreated: string[] = [];
      const filePattern = /Created (?:file|directory): (.+)/g;
      let match;
      while ((match = filePattern.exec(stdout)) !== null) {
        filesCreated.push(match[1]);
      }

      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        filesCreated,
        projectPath: packageDir,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for specific error patterns
      if (errorMessage.includes('Permission denied')) {
        throw new SfError(
          messages.getMessage('error.initPermissionDenied', [packageDir]),
          'InitPermissionDenied',
          messages.getMessages('actions.initPermissionDenied')
        );
      }

      if (errorMessage.includes('already exists')) {
        throw new SfError(
          messages.getMessage('error.initDirectoryExists', [packageDir]),
          'InitDirectoryExists',
          messages.getMessages('actions.initDirectoryExists')
        );
      }

      // Generic execution error
      throw new SfError(
        messages.getMessage('error.initExecutionFailed', [packageDir, errorMessage]),
        'InitExecutionFailed',
        messages.getMessages('actions.initExecutionFailed')
      );
    }
  }

  /**
   * Executes datacustomcode scan with the specified parameters.
   *
   * @param workingDir The directory to scan (should contain an initialized package)
   * @param config Optional path to config.json file
   * @param dryRun Whether to perform a dry run without modifying files
   * @param noRequirements Whether to skip updating requirements.txt
   * @returns Execution result with stdout, stderr, and parsed scan data
   * @throws SfError if execution fails
   */
  public static async executeBinaryScan(
    workingDir: string,
    config?: string,
    dryRun: boolean = false,
    noRequirements: boolean = false
  ): Promise<DatacodeScanExecutionResult> {
    // Build the command with optional flags
    let command = 'datacustomcode scan';

    // Add optional config path
    if (config) {
      command += ` --config ${config}`;
    } else {
      // Default to payload/config.json if not specified
      command += ' --config payload/config.json';
    }

    // Add boolean flags
    if (dryRun) {
      command += ' --dry-run';
    }

    if (noRequirements) {
      command += ' --no-requirements';
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: workingDir,
        timeout: 60_000, // 60 second timeout (longer than init's 30 seconds)
      });

      // Parse scan results from output
      const permissions: string[] = [];
      const requirements: string[] = [];
      const filesScanned: string[] = [];

      // Parse permissions (expected format: "Permission required: <permission>")
      const permissionPattern = /Permission required: (.+)/g;
      let match;
      while ((match = permissionPattern.exec(stdout)) !== null) {
        permissions.push(match[1].trim());
      }

      // Parse requirements (expected format: "Dependency found: <requirement>")
      const requirementPattern = /Dependency found: (.+)/g;
      while ((match = requirementPattern.exec(stdout)) !== null) {
        requirements.push(match[1].trim());
      }

      // Parse scanned files (expected format: "Scanned: <file>")
      const filePattern = /Scanned: (.+)/g;
      while ((match = filePattern.exec(stdout)) !== null) {
        filesScanned.push(match[1].trim());
      }

      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        workingDirectory: workingDir,
        permissions: permissions.length > 0 ? permissions : undefined,
        requirements: requirements.length > 0 ? requirements : undefined,
        filesScanned: filesScanned.length > 0 ? filesScanned : undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for specific error patterns
      if (errorMessage.includes('Permission denied')) {
        throw new SfError(
          messages.getMessage('error.scanPermissionDenied', [workingDir]),
          'ScanPermissionDenied',
          messages.getMessages('actions.scanPermissionDenied')
        );
      }

      if (errorMessage.includes('config') && errorMessage.includes('not found')) {
        throw new SfError(
          messages.getMessage('error.configNotFound', [config ?? 'payload/config.json']),
          'ConfigNotFound',
          messages.getMessages('actions.configNotFound')
        );
      }

      if (errorMessage.includes('not initialized') || errorMessage.includes('not a package')) {
        throw new SfError(
          messages.getMessage('error.notInPackageDir'),
          'NotInPackageDir',
          messages.getMessages('actions.notInPackageDir')
        );
      }

      // Generic execution error
      throw new SfError(
        messages.getMessage('error.scanExecutionFailed', [workingDir, errorMessage]),
        'ScanExecutionFailed',
        messages.getMessages('actions.scanExecutionFailed')
      );
    }
  }

  /**
   * Checks if a command is available in the system PATH.
   *
   * @param command The command to check
   * @returns true if command exists, false otherwise
   */
  private static async isCommandAvailable(command: string): Promise<boolean> {
    try {
      // Use 'which' on Unix-like systems, 'where' on Windows
      const checkCommand = process.platform === 'win32' ? 'where' : 'which';
      await execAsync(`${checkCommand} ${command}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets the binary version information.
   *
   * @param command The binary command to check
   * @returns DatacodeBinaryInfo if successful, null otherwise
   */
  private static async getBinaryVersion(command: string): Promise<DatacodeBinaryInfo | null> {
    try {
      const { stdout } = await execAsync(`${command} version`);

      // Parse the version output
      // Expected format might be something like "datacustomcode version 1.2.3" or just "1.2.3"
      // We'll handle multiple possible formats
      const versionMatch = stdout.match(/(\d+\.\d+(?:\.\d+)?(?:[-\w.]*)?)/);

      if (versionMatch) {
        const version = versionMatch[1];

        // Try to get the binary path (optional)
        let path: string | undefined;
        try {
          // On Unix-like systems use 'which', on Windows use 'where'
          const pathCommand = process.platform === 'win32' ? 'where' : 'which';
          const { stdout: pathOutput } = await execAsync(`${pathCommand} ${command}`);
          path = pathOutput.trim().split('\n')[0]; // Get first path if multiple
        } catch {
          // Path lookup is optional, don't fail if it doesn't work
          path = undefined;
        }

        return {
          command,
          version,
          path,
        };
      }

      // If we can't parse the version but the command executed, still return basic info
      return {
        command,
        version: 'unknown',
        path: undefined,
      };
    } catch (error) {
      // Command not found or failed to execute
      return null;
    }
  }
}