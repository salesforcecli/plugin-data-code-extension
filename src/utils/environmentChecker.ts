import { Messages } from '@salesforce/core';
import { PythonChecker, type PythonVersionInfo } from './pythonChecker.js';
import { PipChecker, type PipPackageInfo } from './pipChecker.js';
import { DatacodeBinaryChecker, type DatacodeBinaryInfo } from './datacodeBinaryChecker.js';

export type EnvironmentCheckResult = {
  pythonInfo: PythonVersionInfo;
  packageInfo: PipPackageInfo;
  binaryInfo: DatacodeBinaryInfo;
};

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

  spinner.start(messages.getMessage('info.checkingBinary'));
  const binaryInfo = await DatacodeBinaryChecker.checkBinary();

  spinner.stop();
  log(messages.getMessage('info.binaryFound', [binaryInfo.version]));

  return { pythonInfo, packageInfo, binaryInfo };
}
