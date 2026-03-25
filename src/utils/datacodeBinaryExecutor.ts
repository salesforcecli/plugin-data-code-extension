/*
 * Copyright 2026, Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { spawn } from 'node:child_process';
import { SfError } from '@salesforce/core';
import { Messages } from '@salesforce/core';
import { type PythonVersionInfo } from './pythonChecker.js';
import { type PipPackageInfo } from './pipChecker.js';
import { type DatacodeBinaryInfo } from './datacodeBinaryChecker.js';
import { spawnAsync, type SpawnError } from './spawnHelper.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-data-code-extension', 'datacodeBinaryExecutor');

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

export class DatacodeBinaryExecutor {
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
    try {
      const { stdout, stderr } = await spawnAsync('datacustomcode', ['init', '--code-type', codeType, packageDir], {
        timeout: 30_000,
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
      const spawnError = error as SpawnError;
      const binaryOutput = spawnError.stderr?.trim() ?? (error instanceof Error ? error.message : String(error));
      throw new SfError(
        messages.getMessage('error.initExecutionFailed', [packageDir, binaryOutput]),
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
    const args = ['scan'];

    if (dryRun) {
      args.push('--dry-run');
    }

    if (noRequirements) {
      args.push('--no-requirements');
    }

    if (configFile) {
      args.push('--config', configFile);
    }

    args.push(config ?? 'payload/config.json');

    try {
      const { stdout, stderr } = await spawnAsync('datacustomcode', args, {
        cwd: workingDir,
        timeout: 60_000,
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
      const spawnError = error as SpawnError;
      const binaryOutput = spawnError.stderr?.trim() ?? (error instanceof Error ? error.message : String(error));
      throw new SfError(
        messages.getMessage('error.scanExecutionFailed', [workingDir, binaryOutput]),
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
  public static async executeBinaryZip(packageDir: string, network?: string): Promise<DatacodeZipExecutionResult> {
    const args = ['zip'];

    if (network) {
      args.push('--network', network);
    }

    args.push(packageDir);

    try {
      const { stdout, stderr } = await spawnAsync('datacustomcode', args, {
        timeout: 120_000,
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
      const spawnError = error as SpawnError;
      const binaryOutput = spawnError.stderr?.trim() ?? (error instanceof Error ? error.message : String(error));
      throw new SfError(
        messages.getMessage('error.zipExecutionFailed', [packageDir, binaryOutput]),
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
    // Build args array for spawn (avoids shell-escaping issues and enables streaming)
    const args = [
      'deploy',
      '--name',
      name,
      '--version',
      version,
      '--description',
      description,
      '--path',
      packageDir,
      '--sf-cli-org',
      targetOrg,
      '--cpu-size',
      cpuSize,
    ];

    if (network) {
      args.push('--network', network);
    }

    if (functionInvokeOpt) {
      args.push('--function-invoke-opt', functionInvokeOpt);
    }

    return new Promise((resolve, reject) => {
      const child = spawn('datacustomcode', args, {
        timeout: 300_000,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        process.stdout.write(text);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        process.stderr.write(text);
      });

      child.on('close', (code) => {
        const stdoutTrimmed = stdout.trim();
        const stderrTrimmed = stderr.trim();

        if (code !== 0) {
          const errorMessage = stderrTrimmed || `Process exited with code ${code ?? 'unknown'}`;

          if (errorMessage.includes('Authentication failed') || errorMessage.includes('Invalid credentials')) {
            const sfError = new SfError(
              messages.getMessage('error.deployAuthenticationFailed', [targetOrg]),
              'DeployAuthenticationFailed',
              messages.getMessages('actions.deployAuthenticationFailed')
            );
            sfError.data = { stdout: stdoutTrimmed };
            reject(sfError);
            return;
          }

          const sfError = new SfError(
            messages.getMessage('error.deployExecutionFailed', [name, errorMessage]),
            'DeployExecutionFailed',
            messages.getMessages('actions.deployExecutionFailed')
          );
          sfError.data = { stdout: stdoutTrimmed };
          reject(sfError);
          return;
        }

        // Parse deployment ID from output
        let deploymentId: string | undefined;
        const deploymentIdPattern = /Deployment ID: (.+)/i;
        const deploymentMatch = deploymentIdPattern.exec(stdoutTrimmed);
        if (deploymentMatch) {
          deploymentId = deploymentMatch[1].trim();
        }

        // Parse endpoint URL from output
        let endpointUrl: string | undefined;
        const endpointUrlPattern = /Endpoint URL: (.+)/i;
        const endpointMatch = endpointUrlPattern.exec(stdoutTrimmed);
        if (endpointMatch) {
          endpointUrl = endpointMatch[1].trim();
        }

        // Parse deployment status from output
        let status: string | undefined;
        const statusPattern = /Status: (.+)/i;
        const statusMatch = statusPattern.exec(stdoutTrimmed);
        if (statusMatch) {
          status = statusMatch[1].trim();
        }

        resolve({
          stdout: stdoutTrimmed,
          stderr: stderrTrimmed,
          deploymentId,
          endpointUrl,
          status,
        });
      });

      child.on('error', (err) => {
        const sfError = new SfError(
          messages.getMessage('error.deployExecutionFailed', [name, err.message]),
          'DeployExecutionFailed',
          messages.getMessages('actions.deployExecutionFailed')
        );
        reject(sfError);
      });
    });
  }

  /**
   * Executes datacustomcode run with the specified parameters.
   *
   * @param packageDir The package directory (positional argument)
   * @param targetOrg The target Salesforce org username/alias
   * @param configFile Optional path to a config file
   * @param dependencies Optional dependencies override
   * @returns Execution result with stdout, stderr, and parsed run output
   * @throws SfError if execution fails
   */
  public static async executeBinaryRun(
    packageDir: string,
    targetOrg: string,
    configFile?: string,
    dependencies?: string
  ): Promise<DatacodeRunExecutionResult> {
    const args = ['run', '--sf-cli-org', targetOrg];

    if (configFile) {
      args.push('--config-file', configFile);
    }

    if (dependencies) {
      args.push('--dependencies', dependencies);
    }

    args.push(packageDir);

    try {
      const { stdout, stderr } = await spawnAsync('datacustomcode', args, {
        timeout: 300_000,
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
      const spawnError = error as SpawnError;
      const errorMessage = spawnError.message ?? String(error);

      if (errorMessage.includes('Authentication failed') || errorMessage.includes('Invalid credentials')) {
        throw new SfError(
          messages.getMessage('error.runAuthenticationFailed', [targetOrg]),
          'RunAuthenticationFailed',
          messages.getMessages('actions.runAuthenticationFailed')
        );
      }

      // Surface the binary's stderr directly so any runtime error is shown as-is.
      // File-existence checks for entrypoint and config-file are already handled by
      // the CLI flag layer (exists: true), so those patterns are not matched here.
      const binaryOutput = spawnError.stderr?.trim() ?? errorMessage;
      throw new SfError(
        messages.getMessage('error.runExecutionFailed', [binaryOutput]),
        'RunExecutionFailed',
        messages.getMessages('actions.runExecutionFailed')
      );
    }
  }
}
