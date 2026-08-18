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
import { Messages } from '@salesforce/core';
import { PythonChecker, type PythonVersionInfo } from './pythonChecker.js';
import { PipChecker, type PipPackageInfo, type PipUpdateInfo } from './pipChecker.js';

export type EnvironmentCheckResult = {
  pythonInfo: PythonVersionInfo;
  packageInfo: PipPackageInfo;
};

function logUpdateInfo(log: (msg: string) => void, updateInfo: PipUpdateInfo | null): void {
  if (!updateInfo) return;
  const pipMessages = Messages.loadMessages('@salesforce/plugin-data-code-extension', 'pipChecker');
  log(
    pipMessages.getMessage('warn.updateAvailable', [
      updateInfo.packageName,
      updateInfo.latestVersion,
      updateInfo.installedVersion,
    ])
  );
  for (const action of pipMessages.getMessages('actions.updatePackage')) {
    log(`  ${action}`);
  }
}

export async function checkEnvironment(
  spinner: { start: (msg: string) => void; stop: () => void },
  log: (msg: string) => void,
  messages: Messages<string>
): Promise<EnvironmentCheckResult> {
  spinner.start(messages.getMessage('info.checkingPython'));
  const pythonInfo = await PythonChecker.checkPython311();

  spinner.stop();
  log(messages.getMessage('info.pythonFound', [pythonInfo.version, pythonInfo.command]));

  spinner.start(messages.getMessage('info.checkingPackages'));
  const packageInfo = await PipChecker.checkPackage('salesforce-data-customcode');

  spinner.stop();
  log(messages.getMessage('info.packageFound', [packageInfo.name, packageInfo.version]));

  logUpdateInfo(log, await PipChecker.checkForUpdate(packageInfo));

  return { pythonInfo, packageInfo };
}
