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
import { type CodeType, updateConfig } from './nativeScan.js';

const debug = debuglog('datacustomcode');

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-data-code-extension', 'datacodeBinaryExecutor');

export type NativeInitOptions = {
  codeType: CodeType;
  packageDir: string;
  pythonPackageLocation: string;
  pythonPackageVersion: string;
  useInFeature?: string;
};

export type NativeInitResult = {
  filesCreated: string[];
  configPath: string;
};

const ENTRYPOINT_FILE = 'entrypoint.py';
const CONFIG_FILE = 'config.json';
const PAYLOAD_DIR = 'payload';
const SDK_CONFIG_DIR = '.datacustomcode_proj';
const SDK_CONFIG_FILE = 'sdk_config.json';

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
 */
export async function executeNativeInit(opts: NativeInitOptions): Promise<NativeInitResult> {
  const { codeType, packageDir, pythonPackageLocation, pythonPackageVersion, useInFeature } = opts;
  const templatesDir = path.join(pythonPackageLocation, 'datacustomcode', 'templates');
  const filesCreated: string[] = [];

  // 1. Copy template
  if (codeType === 'script') {
    await copyScriptTemplate(path.join(templatesDir, 'script'), packageDir);
  } else {
    await copyFunctionTemplate(path.join(templatesDir, 'function'), packageDir, useInFeature);
  }
  filesCreated.push(packageDir);

  const entrypointPath = path.join(packageDir, PAYLOAD_DIR, ENTRYPOINT_FILE);
  const configPath = path.join(path.dirname(entrypointPath), CONFIG_FILE);

  // 2. Write SDK config
  await writeSdkConfig(packageDir, { type: codeType });

  // 3. Generate initial config.json, then update with scan results
  const initialConfig = buildInitialConfig(codeType, entrypointPath, pythonPackageVersion);
  await writeJson(configPath, initialConfig);

  const finalConfig = await updateConfig(entrypointPath, codeType, configPath);
  await writeJson(configPath, finalConfig);

  return { filesCreated, configPath };
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

function buildInitialConfig(codeType: CodeType, entrypointPath: string, sdkVersion: string): Record<string, unknown> {
  if (codeType === 'script') {
    return {
      sdkVersion,
      entryPoint: path.basename(entrypointPath),
      dataspace: 'default',
      permissions: {
        read: {},
        write: {},
      },
    };
  }
  return { entryPoint: path.basename(entrypointPath) };
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
