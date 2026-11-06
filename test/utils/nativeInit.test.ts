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
import os from 'node:os';
import path from 'node:path';
import { expect } from 'chai';
import { executeNativeInit } from '../../src/utils/nativeInit.js';

// ── Test fixtures ────────────────────────────────────────────────────────────
//
// The native init module reads the script/function templates from
// `<pythonPackageLocation>/datacustomcode/templates/...`. To run unit tests
// without depending on the installed Python package, each test builds a fake
// package layout in a temp dir and points init at it.

type FakePackageOptions = {
  scriptEntrypoint?: string;
  scriptConfig?: Record<string, unknown>;
  functionEntrypoint?: string;
  functionConfig?: Record<string, unknown>;
  /** Include the SDK 7.0.0+ streaming example and run config.yaml (default true). */
  streaming?: boolean;
};

const STREAMING_EXAMPLE = [
  'from datacustomcode.client import StreamingClient',
  'def main():',
  '    target_dlo = "Account_std_copy__dll"',
  '    client = StreamingClient()',
  '    df = client.read_dlo_deltas()',
  '    client.write_dlo_deltas(target_dlo, df).awaitTermination()',
  '',
].join('\n');

const SDK_CONFIG_YAML = [
  'reader_config:',
  '  type_config_name: QueryAPIDataCloudReader',
  '  options:',
  '    credentials_profile: default',
  '',
  'writer_config:',
  '  type_config_name: PrintDataCloudWriter',
  '',
  'spark_config:',
  '  options:',
  '    # Resolve columns case-sensitively.',
  "    spark.sql.caseSensitive: 'true'",
  '',
].join('\n');

async function buildFakePythonPackage(opts: FakePackageOptions = {}): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nativeinit-fake-pkg-'));
  const templates = path.join(root, 'datacustomcode', 'templates');

  // script template
  const scriptPayload = path.join(templates, 'script', 'payload');
  await fs.mkdir(scriptPayload, { recursive: true });
  await fs.writeFile(
    path.join(scriptPayload, 'entrypoint.py'),
    opts.scriptEntrypoint ??
      [
        'from datacustomcode.client import Client',
        '',
        'def main():',
        '    client = Client()',
        '    df = client.read_dlo("Account_std__dll")',
        '    dlo_name = "Account_std_copy__dll"',
        '    client.write_to_dlo(dlo_name, df)',
        '',
        "if __name__ == '__main__':",
        '    main()',
        '',
      ].join('\n')
  );
  await fs.writeFile(
    path.join(scriptPayload, 'config.json'),
    JSON.stringify(opts.scriptConfig ?? { dataspace: 'default' }, null, 2)
  );
  await fs.writeFile(path.join(templates, 'script', 'requirements.txt'), 'pandas\n');
  if (opts.streaming ?? true) {
    const streamingDir = path.join(templates, 'script', 'examples', 'streaming_deltas');
    await fs.mkdir(streamingDir, { recursive: true });
    await fs.writeFile(path.join(streamingDir, 'entrypoint.py'), STREAMING_EXAMPLE);
    await fs.writeFile(path.join(root, 'datacustomcode', 'config.yaml'), SDK_CONFIG_YAML);
  }

  // function template (base + chunking feature subdir)
  const functionPayload = path.join(templates, 'function', 'payload');
  await fs.mkdir(functionPayload, { recursive: true });
  await fs.writeFile(
    path.join(functionPayload, 'entrypoint.py'),
    opts.functionEntrypoint ??
      [
        'from datacustomcode.function import Runtime',
        '',
        'def function(request, runtime: Runtime):',
        '    return {}',
        '',
      ].join('\n')
  );
  await fs.writeFile(path.join(functionPayload, 'config.json'), JSON.stringify(opts.functionConfig ?? {}, null, 2));

  const chunkingPayload = path.join(templates, 'function', 'chunking', 'payload');
  await fs.mkdir(chunkingPayload, { recursive: true });
  await fs.writeFile(path.join(chunkingPayload, 'entrypoint.py'), '# chunking entrypoint\n');
  await fs.writeFile(path.join(chunkingPayload, 'config.json'), '{}');

  return root;
}

async function expectMissing(p: string): Promise<void> {
  try {
    await fs.access(p);
  } catch {
    return;
  }
  expect.fail(`expected ${p} not to exist`);
}

async function expectInitError(opts: Parameters<typeof executeNativeInit>[0]): Promise<Error> {
  try {
    await executeNativeInit(opts);
  } catch (err) {
    return err as Error;
  }
  return expect.fail('expected init to throw');
}

describe('executeNativeInit', () => {
  let pythonPackageLocation: string;
  let workdir: string;

  beforeEach(async () => {
    pythonPackageLocation = await buildFakePythonPackage();
    workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'nativeinit-out-'));
  });

  afterEach(async () => {
    await fs.rm(pythonPackageLocation, { recursive: true, force: true });
    await fs.rm(workdir, { recursive: true, force: true });
  });

  it('initializes a script package with sdk_config and scanned permissions', async () => {
    const packageDir = path.join(workdir, 'my-script');

    const result = await executeNativeInit({
      codeType: 'script',
      packageDir,
      pythonPackageLocation,
      pythonPackageVersion: '1.2.3',
    });

    expect(result.filesCreated).to.deep.equal([packageDir]);
    expect(result.configPath).to.equal(path.join(packageDir, 'payload', 'config.json'));
    expect(result.testJsonPath).to.be.undefined;

    const sdkConfig = JSON.parse(
      await fs.readFile(path.join(packageDir, '.datacustomcode_proj', 'sdk_config.json'), 'utf8')
    ) as { type: string };
    expect(sdkConfig.type).to.equal('script');

    const config = JSON.parse(await fs.readFile(result.configPath, 'utf8')) as {
      sdkVersion: string;
      entryPoint: string;
      dataspace: string;
      permissions: { read: { dlo?: string[]; dmo?: string[] }; write: { dlo?: string[]; dmo?: string[] } };
    };
    expect(config.sdkVersion).to.equal('1.2.3');
    expect(config.entryPoint).to.equal('entrypoint.py');
    expect(config.dataspace).to.equal('default');
    expect(config.permissions.read.dlo).to.deep.equal(['Account_std__dll']);
    expect(config.permissions.write.dlo).to.deep.equal(['Account_std_copy__dll']);
  });

  it('writes no streaming files for a BatchTransform script', async () => {
    const packageDir = path.join(workdir, 'my-batch');
    const result = await executeNativeInit({
      codeType: 'script',
      packageDir,
      pythonPackageLocation,
      pythonPackageVersion: '1.2.3',
      useInFeature: 'BatchTransform',
    });

    const config = JSON.parse(await fs.readFile(result.configPath, 'utf8')) as Record<string, unknown>;
    expect(config).to.not.have.property('streamingSource');
    await expectMissing(path.join(packageDir, 'config.yaml'));
  });

  it('initializes a StreamingTransform script from the streaming example', async () => {
    const packageDir = path.join(workdir, 'my-stream');
    const result = await executeNativeInit({
      codeType: 'script',
      packageDir,
      pythonPackageLocation,
      pythonPackageVersion: '7.0.0',
      useInFeature: 'StreamingTransform',
    });

    expect(await fs.readFile(path.join(packageDir, 'payload', 'entrypoint.py'), 'utf8')).to.equal(STREAMING_EXAMPLE);

    const config = JSON.parse(await fs.readFile(result.configPath, 'utf8')) as Record<string, unknown>;
    expect(config.streamingSource).to.deep.equal({ type: 'dlo', name: '' });
    expect(config.permissions).to.deep.equal({ read: { dlo: [] }, write: { dlo: ['Account_std_copy__dll'] } });

    // Reader/writer switched; everything else, comments and quoting included, kept.
    expect(await fs.readFile(path.join(packageDir, 'config.yaml'), 'utf8')).to.equal(
      SDK_CONFIG_YAML.replace('QueryAPIDataCloudReader', 'LocalDeltasReader').replace(
        'PrintDataCloudWriter',
        'LocalDeltasWriter'
      )
    );
  });

  it('fails before copying anything when the SDK has no streaming template', async () => {
    const oldSdk = await buildFakePythonPackage({ streaming: false });
    const packageDir = path.join(workdir, 'my-stream');
    try {
      const err = await expectInitError({
        codeType: 'script',
        packageDir,
        pythonPackageLocation: oldSdk,
        pythonPackageVersion: '6.0.0',
        useInFeature: 'StreamingTransform',
      });
      expect(err.name).to.equal('InitStreamingTemplateNotFound');
      expect(err.message).to.include('6.0.0');
      await expectMissing(packageDir);
    } finally {
      await fs.rm(oldSdk, { recursive: true, force: true });
    }
  });

  it('rejects an unknown script use-in-feature', async () => {
    const err = await expectInitError({
      codeType: 'script',
      packageDir: path.join(workdir, 'pkg'),
      pythonPackageLocation,
      pythonPackageVersion: '7.0.0',
      useInFeature: 'SearchIndexChunking',
    });
    expect(err.name).to.equal('InvalidUseInFeature');
  });

  it('always writes dataspace=default for a script regardless of template config', async () => {
    // Mirrors Python behavior: dc_config_json_from_file uses the template constant
    // (dataspace='default') and overwrites the template's payload/config.json.
    pythonPackageLocation = await buildFakePythonPackage({
      scriptConfig: { dataspace: 'CustomSpace' },
    });
    const packageDir = path.join(workdir, 'my-script');

    const result = await executeNativeInit({
      codeType: 'script',
      packageDir,
      pythonPackageLocation,
      pythonPackageVersion: '1.2.3',
    });

    const config = JSON.parse(await fs.readFile(result.configPath, 'utf8')) as { dataspace: string };
    expect(config.dataspace).to.equal('default');
  });

  it('rejects a script that reads from both DLO and DMO', async () => {
    pythonPackageLocation = await buildFakePythonPackage({
      scriptEntrypoint: [
        'def main():',
        '    client.read_dlo("a__dll")',
        '    client.read_dmo("b__dlm")',
        '    client.write_to_dlo("c__dll")',
      ].join('\n'),
    });
    const packageDir = path.join(workdir, 'my-script');

    let caught: Error | undefined;
    try {
      await executeNativeInit({
        codeType: 'script',
        packageDir,
        pythonPackageLocation,
        pythonPackageVersion: '1.2.3',
      });
    } catch (err) {
      caught = err as Error;
    }
    expect(caught, 'expected init to throw').to.exist;
    expect(caught!.message).to.include('Cannot read from DLO and DMO');
  });

  it('rejects a script with no read calls', async () => {
    pythonPackageLocation = await buildFakePythonPackage({
      scriptEntrypoint: 'def main():\n    pass\n',
    });
    const packageDir = path.join(workdir, 'my-script');

    let caught: Error | undefined;
    try {
      await executeNativeInit({
        codeType: 'script',
        packageDir,
        pythonPackageLocation,
        pythonPackageVersion: '1.2.3',
      });
    } catch (err) {
      caught = err as Error;
    }
    expect(caught, 'expected init to throw').to.exist;
    expect(caught!.message).to.include('Must read from at least one DLO or DMO');
  });

  it('initializes a function package with chunking feature overlay', async () => {
    const packageDir = path.join(workdir, 'my-function');

    const result = await executeNativeInit({
      codeType: 'function',
      packageDir,
      pythonPackageLocation,
      pythonPackageVersion: '1.2.3',
      useInFeature: 'SearchIndexChunking',
    });

    expect(result.filesCreated).to.deep.equal([packageDir]);
    expect(result.testJsonPath).to.equal(path.join(packageDir, 'payload', 'tests', 'test.json'));

    const sdkConfig = JSON.parse(
      await fs.readFile(path.join(packageDir, '.datacustomcode_proj', 'sdk_config.json'), 'utf8')
    ) as { type: string };
    expect(sdkConfig.type).to.equal('function');

    // Function config should NOT include sdkVersion or permissions.
    const config = JSON.parse(await fs.readFile(result.configPath, 'utf8')) as Record<string, unknown>;
    expect(config.entryPoint).to.equal('entrypoint.py');
    expect(config).to.not.have.property('sdkVersion');
    expect(config).to.not.have.property('permissions');

    // Feature overlay copied chunking entrypoint over the base.
    const entrypoint = await fs.readFile(path.join(packageDir, 'payload', 'entrypoint.py'), 'utf8');
    expect(entrypoint).to.include('chunking entrypoint');

    // tests/test.json should be a structured sample for SearchIndexChunking.
    const sample = JSON.parse(await fs.readFile(result.testJsonPath!, 'utf8')) as {
      input: Array<{ text: string; metadata?: { type?: string } }>;
    };
    expect(sample.input).to.be.an('array').with.length(1);
    expect(sample.input[0].text).to.be.a('string').with.length.greaterThan(0);
    expect(sample.input[0].metadata?.type).to.equal('text');
  });

  it('does not write test.json for an unknown feature', async () => {
    const packageDir = path.join(workdir, 'my-function-other');

    const result = await executeNativeInit({
      codeType: 'function',
      packageDir,
      pythonPackageLocation,
      pythonPackageVersion: '1.2.3',
      useInFeature: 'UnknownFeature',
    });

    expect(result.testJsonPath).to.be.undefined;
    let testsDirExists = true;
    try {
      await fs.access(path.join(packageDir, 'payload', 'tests'));
    } catch {
      testsDirExists = false;
    }
    expect(testsDirExists).to.be.false;
  });

  it('initializes a function package without useInFeature (no feature overlay)', async () => {
    const packageDir = path.join(workdir, 'my-function-bare');

    const result = await executeNativeInit({
      codeType: 'function',
      packageDir,
      pythonPackageLocation,
      pythonPackageVersion: '1.2.3',
      // useInFeature intentionally omitted
    });

    expect(result.testJsonPath).to.be.undefined;
    // Base function entrypoint copied (no chunking overlay).
    const entrypoint = await fs.readFile(path.join(packageDir, 'payload', 'entrypoint.py'), 'utf8');
    expect(entrypoint).to.include('def function(request, runtime: Runtime)');
    expect(entrypoint).to.not.include('chunking entrypoint');
  });

  it('handles a feature mapping whose template directory is absent on disk', async () => {
    // Build a fake package without the chunking subdirectory present at all.
    const customPkg = await fs.mkdtemp(path.join(os.tmpdir(), 'nativeinit-fake-pkg-nochunk-'));
    const fnPayload = path.join(customPkg, 'datacustomcode', 'templates', 'function', 'payload');
    await fs.mkdir(fnPayload, { recursive: true });
    await fs.writeFile(path.join(fnPayload, 'entrypoint.py'), 'def function(request, runtime):\n    return {}\n');
    await fs.writeFile(path.join(fnPayload, 'config.json'), '{}');
    // Note: no `chunking/` subdir in this template tree.
    const packageDir = path.join(workdir, 'my-function-no-overlay');

    const result = await executeNativeInit({
      codeType: 'function',
      packageDir,
      pythonPackageLocation: customPkg,
      pythonPackageVersion: '1.2.3',
      useInFeature: 'SearchIndexChunking',
    });

    // Init should succeed using only the base function template; test.json is still
    // sample-driven (not template-driven), so it gets written.
    expect(result.filesCreated).to.deep.equal([packageDir]);
    expect(result.testJsonPath).to.equal(path.join(packageDir, 'payload', 'tests', 'test.json'));
    await fs.rm(customPkg, { recursive: true, force: true });
  });

  it('throws InitTemplateNotFound when the python package layout is missing', async () => {
    const bogus = await fs.mkdtemp(path.join(os.tmpdir(), 'nativeinit-bogus-'));
    try {
      let caught: Error | undefined;
      try {
        await executeNativeInit({
          codeType: 'script',
          packageDir: path.join(workdir, 'pkg'),
          pythonPackageLocation: bogus,
          pythonPackageVersion: '1.2.3',
        });
      } catch (err) {
        caught = err as Error;
      }
      expect(caught, 'expected init to throw').to.exist;
      expect(caught!.name).to.equal('InitTemplateNotFound');
    } finally {
      await fs.rm(bogus, { recursive: true, force: true });
    }
  });
});
