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
// Export utilities for use by other commands
export { PythonChecker, type PythonVersionInfo } from './utils/pythonChecker.js';
export { PipChecker, type PipPackageInfo } from './utils/pipChecker.js';
export { executeNativeInit, type NativeInitOptions, type NativeInitResult } from './utils/nativeInit.js';
export {
  executeNativeScan,
  scanFile,
  scanFileForImports,
  updateConfig,
  writeRequirementsFile,
  findBaseDirectory,
  getPackageType,
  type CodeType,
  type DataAccessLayerCalls,
  type NativeScanOptions,
  type NativeScanResult,
  type ScanPermissions,
} from './utils/nativeScan.js';
export type { ScanResult } from './base/scanBase.js';
export {
  createZip,
  hasNonemptyRequirementsFile,
  prepareDependencyArchive,
  zip as zipPackage,
  zipWithSfError,
  type ZipResult as ZipBuilderResult,
} from './utils/zipBuilder.js';
