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
import { promises as fs, createReadStream, statSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import path from 'node:path';
import { debuglog } from 'node:util';
import { Messages, SfError, type Connection } from '@salesforce/core';
import { findBaseDirectory, getPackageType, type CodeType } from './nativeScan.js';
import { zipWithSfError, ZIP_FILE_NAME, type ZipResult } from './zipBuilder.js';

const debug = debuglog('datacustomcode');

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-data-code-extension', 'deploy');

// Mirror of the Data Cloud REST paths in `datacustomcode/deploy.py`. Kept at
// v63.0 to match the SDK's `main` branch (streaming / v67.0 is out of scope).
const DATA_CUSTOM_CODE_PATH = 'services/data/v63.0/ssot/data-custom-code';
const DATA_TRANSFORMS_PATH = 'services/data/v63.0/ssot/data-transforms';
// Python waits up to 3000 *seconds* (`WAIT_FOR_DEPLOYMENT_TIMEOUT`), polling once a second.
const WAIT_FOR_DEPLOYMENT_TIMEOUT_MS = 3000 * 1000;
const POLL_INTERVAL_MS = 1000;
const ENTRYPOINT_FILE = 'entrypoint.py';
const CONFIG_FILE = 'config.json';
const DEFAULT_NETWORK = 'default';

/**
 * Maps the user-facing `--cpu-size` value to the Data Cloud wire compute type.
 * The offset (e.g. CPU_2XL -> CPU_M) is intentional and must match exactly; it
 * mirrors `COMPUTE_TYPES` in `datacustomcode/deploy.py`, so do not "correct" it.
 */
export const COMPUTE_TYPES: Record<string, string> = {
  CPU_L: 'CPU_XS',
  CPU_XL: 'CPU_S',
  CPU_2XL: 'CPU_M',
  CPU_4XL: 'CPU_L',
};

// Mirror of the two lookup tables in `datacustomcode/constants.py` that the
// function-deploy path relies on.
const USE_IN_FEATURE_MAPPING_FOR_CONNECT_API: Record<string, string> = {
  SearchIndexChunking: 'UnstructuredChunking',
};
const REQUEST_TYPE_TO_FEATURE: Record<string, string> = {
  SearchIndexChunkingV1Request: 'SearchIndexChunking',
  SearchIndexChunkingV1Response: 'SearchIndexChunking',
};

// Deployment statuses that mean the deployment will never reach "Deployed".
// Python only breaks on "Deployed" and otherwise relies on the 3000s timeout;
// fast-failing on a known-terminal status is strictly an improvement — an
// unrecognized status simply keeps polling, matching the original behavior.
const TERMINAL_FAILURE_STATUSES = new Set(['failed', 'error', 'deploymentfailed', 'cancelled', 'canceled']);

export type CodeExtensionMetadata = {
  name: string;
  version: string;
  description: string;
  computeType: string;
  codeType: CodeType;
  functionInvokeOptions?: string[];
};

export type CreateDeploymentResponse = {
  fileUploadUrl: string;
};

export type Permission = { dlo?: string[]; dmo?: string[] };

export type DataObjectField = {
  name: string;
  label: string;
  dataType: string;
  isPrimaryKey?: boolean;
  keyQualifierFieldName?: string | null;
};

export type DataObject = {
  name: string;
  label: string;
  type: string;
  category: string;
  fields: DataObjectField[];
};

export type DataTransformConfig = {
  entryPoint: string;
  sdkVersion: string;
  dataspace: string;
  permissions: { read: Permission; write: Permission };
  dataObjects?: DataObject[];
};

export type FunctionConfig = {
  entryPoint: string;
};

export type NativeDeployOptions = {
  name: string;
  version: string;
  description: string;
  /** The `--package-dir` value (Python's `--path`, e.g. `payload`). */
  packageDir: string;
  /** One of the COMPUTE_TYPES keys (CPU_L | CPU_XL | CPU_2XL | CPU_4XL). */
  cpuSize: string;
  /** Docker network passed through to the zip/dependency build. Defaults to `default`. */
  network?: string;
  /** Authenticated org connection used for the Data Cloud REST calls. */
  connection: Connection;
  log?: (message: string) => void;
};

export type NativeDeployResult = {
  success: boolean;
  codeType: CodeType;
  name: string;
  version: string;
  status: string;
};

/**
 * Injectable seams so the orchestration can be unit-tested without a live org,
 * a docker daemon, or a real presigned URL. Production callers get defaults
 * built from the org connection via {@link buildDefaultDeps}.
 */
export type NativeDeployDeps = {
  createDeployment: (metadata: CodeExtensionMetadata) => Promise<CreateDeploymentResponse>;
  getDeploymentStatus: (name: string) => Promise<string>;
  createDataTransform: (body: unknown) => Promise<unknown>;
  uploadZip: (fileUploadUrl: string, zipPath: string) => Promise<void>;
  zip: (directory: string, dockerNetwork: string, log?: (m: string) => void) => Promise<ZipResult>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};

/**
 * Mirror of `_sanitize_api_name` in `datacustomcode/deploy.py`: replace spaces
 * and hyphens with underscores, drop any remaining non-word character, collapse
 * runs of underscores, then strip leading/trailing underscores.
 */
export function sanitizeApiName(name: string): string {
  return name
    .replace(/[ -]/g, '_')
    .replace(/[^\w]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Mirror of `CodeExtensionMetadata.__init__`: sanitize the name (logging when
 * it changed) and reject names that sanitize to empty or don't begin with a
 * letter.
 */
export function buildMetadata(
  input: { name: string; version: string; description: string; computeType: string; codeType: CodeType },
  log: (message: string) => void = (): void => {}
): CodeExtensionMetadata {
  const sanitized = sanitizeApiName(input.name);
  if (sanitized !== input.name) {
    log(messages.getMessage('info.nameSanitized', [input.name, sanitized]));
  }
  if (!sanitized) {
    throw new SfError(messages.getMessage('error.invalidApiName', [input.name]), 'InvalidApiName');
  }
  if (!/^[A-Za-z]/.test(sanitized)) {
    throw new SfError(messages.getMessage('error.apiNameMustStartWithLetter', [sanitized]), 'InvalidApiName');
  }
  return {
    name: sanitized,
    version: input.version,
    description: input.description,
    computeType: input.computeType,
    codeType: input.codeType,
  };
}

/**
 * Reduce a Python annotation expression to the type name AST parsing would
 * yield: for `Base[...]` return the name of `Base`; for `mod.Type` return
 * `Type`; for a bare name return it unchanged. Mirrors `_get_type_name_from_ast`.
 */
function typeNameFromAnnotation(annotation: string): string {
  const base = annotation.split('[')[0].trim();
  const segments = base.split('.');
  return segments[segments.length - 1].trim();
}

function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch === separator && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

function indexOfTopLevel(text: string, target: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === target && depth === 0) return i;
  }
  return -1;
}

/**
 * Static, dependency-free extraction of the `function` entrypoint's first
 * parameter type and return type. TypeScript equivalent of
 * `inspect_function_types_static`; returns undefined names on any parse miss so
 * callers degrade to "no inference" exactly like the Python `except: return
 * (None, None)`.
 */
export function inspectFunctionTypesStatic(source: string): {
  requestTypeName?: string;
  responseTypeName?: string;
} {
  const marker = /def\s+function\s*\(/.exec(source);
  if (!marker) return {};

  // Walk from just after the opening paren to its matching close, tracking depth
  // so nested brackets in annotations don't end the parameter list early.
  const open = marker.index + marker[0].length;
  let depth = 1;
  let i = open;
  for (; i < source.length && depth > 0; i++) {
    const ch = source[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
  }
  const paramList = source.slice(open, i - 1);
  const rest = source.slice(i);

  let requestTypeName: string | undefined;
  const firstParam = splitTopLevel(paramList, ',')[0] ?? '';
  const colon = indexOfTopLevel(firstParam, ':');
  if (colon >= 0) {
    let annotation = firstParam.slice(colon + 1);
    const eq = indexOfTopLevel(annotation, '=');
    if (eq >= 0) annotation = annotation.slice(0, eq);
    annotation = annotation.trim();
    if (annotation) requestTypeName = typeNameFromAnnotation(annotation);
  }

  let responseTypeName: string | undefined;
  const returnMatch = /^\s*->\s*([^:]+):/.exec(rest);
  if (returnMatch) {
    const annotation = returnMatch[1].trim();
    if (annotation) responseTypeName = typeNameFromAnnotation(annotation);
  }

  return { requestTypeName, responseTypeName };
}

/**
 * Mirror of `infer_use_in_feature`: both the request and response type must map
 * to the same feature. Returns undefined when they don't (or can't be read).
 */
export async function inferUseInFeature(entrypointPath: string): Promise<string | undefined> {
  let source: string;
  try {
    source = await fs.readFile(entrypointPath, 'utf8');
  } catch (err) {
    debug('could not read entrypoint for feature inference at %s: %o', entrypointPath, err);
    return undefined;
  }

  const { requestTypeName, responseTypeName } = inspectFunctionTypesStatic(source);
  if (!requestTypeName || !responseTypeName) return undefined;

  const requestFeature = REQUEST_TYPE_TO_FEATURE[requestTypeName];
  const responseFeature = REQUEST_TYPE_TO_FEATURE[responseTypeName];
  if (requestFeature && responseFeature && requestFeature === responseFeature) {
    return requestFeature;
  }
  return undefined;
}

function permissionEntries(perm: Permission): string[] {
  // DLO takes precedence, matching pydantic's `Union[DloPermission, DmoPermission]`.
  return perm.dlo ?? perm.dmo ?? [];
}

function dataObjectToOutput(obj: DataObject): Record<string, unknown> {
  const fields = obj.fields.map((field) => {
    const entry: Record<string, unknown> = {
      isPrimaryKey: field.isPrimaryKey ?? false,
      label: field.label,
      name: field.name,
      type: field.dataType,
    };
    if (field.keyQualifierFieldName !== undefined && field.keyQualifierFieldName !== null) {
      entry.keyQualifierField = field.keyQualifierFieldName;
    }
    return entry;
  });
  return {
    category: obj.category,
    fields,
    label: obj.label,
    name: obj.name,
    type: obj.type,
  };
}

/**
 * Mirror of `create_data_transform`'s body assembly. Builds a fresh manifest per
 * call (the Python original shallow-copies a module-level template, which shares
 * nested dicts across calls — avoided here on purpose).
 */
export function buildDataTransformBody(
  metadata: CodeExtensionMetadata,
  config: DataTransformConfig
): Record<string, unknown> {
  const nodes: Record<string, unknown> = {};
  /* eslint-disable camelcase -- Data Cloud dbt-style manifest uses snake_case wire keys */
  permissionEntries(config.permissions.write).forEach((name, idx) => {
    nodes[`node${idx + 1}`] = {
      relation_name: name,
      config: { materialized: 'table' },
      compiled_code: '',
    };
  });

  const sources: Record<string, unknown> = {};
  permissionEntries(config.permissions.read).forEach((name, idx) => {
    sources[`source${idx + 1}`] = { relation_name: name };
  });
  /* eslint-enable camelcase */

  const manifest = {
    nodes,
    sources,
    macros: {
      'macro.byoc': {
        arguments: [{ name: metadata.name, type: 'BYOC_SCRIPT' }],
      },
    },
  };

  const definition: Record<string, unknown> = {
    type: 'DCSQL',
    manifest,
    version: '56.0',
  };

  // outputDataObjects is required only for DMO-backed transforms.
  if (config.permissions.write.dmo !== undefined) {
    if (!config.dataObjects || config.dataObjects.length === 0) {
      throw new SfError(messages.getMessage('error.dmoRequiresDataObjects'), 'InvalidConfig');
    }
    definition.outputDataObjects = config.dataObjects.map(dataObjectToOutput);
  }

  return {
    definition,
    label: metadata.name,
    name: metadata.name,
    type: 'BATCH',
    dataSpaceName: config.dataspace,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parsePermissionSide(value: unknown, configPath: string): Permission {
  if (!isRecord(value)) {
    throw new SfError(
      messages.getMessage('error.configInvalid', [configPath, 'each permissions entry must be an object']),
      'InvalidConfig'
    );
  }
  const hasDlo = Array.isArray(value.dlo);
  const hasDmo = Array.isArray(value.dmo);
  if (hasDlo === hasDmo) {
    throw new SfError(
      messages.getMessage('error.configInvalid', [
        configPath,
        "each permissions entry must contain exactly one of 'dlo' or 'dmo'",
      ]),
      'InvalidConfig'
    );
  }
  return hasDlo ? { dlo: value.dlo as string[] } : { dmo: value.dmo as string[] };
}

function validateDataTransformConfig(parsed: unknown, configPath: string): DataTransformConfig {
  if (!isRecord(parsed)) {
    throw new SfError(
      messages.getMessage('error.configInvalid', [configPath, 'expected a JSON object']),
      'InvalidConfig'
    );
  }

  const missing = (['entryPoint', 'sdkVersion', 'dataspace', 'permissions'] as const).filter(
    (key) => parsed[key] === undefined
  );
  if (missing.length > 0) {
    throw new SfError(
      messages.getMessage('error.configMissingFields', [configPath, missing.join(', ')]),
      'InvalidConfig'
    );
  }

  const permissions = parsed.permissions;
  if (!isRecord(permissions) || permissions.read === undefined || permissions.write === undefined) {
    throw new SfError(
      messages.getMessage('error.configInvalid', [configPath, "permissions must define both 'read' and 'write'"]),
      'InvalidConfig'
    );
  }

  const read = parsePermissionSide(permissions.read, configPath);
  const write = parsePermissionSide(permissions.write, configPath);

  // Mirror of Permissions._no_mixed_layers: read/write must both be DLO or both DMO.
  const readIsDlo = read.dlo !== undefined;
  const writeIsDlo = write.dlo !== undefined;
  if (readIsDlo !== writeIsDlo) {
    throw new SfError(
      messages.getMessage('error.configInvalid', [
        configPath,
        'permissions.read and permissions.write must both reference DLOs or both reference DMOs',
      ]),
      'InvalidConfig'
    );
  }

  return {
    entryPoint: String(parsed.entryPoint),
    sdkVersion: String(parsed.sdkVersion),
    dataspace: String(parsed.dataspace),
    permissions: { read, write },
    dataObjects: parsed.dataObjects as DataObject[] | undefined,
  };
}

function validateFunctionConfig(parsed: unknown, configPath: string): FunctionConfig {
  if (!isRecord(parsed) || typeof parsed.entryPoint !== 'string') {
    throw new SfError(messages.getMessage('error.configMissingFields', [configPath, 'entryPoint']), 'InvalidConfig');
  }
  return { entryPoint: parsed.entryPoint };
}

/**
 * Mirror of `get_config`: read `<packageDir>/config.json`, then validate against
 * the shape implied by the package type. Surfaces friendly, actionable errors
 * for missing file / bad JSON / missing fields.
 */
export async function getConfig(
  packageDir: string,
  packageType: CodeType
): Promise<DataTransformConfig | FunctionConfig> {
  const configPath = path.join(packageDir, CONFIG_FILE);
  let raw: string;
  try {
    raw = await fs.readFile(configPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new SfError(
        messages.getMessage('error.configNotFound', [configPath]),
        'ConfigNotFound',
        // getMessages consumes tokens sequentially across the action lines, so pass the
        // package type once per '%s' (one in each of the two lines).
        messages.getMessages('actions.configNotFound', [packageType, packageType])
      );
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SfError(messages.getMessage('error.configInvalidJson', [configPath]), 'InvalidConfig');
  }

  return packageType === 'script'
    ? validateDataTransformConfig(parsed, configPath)
    : validateFunctionConfig(parsed, configPath);
}

function extractStatusCode(err: unknown): number | undefined {
  const e = err as { statusCode?: number; status?: number; errorCode?: string; name?: string };
  if (typeof e?.statusCode === 'number') return e.statusCode;
  if (typeof e?.status === 'number') return e.status;
  const fromCode = /\b(\d{3})\b/.exec(`${e?.errorCode ?? ''} ${e?.name ?? ''}`);
  return fromCode ? Number(fromCode[1]) : undefined;
}

/**
 * Detect the 409 conflict `create_deployment` maps to a friendly "name exists"
 * error. jsforce's thrown error shape varies for non-standard endpoints, so we
 * check status code, error code, and message defensively; an unrecognized
 * conflict simply surfaces as the raw error (still a failure, never a silent
 * success).
 */
function isConflictError(err: unknown): boolean {
  if (extractStatusCode(err) === 409) return true;
  const e = err as { errorCode?: string; name?: string; message?: string };
  if (typeof e?.errorCode === 'string' && /409|DUPLICATE|CONFLICT|EXIST/i.test(e.errorCode)) return true;
  if (typeof e?.name === 'string' && /409|conflict/i.test(e.name)) return true;
  return typeof e?.message === 'string' && /\b409\b|already exists|duplicate/i.test(e.message);
}

/**
 * Decode one numeric character reference to its code point, leaving the raw
 * entity untouched if the code point is invalid. `String.fromCodePoint` throws
 * `RangeError` for out-of-range or NaN inputs (e.g. `&#9999999999;`); swallowing
 * it here matches Python's `html.unescape`, which never raises.
 */
function decodeCodePoint(entity: string, code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return entity;
  }
}

/** Minimal `html.unescape` covering the entities a presigned URL can contain. */
export function htmlUnescape(input: string): string {
  return input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&#(\d+);/g, (match: string, dec: string) => decodeCodePoint(match, Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (match: string, hex: string) => decodeCodePoint(match, parseInt(hex, 16)))
    .replace(/&amp;/g, '&'); // must run last so we don't double-decode
}

/**
 * PUT the built zip to the presigned URL. Mirrors `upload_zip`: no auth header,
 * `Content-Type: application/zip`, and the URL is HTML-unescaped first.
 */
async function defaultUploadZip(fileUploadUrl: string, zipPath: string): Promise<void> {
  const url = new URL(htmlUnescape(fileUploadUrl));
  // Presigned upload URLs are always HTTPS; refuse to PUT the package (customer
  // code) over plaintext if a non-HTTPS URL is ever returned.
  if (url.protocol !== 'https:') {
    throw new SfError(messages.getMessage('error.insecureUploadUrl', [url.protocol]), 'InsecureUploadUrl');
  }
  const size = statSync(zipPath).size;

  await new Promise<void>((resolve, reject) => {
    const req = httpsRequest(
      url,
      { method: 'PUT', headers: { 'Content-Type': 'application/zip', 'Content-Length': size } },
      (res) => {
        const status = res.statusCode ?? 0;
        let responseBody = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          responseBody += chunk;
        });
        res.on('end', () => {
          if (status >= 200 && status < 300) {
            resolve();
          } else {
            reject(
              new SfError(
                messages.getMessage('error.uploadFailed', [String(status), responseBody.slice(0, 500)]),
                'UploadFailed'
              )
            );
          }
        });
      }
    );
    req.on('error', reject);
    const source = createReadStream(zipPath);
    source.on('error', reject);
    source.pipe(req);
  });
}

async function requestJson<T>(
  connection: Connection,
  method: 'GET' | 'POST',
  urlPath: string,
  body?: unknown
): Promise<T> {
  return connection.request<T>({
    method,
    url: `/${urlPath}`,
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  });
}

function defaultCreateDeployment(connection: Connection): NativeDeployDeps['createDeployment'] {
  return async (metadata: CodeExtensionMetadata): Promise<CreateDeploymentResponse> => {
    const body: Record<string, unknown> = {
      label: metadata.name,
      name: metadata.name,
      description: metadata.description,
      version: metadata.version,
      computeType: metadata.computeType,
      codeType: metadata.codeType,
    };
    if (metadata.functionInvokeOptions && metadata.functionInvokeOptions.length > 0) {
      body.functionInvokeOptions = metadata.functionInvokeOptions;
    }

    let response: CreateDeploymentResponse;
    try {
      response = await requestJson<CreateDeploymentResponse>(connection, 'POST', DATA_CUSTOM_CODE_PATH, body);
    } catch (err) {
      if (isConflictError(err)) {
        throw new SfError(messages.getMessage('error.deploymentExists', [metadata.name]), 'DeploymentExists');
      }
      throw err;
    }

    if (!response?.fileUploadUrl) {
      throw new SfError(messages.getMessage('error.emptyDeploymentResponse'), 'EmptyResponse');
    }
    return response;
  };
}

function defaultGetDeploymentStatus(connection: Connection): NativeDeployDeps['getDeploymentStatus'] {
  return async (name: string): Promise<string> => {
    const response = await requestJson<{ deploymentStatus: string }>(
      connection,
      'GET',
      `${DATA_CUSTOM_CODE_PATH}/${encodeURIComponent(name)}`
    );
    return response.deploymentStatus;
  };
}

function defaultCreateDataTransform(connection: Connection): NativeDeployDeps['createDataTransform'] {
  return async (body: unknown): Promise<unknown> =>
    requestJson<unknown>(connection, 'POST', DATA_TRANSFORMS_PATH, body);
}

function buildDefaultDeps(connection: Connection, overrides: Partial<NativeDeployDeps>): NativeDeployDeps {
  return {
    createDeployment: overrides.createDeployment ?? defaultCreateDeployment(connection),
    getDeploymentStatus: overrides.getDeploymentStatus ?? defaultGetDeploymentStatus(connection),
    createDataTransform: overrides.createDataTransform ?? defaultCreateDataTransform(connection),
    uploadZip: overrides.uploadZip ?? defaultUploadZip,
    zip: overrides.zip ?? zipWithSfError,
    sleep: overrides.sleep ?? ((ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))),
    now: overrides.now ?? ((): number => Date.now()),
  };
}

function isTerminalFailureStatus(status: string): boolean {
  return TERMINAL_FAILURE_STATUSES.has(status.toLowerCase());
}

/**
 * Mirror of `wait_for_deployment`: poll status once a second, honoring the 3000s
 * timeout (checked after each fetch, as in Python). Resolves with the status
 * once it reaches "Deployed"; fast-fails on a known-terminal failure status.
 */
export async function waitForDeployment(
  name: string,
  deps: Pick<NativeDeployDeps, 'getDeploymentStatus' | 'sleep' | 'now'>,
  onStatus?: (status: string) => void
): Promise<string> {
  const start = deps.now();
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const status = await deps.getDeploymentStatus(name);
    if (deps.now() - start > WAIT_FOR_DEPLOYMENT_TIMEOUT_MS) {
      throw new SfError(messages.getMessage('error.deploymentTimedOut'), 'DeploymentTimedOut');
    }
    onStatus?.(status);
    if (status === 'Deployed') return status;
    if (isTerminalFailureStatus(status)) {
      throw new SfError(messages.getMessage('error.deploymentFailedStatus', [status]), 'DeploymentFailed');
    }
    // eslint-disable-next-line no-await-in-loop
    await deps.sleep(POLL_INTERVAL_MS);
  }
}

/**
 * Native TypeScript port of `deploy_full` + the `deploy` command in
 * `datacustomcode/cli.py`. Preserves the original ordering: validate config
 * first, create the deployment, build+upload the zip, wait for "Deployed", then
 * (scripts only) create the data transform.
 *
 * Exposed as a static method so command-level tests can stub the deploy step
 * without performing real Data Cloud REST calls or uploads.
 */
export class NativeDeployer {
  public static async deploy(
    opts: NativeDeployOptions,
    overrides: Partial<NativeDeployDeps> = {}
  ): Promise<NativeDeployResult> {
    const log = opts.log ?? ((): void => {});

    const computeType = COMPUTE_TYPES[opts.cpuSize];
    if (!computeType) {
      throw new SfError(
        messages.getMessage('error.invalidCpuSize', [opts.cpuSize, Object.keys(COMPUTE_TYPES).join(', ')]),
        'InvalidCpuSize'
      );
    }

    const baseDir = findBaseDirectory(opts.packageDir);
    const packageType = await getPackageType(baseDir);

    const metadata = buildMetadata(
      {
        name: opts.name,
        version: opts.version,
        description: opts.description,
        computeType,
        codeType: packageType,
      },
      log
    );

    if (packageType === 'function') {
      const entrypointPath = path.join(opts.packageDir, ENTRYPOINT_FILE);
      const feature = await inferUseInFeature(entrypointPath);
      if (!feature) {
        throw new SfError(messages.getMessage('error.functionSignatureMismatch'), 'FunctionSignatureMismatch');
      }
      log(messages.getMessage('info.inferredFeature', [feature]));
      metadata.functionInvokeOptions = [USE_IN_FEATURE_MAPPING_FOR_CONNECT_API[feature] ?? feature];
    }

    // Validate config.json up front so a bad package fails before any API call.
    const config = await getConfig(opts.packageDir, packageType);

    const deps = buildDefaultDeps(opts.connection, overrides);

    log(messages.getMessage('info.creatingDeployment', [metadata.name]));
    const deployment = await deps.createDeployment(metadata);

    log(messages.getMessage('info.zippingPackage'));
    await deps.zip(opts.packageDir, opts.network ?? DEFAULT_NETWORK, log);

    log(messages.getMessage('info.uploadingPackage'));
    await deps.uploadZip(deployment.fileUploadUrl, path.resolve(ZIP_FILE_NAME));

    log(messages.getMessage('info.waitingForDeployment'));
    const status = await waitForDeployment(metadata.name, deps, (s) =>
      log(messages.getMessage('info.deploymentStatusPolled', [s]))
    );

    if (packageType === 'script') {
      log(messages.getMessage('info.creatingDataTransform'));
      const body = buildDataTransformBody(metadata, config as DataTransformConfig);
      await deps.createDataTransform(body);
    }

    return {
      success: true,
      codeType: packageType,
      name: metadata.name,
      version: metadata.version,
      status,
    };
  }
}
