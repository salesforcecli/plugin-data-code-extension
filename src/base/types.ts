import { type PythonVersionInfo } from '../utils/pythonChecker.js';
import { type PipPackageInfo } from '../utils/pipChecker.js';
import { type DatacodeBinaryInfo } from '../utils/datacodeBinaryChecker.js';

export type SharedResultProps = {
  success: boolean;
  pythonVersion: PythonVersionInfo;
  packageInfo?: PipPackageInfo;
  binaryInfo?: DatacodeBinaryInfo;
  codeType: 'script' | 'function';
  packageDir: string;
  message: string;
};
