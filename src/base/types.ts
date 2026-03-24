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
