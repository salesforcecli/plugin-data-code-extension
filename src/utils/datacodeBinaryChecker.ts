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

export type DatacodeZipExecutionResult = {
  stdout: string;
  stderr: string;
  archivePath?: string;
  fileCount?: number;
  archiveSize?: string;
};

export type DatacodeDeployExecutionResult = {
  stdout: string;
  stderr: string;
  deploymentId?: string;
  endpointUrl?: string;
  status?: string;
};

export type DatacodeRunExecutionResult = {
  stdout: string;
  stderr: string;
  status?: string;
  output?: string;
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
    noRequirements: boolean = false,
    configFile?: string
  ): Promise<DatacodeScanExecutionResult> {
    // Build the command with optional flags
    let command = 'datacustomcode scan';

    // Add boolean flags FIRST (before positional argument)
    if (dryRun) {
      command += ' --dry-run';
    }

    if (noRequirements) {
      command += ' --no-requirements';
    }

    if (configFile) {
      command += ` --config "${configFile}"`;
    }

    // Add entrypoint as positional argument LAST (with proper quoting for paths with spaces)
    const configPath = config ?? 'payload/config.json';
    command += ` "${configPath}"`;

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
   * Executes datacustomcode zip with the specified parameters.
   *
   * @param packageDir The directory containing the initialized package to zip
   * @param network Optional network configuration for Jupyter notebooks
   * @returns Execution result with stdout, stderr, and archive information
   * @throws SfError if execution fails
   */
  public static async executeBinaryZip(
    packageDir: string,
    network?: string
  ): Promise<DatacodeZipExecutionResult> {
    // Build the command with optional network flag
    let command = 'datacustomcode zip';

    // Add network flag if provided (before positional argument)
    if (network) {
      command += ` --network "${network}"`;
    }

    // Add package directory as positional argument (with proper quoting for paths with spaces)
    command += ` "${packageDir}"`;

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 120_000, // 120 second timeout (zipping can take time for large packages)
      });

      // Parse archive path from output
      let archivePath: string | undefined;
      const archivePathPattern = /Archive created: (.+\.zip)/i;
      const archiveMatch = archivePathPattern.exec(stdout);
      if (archiveMatch) {
        archivePath = archiveMatch[1].trim();
      }

      // Parse file count from output
      let fileCount: number | undefined;
      const fileCountPattern = /(\d+) files? (?:added|included|archived)/i;
      const countMatch = fileCountPattern.exec(stdout);
      if (countMatch) {
        fileCount = parseInt(countMatch[1], 10);
      }

      // Parse archive size from output
      let archiveSize: string | undefined;
      const sizePattern = /Archive size: (.+)/i;
      const sizeMatch = sizePattern.exec(stdout);
      if (sizeMatch) {
        archiveSize = sizeMatch[1].trim();
      }

      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        archivePath,
        fileCount,
        archiveSize,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for specific error patterns
      if (errorMessage.includes('Permission denied')) {
        throw new SfError(
          messages.getMessage('error.zipPermissionDenied', [packageDir]),
          'ZipPermissionDenied',
          messages.getMessages('actions.zipPermissionDenied')
        );
      }

      if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
        throw new SfError(
          messages.getMessage('error.packageDirNotFound', [packageDir]),
          'PackageDirNotFound',
          messages.getMessages('actions.packageDirNotFound')
        );
      }

      if (errorMessage.includes('not initialized') || errorMessage.includes('config.json')) {
        throw new SfError(
          messages.getMessage('error.notInitializedPackage', [packageDir]),
          'NotInitializedPackage',
          messages.getMessages('actions.notInitializedPackage')
        );
      }

      if (errorMessage.includes('disk space') || errorMessage.includes('No space left')) {
        throw new SfError(
          messages.getMessage('error.insufficientDiskSpace'),
          'InsufficientDiskSpace',
          messages.getMessages('actions.insufficientDiskSpace')
        );
      }

      // Generic execution error
      throw new SfError(
        messages.getMessage('error.zipExecutionFailed', [packageDir, errorMessage]),
        'ZipExecutionFailed',
        messages.getMessages('actions.zipExecutionFailed')
      );
    }
  }

  /**
   * Executes datacustomcode deploy with the specified parameters.
   *
   * @param name The name of the package to deploy
   * @param version The version of the package
   * @param description The description of the package
   * @param packageDir The directory containing the packaged code
   * @param targetOrg The target Salesforce org username/alias
   * @param cpuSize The CPU size for the deployment
   * @param network Optional network configuration for Jupyter notebooks
   * @param functionInvokeOpt Optional function invocation option (function packages only)
   * @returns Execution result with stdout, stderr, and deployment details
   * @throws SfError if execution fails
   */
  public static async executeBinaryDeploy(
    name: string,
    version: string,
    description: string,
    packageDir: string,
    targetOrg: string,
    cpuSize: string,
    network?: string,
    functionInvokeOpt?: string
  ): Promise<DatacodeDeployExecutionResult> {
    // Build the command with required and optional flags
    let command = 'datacustomcode deploy';
    command += ` --name "${name}"`;
    command += ` --version "${version}"`;
    command += ` --description "${description}"`;
    command += ` --path "${packageDir}"`; // Note: package-dir maps to --path
    command += ` --sf-cli-org "${targetOrg}"`; // Note: target-org maps to --sf-cli-org
    command += ` --cpu-size ${cpuSize}`;

    if (network) {
      command += ` --network "${network}"`;
    }

    if (functionInvokeOpt) {
      command += ` --function-invoke-opt "${functionInvokeOpt}"`;
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 300_000, // 5 minute timeout (deployment can take time)
      });

      // Parse deployment ID from output
      let deploymentId: string | undefined;
      const deploymentIdPattern = /Deployment ID: (.+)/i;
      const deploymentMatch = deploymentIdPattern.exec(stdout);
      if (deploymentMatch) {
        deploymentId = deploymentMatch[1].trim();
      }

      // Parse endpoint URL from output
      let endpointUrl: string | undefined;
      const endpointUrlPattern = /Endpoint URL: (.+)/i;
      const endpointMatch = endpointUrlPattern.exec(stdout);
      if (endpointMatch) {
        endpointUrl = endpointMatch[1].trim();
      }

      // Parse deployment status from output
      let status: string | undefined;
      const statusPattern = /Status: (.+)/i;
      const statusMatch = statusPattern.exec(stdout);
      if (statusMatch) {
        status = statusMatch[1].trim();
      }

      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        deploymentId,
        endpointUrl,
        status,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for specific error patterns
      if (errorMessage.includes('Authentication failed') || errorMessage.includes('Invalid credentials')) {
        throw new SfError(
          messages.getMessage('error.deployAuthenticationFailed', [targetOrg]),
          'DeployAuthenticationFailed',
          messages.getMessages('actions.deployAuthenticationFailed')
        );
      }

      if (errorMessage.includes('Invalid package') || errorMessage.includes('Package validation failed')) {
        throw new SfError(
          messages.getMessage('error.deployPackageInvalid', [packageDir]),
          'DeployPackageInvalid',
          messages.getMessages('actions.deployPackageInvalid')
        );
      }

      if (errorMessage.includes('already exists') || errorMessage.includes('Conflict')) {
        throw new SfError(
          messages.getMessage('error.deployConflict', [name, version]),
          'DeployConflict',
          messages.getMessages('actions.deployConflict')
        );
      }

      if (errorMessage.includes('quota exceeded') || errorMessage.includes('limit reached')) {
        throw new SfError(
          messages.getMessage('error.deployQuotaExceeded'),
          'DeployQuotaExceeded',
          messages.getMessages('actions.deployQuotaExceeded')
        );
      }

      if (errorMessage.includes('network error') || errorMessage.includes('connection refused')) {
        throw new SfError(
          messages.getMessage('error.deployNetworkError'),
          'DeployNetworkError',
          messages.getMessages('actions.deployNetworkError')
        );
      }

      // Generic execution error
      throw new SfError(
        messages.getMessage('error.deployExecutionFailed', [name, errorMessage]),
        'DeployExecutionFailed',
        messages.getMessages('actions.deployExecutionFailed')
      );
    }
  }

  /**
   * Executes datacustomcode run with the specified parameters.
   *
   * @param packageDir The package directory (positional argument)
   * @param targetOrg The target Salesforce org username/alias
   * @param configFile Optional path to a config file
   * @param dependencies Optional dependencies override
   * @param profile Optional profile name
   * @returns Execution result with stdout, stderr, and parsed run output
   * @throws SfError if execution fails
   */
  public static async executeBinaryRun(
    packageDir: string,
    targetOrg: string,
    configFile?: string,
    dependencies?: string,
    profile?: string
  ): Promise<DatacodeRunExecutionResult> {
    // Build the command — flags before the positional argument
    let command = 'datacustomcode run';
    command += ` --sf-cli-org "${targetOrg}"`;

    if (configFile) {
      command += ` --config-file "${configFile}"`;
    }

    if (dependencies) {
      command += ` --dependencies "${dependencies}"`;
    }

    if (profile) {
      command += ` --profile "${profile}"`;
    }

    command += ` "${packageDir}"`;

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 300_000, // 5 minute timeout
      });

      // Parse status from output
      let status: string | undefined;
      const statusPattern = /Status: (.+)/i;
      const statusMatch = statusPattern.exec(stdout);
      if (statusMatch) {
        status = statusMatch[1].trim();
      }

      // Parse run output from output
      let output: string | undefined;
      const outputPattern = /Output: (.+)/i;
      const outputMatch = outputPattern.exec(stdout);
      if (outputMatch) {
        output = outputMatch[1].trim();
      }

      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        status,
        output,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('Authentication failed') || errorMessage.includes('Invalid credentials')) {
        throw new SfError(
          messages.getMessage('error.runAuthenticationFailed', [targetOrg]),
          'RunAuthenticationFailed',
          messages.getMessages('actions.runAuthenticationFailed')
        );
      }

      if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
        throw new SfError(
          messages.getMessage('error.runPackageDirNotFound', [packageDir]),
          'RunPackageDirNotFound',
          messages.getMessages('actions.runPackageDirNotFound')
        );
      }

      if (errorMessage.includes('config') && errorMessage.includes('not found')) {
        throw new SfError(
          messages.getMessage('error.runConfigNotFound', [configFile ?? '']),
          'RunConfigNotFound',
          messages.getMessages('actions.runConfigNotFound')
        );
      }

      // Generic execution error
      throw new SfError(
        messages.getMessage('error.runExecutionFailed', [packageDir, errorMessage]),
        'RunExecutionFailed',
        messages.getMessages('actions.runExecutionFailed')
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