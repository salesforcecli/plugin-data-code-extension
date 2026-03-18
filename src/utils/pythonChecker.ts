import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { SfError } from '@salesforce/core';
import { Messages } from '@salesforce/core';

const execAsync = promisify(exec);

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('data-code-extension', 'pythonChecker');

export type PythonVersionInfo = {
  command: string;
  version: string;
  major: number;
  minor: number;
  patch: number;
};

export class PythonChecker {
  private static readonly MIN_MAJOR = 3;
  private static readonly MIN_MINOR = 11;

  /**
   * Checks if Python 3.11 or higher is installed on the system.
   *
   * @returns PythonVersionInfo if Python 3.11+ is found
   * @throws SfError if Python is not found or version is insufficient
   */
  public static async checkPython311(): Promise<PythonVersionInfo> {
    // Try python3 first, then python
    const pythonCommands = ['python3', 'python'];

    for (const command of pythonCommands) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const versionInfo = await this.getPythonVersion(command);

        if (this.isVersionSufficient(versionInfo)) {
          return versionInfo;
        }

        // Python found but version is too old
        throw new SfError(
          messages.getMessage('error.versionMismatch', [
            `${versionInfo.major}.${versionInfo.minor}.${versionInfo.patch}`,
            `${this.MIN_MAJOR}.${this.MIN_MINOR}`,
          ]),
          'PythonVersionMismatch',
          messages.getMessages('actions.versionMismatch')
        );
      } catch (error) {
        // If it's already an SfError about version mismatch, throw it
        if (error instanceof SfError && error.name === 'PythonVersionMismatch') {
          throw error;
        }
        // Otherwise, continue to try the next command
        continue;
      }
    }

    // Python not found with any command
    throw new SfError(
      messages.getMessage('error.pythonNotFound'),
      'PythonNotFound',
      messages.getMessages('actions.pythonNotFound')
    );
  }

  /**
   * Gets the Python version for a specific command.
   *
   * @param command The Python command to check (python or python3)
   * @returns PythonVersionInfo
   */
  private static async getPythonVersion(command: string): Promise<PythonVersionInfo> {
    try {
      const { stdout } = await execAsync(`${command} --version`);
      const versionMatch = stdout.match(/Python (\d+)\.(\d+)\.(\d+)/);

      if (!versionMatch) {
        throw new Error('Could not parse Python version');
      }

      const [, major, minor, patch] = versionMatch;

      return {
        command,
        version: `${major}.${minor}.${patch}`,
        major: parseInt(major, 10),
        minor: parseInt(minor, 10),
        patch: parseInt(patch, 10),
      };
    } catch (error) {
      throw new Error(`Python command '${command}' not found or not accessible`);
    }
  }

  /**
   * Checks if the Python version meets the minimum requirements.
   *
   * @param versionInfo The Python version information
   * @returns true if version is 3.11
   */
  private static isVersionSufficient(versionInfo: PythonVersionInfo): boolean {
    if (versionInfo.major > this.MIN_MAJOR) {
      return true;
    }

    if (versionInfo.major === this.MIN_MAJOR && versionInfo.minor >= this.MIN_MINOR) {
      return true;
    }

    return false;
  }
}
