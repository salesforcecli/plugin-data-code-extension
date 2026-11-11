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
import { SfError } from '@salesforce/core';
import { Messages } from '@salesforce/core';
import { spawnAsync } from './spawnHelper.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-data-code-extension', 'pythonChecker');

export type PythonVersionInfo = {
  command: string;
  version: string;
  major: number;
  minor: number;
  patch: number;
};

/**
 * Prints the directory of the package named by argv[1], or nothing if it can't be found.
 * `find_spec` locates the package without importing it, and it follows editable installs
 * (`pip install -e`, `poetry install`) whose code lives outside site-packages.
 */
const FIND_PACKAGE_DIR_SHIM = [
  'import sys, importlib.util',
  'spec = importlib.util.find_spec(sys.argv[1])',
  'locations = list(spec.submodule_search_locations or []) if spec else []',
  "print(locations[0] if locations else '')",
].join('\n');

export class PythonChecker {
  private static readonly REQUIRED_MAJOR = 3;
  private static readonly REQUIRED_MINOR = 11;

  /**
   * Finds where `packageName` is installed for the given Python, as Python itself resolves it.
   *
   * @param command The Python command to ask (from checkPython311)
   * @param packageName The importable package name, e.g. 'datacustomcode'
   * @returns The package directory, or null if Python can't locate it
   */
  public static async findPackageDir(command: string, packageName: string): Promise<string | null> {
    try {
      // -P keeps the current directory off sys.path, so a local folder can't shadow the install.
      const { stdout } = await spawnAsync(command, ['-P', '-c', FIND_PACKAGE_DIR_SHIM, packageName]);
      const dir = stdout.trim();
      return dir.length > 0 ? dir : null;
    } catch {
      return null;
    }
  }

  /**
   * Checks if Python 3.11 is installed on the system.
   *
   * @returns PythonVersionInfo if Python 3.11 is found
   * @throws SfError if Python is not found or is not exactly version 3.11
   */
  public static async checkPython311(): Promise<PythonVersionInfo> {
    // Try python3 first, then python
    const pythonCommands = ['python3', 'python'];

    for (const command of pythonCommands) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const versionInfo = await this.getPythonVersion(command);

        if (this.isVersionRequired(versionInfo)) {
          return versionInfo;
        }

        // Python found but version is not 3.11
        throw new SfError(
          messages.getMessage('error.versionMismatch', [
            `${versionInfo.major}.${versionInfo.minor}.${versionInfo.patch}`,
            `${this.REQUIRED_MAJOR}.${this.REQUIRED_MINOR}`,
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
      const { stdout } = await spawnAsync(command, ['--version']);
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
      throw new Error(`Python command '${command}' not found or not accessible`, { cause: error });
    }
  }

  /**
   * Checks if the Python version is exactly the required version (major.minor match).
   *
   * @param versionInfo The Python version information
   * @returns true if version is exactly 3.11.x
   */
  private static isVersionRequired(versionInfo: PythonVersionInfo): boolean {
    return versionInfo.major === this.REQUIRED_MAJOR && versionInfo.minor === this.REQUIRED_MINOR;
  }
}
