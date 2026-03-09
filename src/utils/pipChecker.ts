import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { SfError } from '@salesforce/core';
import { Messages } from '@salesforce/core';

const execAsync = promisify(exec);

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('data-code-extension', 'pipChecker');

export type PipPackageInfo = {
  name: string;
  version: string;
  location: string;
  pipCommand: string;
};

export class PipChecker {
  /**
   * Checks if a specific pip package is installed on the system.
   *
   * @param packageName The name of the package to check
   * @returns PipPackageInfo if the package is found
   * @throws SfError if pip is not found or package is not installed
   */
  public static async checkPackage(packageName: string): Promise<PipPackageInfo> {
    // Try different pip commands in order of preference
    const pipCommands = ['pip3', 'pip', 'python3 -m pip', 'python -m pip'];

    for (const command of pipCommands) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const packageInfo = await this.getPackageInfo(command, packageName);

        if (packageInfo) {
          return packageInfo;
        }
      } catch (error) {
        // Continue to try the next command
        continue;
      }
    }

    // Check if pip is available at all
    const pipAvailable = await this.isPipAvailable(pipCommands);

    if (!pipAvailable) {
      // Pip not found with any command
      throw new SfError(
        messages.getMessage('error.pipNotFound'),
        'PipNotFound',
        messages.getMessages('actions.pipNotFound')
      );
    }

    // Pip is available but package is not installed
    throw new SfError(
      messages.getMessage('error.packageNotInstalled', [packageName]),
      'PackageNotInstalled',
      messages.getMessages('actions.packageNotInstalled')
    );
  }

  /**
   * Gets the package information for a specific pip command and package name.
   *
   * @param pipCommand The pip command to use
   * @param packageName The name of the package to check
   * @returns PipPackageInfo if package is found, null otherwise
   */
  private static async getPackageInfo(pipCommand: string, packageName: string): Promise<PipPackageInfo | null> {
    try {
      const { stdout } = await execAsync(`${pipCommand} show ${packageName}`);

      // Parse the output to extract package information
      const nameMatch = stdout.match(/Name:\s+(.+)/);
      const versionMatch = stdout.match(/Version:\s+(.+)/);
      const locationMatch = stdout.match(/Location:\s+(.+)/);

      if (nameMatch && versionMatch && locationMatch) {
        return {
          name: nameMatch[1].trim(),
          version: versionMatch[1].trim(),
          location: locationMatch[1].trim(),
          pipCommand: pipCommand.split(' ')[0], // Extract the base command (pip3, pip, python3, python)
        };
      }

      return null;
    } catch (error) {
      // Package not found or pip command failed
      return null;
    }
  }

  /**
   * Checks if pip is available with any of the given commands.
   *
   * @param pipCommands List of pip commands to try
   * @returns true if pip is available, false otherwise
   */
  private static async isPipAvailable(pipCommands: string[]): Promise<boolean> {
    for (const command of pipCommands) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await execAsync(`${command} --version`);
        return true;
      } catch (error) {
        continue;
      }
    }
    return false;
  }
}