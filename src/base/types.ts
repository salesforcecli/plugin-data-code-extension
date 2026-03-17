import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { type PythonVersionInfo } from '../utils/pythonChecker.js';
import { type PipPackageInfo } from '../utils/pipChecker.js';
import { type DatacodeBinaryInfo } from '../utils/datacodeBinaryChecker.js';

// eslint-disable-next-line sf-plugin/no-hardcoded-messages-flags, sf-plugin/no-json-flag
export const sharedBaseFlags = {
  ...SfCommand.baseFlags,
  'flags-dir': Flags.directory({
    summary: 'Import flag values from a directory.',
    helpGroup: 'GLOBAL',
    hidden: false,
  }),
  json: Flags.boolean({
    summary: 'Format output as json.',
    helpGroup: 'GLOBAL',
    hidden: true,
  }),
};

export type SharedResultProps = {
  success: boolean;
  pythonVersion: PythonVersionInfo;
  packageInfo?: PipPackageInfo;
  binaryInfo?: DatacodeBinaryInfo;
  codeType: 'script' | 'function';
  packageDir: string;
  message: string;
};
