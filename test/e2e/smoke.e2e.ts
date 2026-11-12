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

/*
 * End-to-end smoke test.
 *
 * Drives the compiled plugin (bin/run.js) as a user would, through
 * init -> scan -> zip -> deploy (and run, for functions), against:
 *   - the real Python SDK installed in the active Python 3.11 environment, and
 *   - a local HTTPS mock of the Data Cloud custom code endpoints.
 *
 * Every artifact the plugin produces (config.json, requirements.txt, the zip
 * entry list, and the HTTP requests sent to the org) is compared with the
 * files under test/e2e/expected/. A behavior change shows up as a diff there.
 *
 * Re-record the expected files after an intentional change with:
 *   SMOKE_UPDATE_EXPECTED=true yarn test:e2e && yarn format
 *
 * Prerequisites: Python 3.11 on PATH as python3/python with
 * `pip install salesforce-data-customcode pipreqs` (scan shells out to
 * pipreqs, which the SDK does not install), and `openssl` on PATH (used to
 * mint a throwaway TLS certificate for the mock server). `yarn test:e2e`
 * compiles the plugin first.
 */
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'chai';
import { parse as parseYaml } from 'yaml';
import { listZipEntries, startMockDataCloud, type MockDataCloud, type RecordedRequest } from './mockDataCloud.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const BIN = path.join(REPO_ROOT, 'bin', 'run.js');
const EXPECTED_DIR = path.join(HERE, 'expected');
const FIXTURES_DIR = path.join(HERE, 'fixtures');
const UPDATE_EXPECTED = process.env.SMOKE_UPDATE_EXPECTED === 'true';
const USERNAME = 'smoke@example.com';

type CommandResult = { code: number | null; stdout: string; stderr: string };

let workDir: string;
let mock: MockDataCloud;
let childEnv: NodeJS.ProcessEnv;

/** Run the plugin asynchronously (the mock server lives in this process). */
function runPlugin(args: string[], cwd: string, env: NodeJS.ProcessEnv = {}): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], { cwd, env: { ...childEnv, ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function runOk(args: string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<CommandResult> {
  const result = await runPlugin(args, cwd, env);
  if (result.code !== 0) {
    throw new Error(
      `sf ${args.join(' ')} exited ${String(result.code)}\n--- stdout ---\n${result.stdout}\n--- stderr ---\n${
        result.stderr
      }`
    );
  }
  return result;
}

/** Replace values that legitimately vary between SDK releases. */
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        k === 'sdkVersion' ? '<sdk-version>' : normalize(v),
      ])
    );
  }
  return value;
}

/** Compare `actual` with test/e2e/expected/<name>, or record it in update mode. */
function expectMatches(name: string, actual: unknown): void {
  const file = path.join(EXPECTED_DIR, name);
  const normalized = normalize(actual);
  if (UPDATE_EXPECTED) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(normalized, null, 2)}\n`);
    return;
  }
  expect(existsSync(file), `missing expected file ${name}; record it with SMOKE_UPDATE_EXPECTED=true`).to.equal(true);
  expect(normalized, `${name} changed; if intentional, re-record with SMOKE_UPDATE_EXPECTED=true`).to.deep.equal(
    JSON.parse(readFileSync(file, 'utf8'))
  );
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8')) as unknown;
}

function readLines(file: string): string[] {
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function zipEntries(file: string): Promise<string[]> {
  return listZipEntries(readFileSync(file));
}

/** Parse the JSON block `function run` prints between its `RESULT:` banners. */
function parseRunResult(stdout: string): unknown {
  const match = /RESULT:\s*\n=+\s*\n([\s\S]*?)\n=+/.exec(stdout);
  if (!match) throw new Error(`no RESULT block in output:\n${stdout}`);
  return JSON.parse(match[1]) as unknown;
}

function requestsSince(start: number): RecordedRequest[] {
  return mock.requests.slice(start);
}

function makeTlsMaterial(dir: string): { key: Buffer; cert: Buffer; certPath: string } {
  const keyPath = path.join(dir, 'key.pem');
  const certPath = path.join(dir, 'cert.pem');
  const result = spawnSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-days',
      '1',
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
      '-addext',
      'basicConstraints=critical,CA:TRUE',
    ],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) {
    throw new Error(`openssl failed to create a test certificate: ${result.error?.message ?? result.stderr}`);
  }
  return { key: readFileSync(keyPath), cert: readFileSync(certPath), certPath };
}

/** Write a fake org auth so `--target-org` resolves to the mock server. */
function writeFakeOrgAuth(home: string, instanceUrl: string): void {
  const sfdx = path.join(home, '.sfdx');
  mkdirSync(sfdx, { recursive: true });
  mkdirSync(path.join(home, '.sf'), { recursive: true });
  writeFileSync(
    path.join(sfdx, `${USERNAME}.json`),
    JSON.stringify(
      {
        accessToken: 'smoke-test-access-token',
        instanceUrl,
        loginUrl: instanceUrl,
        orgId: '00D000000000000AAA',
        username: USERNAME,
        instanceApiVersion: '63.0',
      },
      null,
      2
    )
  );
}

describe('e2e smoke', function () {
  this.timeout(15 * 60 * 1000);

  before(async () => {
    expect(existsSync(path.join(REPO_ROOT, 'lib', 'index.js')), 'run `yarn compile` first').to.equal(true);
    workDir = mkdtempSync(path.join(tmpdir(), 'dce-smoke-'));
    const home = path.join(workDir, 'home');
    mkdirSync(home);

    const tls = makeTlsMaterial(workDir);
    mock = await startMockDataCloud(tls);
    writeFakeOrgAuth(home, mock.url);

    childEnv = {
      ...process.env,
      // Isolate CLI state from the developer's real orgs.
      HOME: home,
      USERPROFILE: home,
      SF_USE_GENERIC_UNIX_KEYCHAIN: 'true',
      SFDX_USE_GENERIC_UNIX_KEYCHAIN: 'true',
      SF_DISABLE_TELEMETRY: 'true',
      SF_AUTOUPDATE_DISABLE: 'true',
      SF_SKIP_NEW_VERSION_CHECK: 'true',
      SF_ORG_API_VERSION: '63.0',
      NODE_EXTRA_CA_CERTS: tls.certPath,
      FORCE_COLOR: '0',
      // Don't let `function run` add bytecode to the payload between steps.
      PYTHONDONTWRITEBYTECODE: '1',
    };
    // pyenv shims locate their root via $HOME; keep them working locally.
    const pyenvRoot = process.env.PYENV_ROOT ?? path.join(homedir(), '.pyenv');
    if (existsSync(pyenvRoot)) childEnv.PYENV_ROOT = pyenvRoot;
  });

  after(async () => {
    await mock?.close();
    if (workDir && !process.env.SMOKE_KEEP_WORKDIR) {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  describe('script', () => {
    let cwd: string;
    let pkg: string;

    before(() => {
      cwd = path.join(workDir, 'script');
      pkg = path.join(cwd, 'pkg');
      mkdirSync(cwd);
    });

    it('init scaffolds the package from the installed SDK', async () => {
      await runOk(['data-code-extension', 'script', 'init', '--package-dir', pkg], cwd);
      for (const f of ['payload/entrypoint.py', 'payload/config.json', 'requirements.txt']) {
        expect(existsSync(path.join(pkg, f)), f).to.equal(true);
      }
      expect(readJson(path.join(pkg, '.datacustomcode_proj', 'sdk_config.json'))).to.deep.include({ type: 'script' });
    });

    it('scan accepts the unmodified template entrypoint', async () => {
      await runOk(
        [
          'data-code-extension',
          'script',
          'scan',
          '--entrypoint',
          path.join(pkg, 'payload', 'entrypoint.py'),
          '--dry-run',
        ],
        cwd
      );
    });

    it('scan writes permissions for a known entrypoint', async () => {
      copyFileSync(path.join(FIXTURES_DIR, 'script', 'entrypoint.py'), path.join(pkg, 'payload', 'entrypoint.py'));
      await runOk(
        [
          'data-code-extension',
          'script',
          'scan',
          '--entrypoint',
          path.join(pkg, 'payload', 'entrypoint.py'),
          '--no-prompt',
        ],
        cwd
      );
      expectMatches('script/config.json', readJson(path.join(pkg, 'payload', 'config.json')));
      expectMatches('script/requirements.json', readLines(path.join(pkg, 'requirements.txt')));
    });

    it('zip packages the payload', async () => {
      await runOk(['data-code-extension', 'script', 'zip', '--package-dir', path.join(pkg, 'payload')], cwd);
      expectMatches('script/zip-entries.json', await zipEntries(path.join(cwd, 'deployment.zip')));
    });

    it('deploy sends the expected requests', async () => {
      const start = mock.requests.length;
      await runOk(
        [
          'data-code-extension',
          'script',
          'deploy',
          '--name',
          'smoke_script',
          '--package-version',
          '1.0.0',
          '--description',
          'Smoke test script',
          '--package-dir',
          path.join(pkg, 'payload'),
          '--target-org',
          USERNAME,
        ],
        cwd
      );
      expectMatches('script/requests.json', requestsSince(start));
    });
  });

  describe('streaming script', () => {
    let cwd: string;
    let pkg: string;
    const configPath = (): string => path.join(pkg, 'payload', 'config.json');
    const deployArgs = (): string[] => [
      'data-code-extension',
      'script',
      'deploy',
      '--name',
      'smoke_streaming',
      '--package-version',
      '1.0.0',
      '--description',
      'Smoke test streaming script',
      '--package-dir',
      path.join(pkg, 'payload'),
      '--target-org',
      USERNAME,
    ];

    before(() => {
      cwd = path.join(workDir, 'streaming');
      pkg = path.join(cwd, 'pkg');
      mkdirSync(cwd);
    });

    it('init scaffolds a StreamingTransform package', async () => {
      const result = await runOk(
        ['data-code-extension', 'script', 'init', '--package-dir', pkg, '--use-in-feature', 'StreamingTransform'],
        cwd
      );
      expect(result.stderr).to.include('streamingSource.name');

      // The entrypoint and its write target come from the SDK's streaming example, so
      // check the shape rather than exact content.
      const config = readJson(configPath()) as {
        streamingSource: unknown;
        permissions: { read: unknown; write: { dlo: string[] } };
      };
      expect(config.streamingSource).to.deep.equal({ type: 'dlo', name: '' });
      expect(config.permissions.read).to.deep.equal({ dlo: [] });
      expect(config.permissions.write.dlo).to.be.an('array').that.is.not.empty;

      const runConfig = parseYaml(readFileSync(path.join(pkg, 'config.yaml'), 'utf8')) as Record<
        string,
        { ['type_config_name']: string }
      >;
      expect(runConfig.reader_config.type_config_name).to.equal('LocalDeltasReader');
      expect(runConfig.writer_config.type_config_name).to.equal('LocalDeltasWriter');
    });

    it('deploy rejects the unedited config before any API call', async () => {
      const start = mock.requests.length;
      const result = await runPlugin(deployArgs(), cwd);
      expect(result.code, result.stderr).to.not.equal(0);
      expect(result.stderr).to.include('StreamingSourceNameEmpty');
      expect(requestsSince(start)).to.deep.equal([]);
    });

    it('scan keeps streamingSource.name and writes delta permissions', async () => {
      copyFileSync(path.join(FIXTURES_DIR, 'streaming', 'entrypoint.py'), path.join(pkg, 'payload', 'entrypoint.py'));
      const config = readJson(configPath()) as Record<string, unknown>;
      writeFileSync(
        configPath(),
        JSON.stringify({ ...config, streamingSource: { type: 'dlo', name: 'Smoke_Stream_Source__dll' } }, null, 2)
      );

      const result = await runOk(
        [
          'data-code-extension',
          'script',
          'scan',
          '--entrypoint',
          path.join(pkg, 'payload', 'entrypoint.py'),
          '--no-prompt',
        ],
        cwd
      );
      expect(result.stderr).to.not.include('streamingSource.name is empty');
      expectMatches('streaming/config.json', readJson(configPath()));
    });

    it('zip packages the payload', async () => {
      await runOk(['data-code-extension', 'script', 'zip', '--package-dir', path.join(pkg, 'payload')], cwd);
      expectMatches('streaming/zip-entries.json', await zipEntries(path.join(cwd, 'deployment.zip')));
    });

    it('deploy creates a streaming deployment and a STREAMING transform', async () => {
      const start = mock.requests.length;
      await runOk(deployArgs(), cwd);
      expectMatches('streaming/requests.json', requestsSince(start));
    });

    // Runs last: the delta fixtures live under payload/, so they'd otherwise end up in the zip.
    it('run drains local delta fixtures through the generated config.yaml', async function () {
      // Local Spark streaming checkpoints need Hadoop's winutils.exe on Windows, which CI runners don't have.
      if (process.platform === 'win32') this.skip();
      // LocalDeltasReader reads payload/streaming_fixtures/<streamingSource.name>, relative to the
      // working directory. Seeding _schema.json up front keeps it from querying the org.
      const fixtures = path.join(pkg, 'payload', 'streaming_fixtures', 'Smoke_Stream_Source__dll');
      mkdirSync(fixtures, { recursive: true });
      writeFileSync(
        path.join(fixtures, '_schema.json'),
        JSON.stringify({
          type: 'struct',
          fields: [
            { name: 'Id__c', type: 'string', nullable: true, metadata: {} },
            { name: 'Name__c', type: 'string', nullable: true, metadata: {} },
          ],
        })
      );
      const change = (id: string, name: string, version: number, op: string): string =>
        JSON.stringify({
          ['Id__c']: id,
          ['Name__c']: name,
          ['_commit_version']: version,
          ['_commit_timestamp']: '2026-01-01T00:00:00Z',
          ['_merge_record_type']: op,
        });
      writeFileSync(
        path.join(fixtures, '001.json'),
        [change('a1', 'smoke-upsert', 1, 'UPSERT'), change('a2', 'smoke-delete', 2, 'DELETE')].join('\n')
      );

      const result = await runOk(
        [
          'data-code-extension',
          'script',
          'run',
          '--entrypoint',
          path.join(pkg, 'payload', 'entrypoint.py'),
          '--target-org',
          USERNAME,
        ],
        pkg,
        { ['BYOC_RUN_MODE']: 'DELTA_SYNC' }
      );
      // LocalDeltasWriter prints one preview per micro-batch, tagging each row with its operation.
      expect(result.stdout).to.match(/Target=Smoke_Stream_Target__dll batch_id=0 file=\S+ rows=2/);
      expect(result.stdout).to.include('smoke-upsert');
      expect(result.stdout).to.match(/smoke-delete\s*\|\s*DELETE/);
    });
  });

  describe('function', () => {
    let cwd: string;
    let pkg: string;

    before(() => {
      cwd = path.join(workDir, 'function');
      pkg = path.join(cwd, 'pkg');
      mkdirSync(cwd);
    });

    it('init scaffolds a SearchIndexChunking function', async () => {
      await runOk(
        ['data-code-extension', 'function', 'init', '--package-dir', pkg, '--use-in-feature', 'SearchIndexChunking'],
        cwd
      );
      for (const f of ['payload/entrypoint.py', 'payload/config.json', 'payload/tests/test.json', 'requirements.txt']) {
        expect(existsSync(path.join(pkg, f)), f).to.equal(true);
      }
      expect(readJson(path.join(pkg, '.datacustomcode_proj', 'sdk_config.json'))).to.deep.include({
        type: 'function',
      });
    });

    it('scan updates config.json', async () => {
      await runOk(
        ['data-code-extension', 'function', 'scan', '--entrypoint', path.join(pkg, 'payload', 'entrypoint.py')],
        cwd
      );
      expectMatches('function/config.json', readJson(path.join(pkg, 'payload', 'config.json')));
      expectMatches('function/requirements.json', readLines(path.join(pkg, 'requirements.txt')));
    });

    it('run executes the function against the generated test file', async () => {
      const result = await runOk(
        [
          'data-code-extension',
          'function',
          'run',
          '--entrypoint',
          path.join(pkg, 'payload', 'entrypoint.py'),
          '--test-with',
          path.join(pkg, 'payload', 'tests', 'test.json'),
        ],
        cwd
      );
      // The chunk text comes from the SDK's template and sample input, so check
      // the response shape rather than exact content.
      const { output } = parseRunResult(result.stdout) as {
        output: Array<{ text: string; seq_no: number }>;
      };
      expect(output, 'function returned no chunks').to.be.an('array').that.is.not.empty;
      output.forEach((chunk, i) => {
        expect(chunk.text, `chunk ${i + 1} text`).to.be.a('string').that.is.not.empty;
        expect(chunk.seq_no, `chunk ${i + 1} seq_no`).to.equal(i + 1);
      });
    });

    it('zip packages the payload', async () => {
      await runOk(['data-code-extension', 'function', 'zip', '--package-dir', path.join(pkg, 'payload')], cwd);
      expectMatches('function/zip-entries.json', await zipEntries(path.join(cwd, 'deployment.zip')));
    });

    it('deploy sends the expected requests', async () => {
      const start = mock.requests.length;
      await runOk(
        [
          'data-code-extension',
          'function',
          'deploy',
          '--name',
          'smoke_function',
          '--package-version',
          '1.0.0',
          '--description',
          'Smoke test function',
          '--package-dir',
          path.join(pkg, 'payload'),
          '--target-org',
          USERNAME,
        ],
        cwd
      );
      expectMatches('function/requests.json', requestsSince(start));
    });
  });
});
