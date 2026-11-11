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
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { debuglog } from 'node:util';
import { Messages, SfError } from '@salesforce/core';
import { parseDocument } from 'yaml';
import {
  SCRIPT_USE_IN_FEATURE_BATCH,
  SCRIPT_USE_IN_FEATURE_OPTIONS,
  SCRIPT_USE_IN_FEATURE_STREAMING,
} from './constants.js';
import { type CodeType, updateConfig } from './nativeScan.js';

const debug = debuglog('datacustomcode');

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-data-code-extension', 'datacodeBinaryExecutor');

export type NativeInitOptions = {
  codeType: CodeType;
  packageDir: string;
  /** Directory containing the `datacustomcode` package (site-packages, or `src/` for editable installs). */
  pythonPackageLocation: string;
  pythonPackageVersion: string;
  useInFeature?: string;
};

export type NativeInitResult = {
  filesCreated: string[];
  configPath: string;
  testJsonPath?: string;
};

const ENTRYPOINT_FILE = 'entrypoint.py';
const CONFIG_FILE = 'config.json';
const PAYLOAD_DIR = 'payload';
const TESTS_DIR = 'tests';
const TEST_FILE = 'test.json';
const SDK_CONFIG_DIR = '.datacustomcode_proj';
const SDK_CONFIG_FILE = 'sdk_config.json';
// Mirror of `datacustomcode/template.py`: the streaming example entrypoint, and the SDK's
// run config, which streaming packages get a copy of with the local delta reader/writer.
const STREAMING_EXAMPLE_ENTRYPOINT = path.join('examples', 'streaming_deltas', ENTRYPOINT_FILE);
// First SDK major version that ships the streaming template.
const STREAMING_MIN_SDK_MAJOR = 7;
const SDK_RUN_CONFIG_FILE = 'config.yaml';

const FEATURE_TEMPLATE_MAPPING: Readonly<Record<string, string>> = {
  SearchIndexChunking: 'chunking',
};

const FEATURE_TEMPLATE_DIRS = new Set<string>(Object.values(FEATURE_TEMPLATE_MAPPING));

/**
 * Native TypeScript implementation of `datacustomcode init`. Replaces the spawn-based
 * call in InitBase; matches the behavior of datacustomcode/cli.py:init.
 *
 * Steps:
 * 1. Copy the `script` or `function` template from the installed Python package
 * into the target package directory.
 * 2. Write `<packageDir>/.datacustomcode_proj/sdk_config.json` with the package type.
 * 3. Generate the initial `config.json` next to the entrypoint (with sdkVersion for
 * scripts), then re-scan the entrypoint to fill in DLO/DMO permissions.
 * 4. For function packages, best-effort generate `tests/test.json` for known features.
 */
export async function executeNativeInit(opts: NativeInitOptions): Promise<NativeInitResult> {
  const { codeType, packageDir, pythonPackageLocation, pythonPackageVersion, useInFeature } = opts;
  const sdkDir = path.join(pythonPackageLocation, 'datacustomcode');
  const templatesDir = path.join(sdkDir, 'templates');
  const filesCreated: string[] = [];
  const streaming = codeType === 'script' && resolveScriptFeature(useInFeature) === SCRIPT_USE_IN_FEATURE_STREAMING;

  // 1. Copy template
  if (codeType === 'script') {
    const scriptTemplateDir = path.join(templatesDir, 'script');
    // Check before copying anything so an older SDK leaves no half-initialized package.
    if (streaming) await ensureStreamingTemplateExists(scriptTemplateDir, pythonPackageVersion);
    await copyScriptTemplate(scriptTemplateDir, packageDir);
    if (streaming) {
      await fs.copyFile(
        path.join(scriptTemplateDir, STREAMING_EXAMPLE_ENTRYPOINT),
        path.join(packageDir, PAYLOAD_DIR, ENTRYPOINT_FILE)
      );
      await writeStreamingRunConfig(path.join(sdkDir, SDK_RUN_CONFIG_FILE), path.join(packageDir, SDK_RUN_CONFIG_FILE));
    }
  } else {
    await copyFunctionTemplate(path.join(templatesDir, 'function'), packageDir, useInFeature);
  }
  filesCreated.push(packageDir);

  const entrypointPath = path.join(packageDir, PAYLOAD_DIR, ENTRYPOINT_FILE);
  const configPath = path.join(path.dirname(entrypointPath), CONFIG_FILE);

  // 2. Write SDK config
  await writeSdkConfig(packageDir, { type: codeType });

  // 3. Generate initial config.json, then update with scan results
  const initialConfig = buildInitialConfig(codeType, entrypointPath, pythonPackageVersion, streaming);
  await writeJson(configPath, initialConfig);

  const finalConfig = await updateConfig(entrypointPath, codeType, configPath);
  await writeJson(configPath, finalConfig);

  // 4. Function: best-effort test.json
  let testJsonPath: string | undefined;
  if (codeType === 'function') {
    testJsonPath = await generateFunctionTestFile(entrypointPath, useInFeature);
  }

  return { filesCreated, configPath, testJsonPath };
}

/** Mirror of `datacustomcode/cli.py:init` for scripts: defaults to BatchTransform, rejects unknown values. */
function resolveScriptFeature(useInFeature: string | undefined): string {
  const feature = useInFeature ?? SCRIPT_USE_IN_FEATURE_BATCH;
  if (!SCRIPT_USE_IN_FEATURE_OPTIONS.includes(feature)) {
    throw new SfError(
      messages.getMessage('error.initInvalidScriptFeature', [feature, SCRIPT_USE_IN_FEATURE_OPTIONS.join(', ')]),
      'InvalidUseInFeature'
    );
  }
  return feature;
}

async function ensureStreamingTemplateExists(scriptTemplateDir: string, sdkVersion: string): Promise<void> {
  const entrypoint = path.join(scriptTemplateDir, STREAMING_EXAMPLE_ENTRYPOINT);
  if (!(await pathExists(entrypoint))) {
    // 7.0.0+ ships the template, so a missing file there is an install problem, not an old SDK.
    if (Number.parseInt(sdkVersion, 10) >= STREAMING_MIN_SDK_MAJOR) {
      throw new SfError(
        messages.getMessage('error.initTemplateNotFound', [entrypoint]),
        'InitTemplateNotFound',
        messages.getMessages('actions.initTemplateNotFound')
      );
    }
    throw new SfError(
      messages.getMessage('error.initStreamingTemplateNotFound', [sdkVersion, entrypoint]),
      'InitStreamingTemplateNotFound',
      messages.getMessages('actions.initStreamingTemplateNotFound')
    );
  }
}

/**
 * Mirror of `datacustomcode/template.py:_write_streaming_config_yaml`: copy the SDK's
 * config.yaml with the reader/writer switched to the local delta implementations. Edited
 * as a YAML document so comments and formatting in the SDK file are kept.
 */
async function writeStreamingRunConfig(sourcePath: string, destinationPath: string): Promise<void> {
  const doc = parseDocument(await fs.readFile(sourcePath, 'utf8'));
  doc.setIn(['reader_config', 'type_config_name'], 'LocalDeltasReader');
  doc.setIn(['writer_config', 'type_config_name'], 'LocalDeltasWriter');
  debug('streaming run config: %s -> %s', sourcePath, destinationPath);
  await fs.writeFile(destinationPath, doc.toString(), 'utf8');
}

async function copyTemplateEntries(
  entries: Array<{ name: string; src: string; dst: string }>,
  label: string
): Promise<void> {
  await Promise.all(
    entries.map(async ({ src, dst }) => {
      debug('%s: %s -> %s', label, src, dst);
      await fs.cp(src, dst, { recursive: true, force: true });
    })
  );
}

async function copyScriptTemplate(sourceDir: string, targetDir: string): Promise<void> {
  await ensureTemplateExists(sourceDir);
  await fs.mkdir(targetDir, { recursive: true });
  const entries = (await fs.readdir(sourceDir, { withFileTypes: true })).map((entry) => ({
    name: entry.name,
    src: path.join(sourceDir, entry.name),
    dst: path.join(targetDir, entry.name),
  }));
  await copyTemplateEntries(entries, 'copy');
}

async function copyFunctionTemplate(
  sourceDir: string,
  targetDir: string,
  useInFeature: string | undefined
): Promise<void> {
  await ensureTemplateExists(sourceDir);
  await fs.mkdir(targetDir, { recursive: true });

  // First pass: copy everything except feature-specific subdirs
  const baseEntries = (await fs.readdir(sourceDir, { withFileTypes: true }))
    .filter((entry) => !(entry.isDirectory() && FEATURE_TEMPLATE_DIRS.has(entry.name)))
    .map((entry) => ({
      name: entry.name,
      src: path.join(sourceDir, entry.name),
      dst: path.join(targetDir, entry.name),
    }));
  await copyTemplateEntries(baseEntries, 'copy');

  // Second pass: overlay feature-specific files (if mapped)
  if (useInFeature && FEATURE_TEMPLATE_MAPPING[useInFeature]) {
    const featureDir = path.join(sourceDir, FEATURE_TEMPLATE_MAPPING[useInFeature]);
    if (await pathExists(featureDir)) {
      const featureEntries = (await fs.readdir(featureDir, { withFileTypes: true })).map((entry) => ({
        name: entry.name,
        src: path.join(featureDir, entry.name),
        dst: path.join(targetDir, entry.name),
      }));
      await copyTemplateEntries(featureEntries, 'feature copy');
    }
  }
}

async function ensureTemplateExists(templateDir: string): Promise<void> {
  if (!(await pathExists(templateDir))) {
    throw new SfError(
      messages.getMessage('error.initTemplateNotFound', [templateDir]),
      'InitTemplateNotFound',
      messages.getMessages('actions.initTemplateNotFound')
    );
  }
}

async function writeSdkConfig(baseDir: string, config: Record<string, unknown>): Promise<void> {
  const sdkConfigDir = path.join(baseDir, SDK_CONFIG_DIR);
  await fs.mkdir(sdkConfigDir, { recursive: true });
  await writeJson(path.join(sdkConfigDir, SDK_CONFIG_FILE), config);
}

function buildInitialConfig(
  codeType: CodeType,
  entrypointPath: string,
  sdkVersion: string,
  streaming: boolean
): Record<string, unknown> {
  if (codeType === 'script') {
    // Mirror of DATA_TRANSFORM_CONFIG_TEMPLATE / STREAMING_TRANSFORM_CONFIG_TEMPLATE in `datacustomcode/scan.py`.
    return {
      sdkVersion,
      entryPoint: path.basename(entrypointPath),
      dataspace: 'default',
      ...(streaming ? { streamingSource: { type: 'dlo', name: '' } } : {}),
      permissions: {
        read: {},
        write: {},
      },
    };
  }
  return { entryPoint: path.basename(entrypointPath) };
}

/**
 * Function packages: write a sample `tests/test.json` for known feature types.
 * Best-effort — failure does not fail init (matches Python try/except behavior).
 */
async function generateFunctionTestFile(
  entrypointPath: string,
  useInFeature: string | undefined
): Promise<string | undefined> {
  const sample = sampleRequestForFeature(useInFeature);
  if (!sample) {
    debug('no sample test.json available for feature: %s', useInFeature);
    return undefined;
  }

  try {
    const testsDir = path.join(path.dirname(entrypointPath), TESTS_DIR);
    await fs.mkdir(testsDir, { recursive: true });
    const testJsonPath = path.join(testsDir, TEST_FILE);
    await writeJson(testJsonPath, sample);
    return testJsonPath;
  } catch (err) {
    debug('failed to write test.json: %o', err);
    return undefined;
  }
}

function sampleRequestForFeature(useInFeature: string | undefined): Record<string, unknown> | undefined {
  // Mirrors Python's `_generate_model_sample_data` output for SearchIndexChunkingV1Request.
  // Values come from the Pydantic field examples on `chunking.py`; pydantic coerces the
  // example strings ("1.0", "8.75") to floats during model_dump.
  //
  // The keys below are snake_case + `__c` Salesforce field names that the wire format
  // requires verbatim. Disabling camelcase here is the right tradeoff: prettier's
  // `quoteProps: as-needed` reformats quoted keys back to identifiers, so we can't keep
  // them quoted to satisfy eslint without also tweaking prettier config repo-wide.
  if (useInFeature !== 'SearchIndexChunking') return undefined;
  return JSON.parse(`{
    "input": [
      {
        "text": "Online Remittance Instructions\\n\\nTransfer proceeds from the sale of your ESOP/RSUs easily.",
        "metadata": {
          "type": "text",
          "page_number": 1,
          "transcript_fields": {
            "speaker": "Agent",
            "start_timestamp": 1.0,
            "end_timestamp": 8.75
          },
          "text_as_html": "<p>Online Remittance Instructions</p>",
          "source_dmo_fields": {
            "FilePath__c": "quarterly_report.pdf",
            "Size__c": 1377454.0,
            "ContentType__c": "pdf",
            "LastModified__c": "2026-03-25T02:01:24.918000"
          },
          "prepend": [
            {
              "dmo_name": "udmo_1__dlm",
              "field_name": "ResolvedFilePath__c",
              "value": "udlo_1__dll:quarterly_report.pdf"
            }
          ],
          "image_base64": "sample_image_base64",
          "image_mime_type": "image/png",
          "image_type": "diagram"
        }
      }
    ]
  }`) as Record<string, unknown>;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}
