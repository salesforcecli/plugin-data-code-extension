import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { SfError } from '@salesforce/core';
import { Messages } from '@salesforce/core';

const execAsync = promisify(exec);

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('data-code-extension', 'datacodeBinaryChecker');

export type DatacodeBinaryInfo = {
  command: string;
  version: string;
  path?: string;
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
