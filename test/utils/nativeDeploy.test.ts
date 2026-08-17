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
import { type Connection, SfError } from '@salesforce/core';
import {
  sanitizeApiName,
  buildMetadata,
  inspectFunctionTypesStatic,
  inferUseInFeature,
  buildDataTransformBody,
  getConfig,
  waitForDeployment,
  htmlUnescape,
  COMPUTE_TYPES,
  NativeDeployer,
  type CodeExtensionMetadata,
  type DataTransformConfig,
  type NativeDeployDeps,
} from '../../src/utils/nativeDeploy.js';

const CHUNKING_ENTRYPOINT = [
  'from datacustomcode.function import Runtime',
  'from my.models import SearchIndexChunkingV1Request, SearchIndexChunkingV1Response',
  '',
  'def function(request: SearchIndexChunkingV1Request, runtime: Runtime) -> SearchIndexChunkingV1Response:',
  '    return SearchIndexChunkingV1Response()',
  '',
].join('\n');

const SCRIPT_DLO_CONFIG = {
  entryPoint: 'entrypoint.py',
  sdkVersion: '1.0.0',
  dataspace: 'my_space',
  permissions: { read: { dlo: ['Account__dll'] }, write: { dlo: ['Result__dll'] } },
};

/** Await a promise expected to reject and return the error for assertions. */
async function expectReject(promise: Promise<unknown>): Promise<SfError> {
  try {
    await promise;
  } catch (err) {
    return err as SfError;
  }
  throw new Error('Expected promise to reject, but it resolved');
}

type PackageOptions = {
  packageType: 'script' | 'function';
  config: Record<string, unknown>;
  entrypoint?: string;
};

/** Create a `<dir>/payload` package with the SDK config + config.json the deploy path reads. */
async function makePackage(opts: PackageOptions): Promise<{ dir: string; packageDir: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nativedeploy-'));
  await fs.mkdir(path.join(dir, '.datacustomcode_proj'), { recursive: true });
  await fs.writeFile(
    path.join(dir, '.datacustomcode_proj', 'sdk_config.json'),
    JSON.stringify({ type: opts.packageType })
  );
  const packageDir = path.join(dir, 'payload');
  await fs.mkdir(packageDir, { recursive: true });
  await fs.writeFile(path.join(packageDir, 'config.json'), JSON.stringify(opts.config));
  await fs.writeFile(path.join(packageDir, 'entrypoint.py'), opts.entrypoint ?? 'pass\n');
  return { dir, packageDir };
}

describe('nativeDeploy.sanitizeApiName', () => {
  it('replaces spaces and hyphens with underscores', () => {
    expect(sanitizeApiName('my package-name')).to.equal('my_package_name');
  });

  it('drops invalid characters, collapses underscores, and strips edges', () => {
    expect(sanitizeApiName('__my..pkg!!__name__')).to.equal('mypkg_name');
  });

  it('collapses runs created by adjacent spaces/hyphens', () => {
    expect(sanitizeApiName('a - b')).to.equal('a_b');
  });
});

describe('nativeDeploy.buildMetadata', () => {
  it('keeps a valid name and carries fields through', () => {
    const logs: string[] = [];
    const meta = buildMetadata(
      { name: 'valid_name', version: '1.0.0', description: 'd', computeType: 'CPU_M', codeType: 'script' },
      (m) => logs.push(m)
    );
    expect(meta).to.deep.equal({
      name: 'valid_name',
      version: '1.0.0',
      description: 'd',
      computeType: 'CPU_M',
      codeType: 'script',
    });
    expect(logs).to.have.length(0);
  });

  it('logs when the name is sanitized', () => {
    const logs: string[] = [];
    const meta = buildMetadata(
      { name: 'my package', version: '1', description: 'd', computeType: 'CPU_M', codeType: 'script' },
      (m) => logs.push(m)
    );
    expect(meta.name).to.equal('my_package');
    expect(logs.some((m) => m.includes('sanitized'))).to.equal(true);
  });

  it('throws when the name sanitizes to empty', () => {
    expect(() =>
      buildMetadata({ name: '!!!', version: '1', description: 'd', computeType: 'CPU_M', codeType: 'script' })
    ).to.throw(SfError, /invalid/i);
  });

  it('throws when the sanitized name does not begin with a letter', () => {
    expect(() =>
      buildMetadata({ name: '123abc', version: '1', description: 'd', computeType: 'CPU_M', codeType: 'script' })
    ).to.throw(SfError, /must begin with a letter/i);
  });
});

describe('nativeDeploy.inspectFunctionTypesStatic', () => {
  it('extracts request and response type names from a chunking signature', () => {
    const { requestTypeName, responseTypeName } = inspectFunctionTypesStatic(CHUNKING_ENTRYPOINT);
    expect(requestTypeName).to.equal('SearchIndexChunkingV1Request');
    expect(responseTypeName).to.equal('SearchIndexChunkingV1Response');
  });

  it('reduces module-qualified and subscripted annotations to a base name (like the AST)', () => {
    const src = [
      'def function(request: models.SearchIndexChunkingV1Request, rt) -> List[SearchIndexChunkingV1Response]:',
      '    pass',
    ].join('\n');
    const { requestTypeName, responseTypeName } = inspectFunctionTypesStatic(src);
    expect(requestTypeName).to.equal('SearchIndexChunkingV1Request');
    // Subscript returns the base (`List`), matching Python's _get_type_name_from_ast.
    expect(responseTypeName).to.equal('List');
  });

  it('handles a signature split across multiple lines', () => {
    const src = [
      'def function(',
      '    request: SearchIndexChunkingV1Request,',
      '    runtime: Runtime,',
      ') -> SearchIndexChunkingV1Response:',
      '    pass',
    ].join('\n');
    const { requestTypeName, responseTypeName } = inspectFunctionTypesStatic(src);
    expect(requestTypeName).to.equal('SearchIndexChunkingV1Request');
    expect(responseTypeName).to.equal('SearchIndexChunkingV1Response');
  });

  it('returns empty when there is no function definition', () => {
    expect(inspectFunctionTypesStatic('x = 1\n')).to.deep.equal({});
  });
});

describe('nativeDeploy.inferUseInFeature', () => {
  it('returns the feature when request and response both map to it', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'infer-'));
    const entrypoint = path.join(dir, 'entrypoint.py');
    await fs.writeFile(entrypoint, CHUNKING_ENTRYPOINT);
    expect(await inferUseInFeature(entrypoint)).to.equal('SearchIndexChunking');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('returns undefined when the signature does not match a known type', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'infer-'));
    const entrypoint = path.join(dir, 'entrypoint.py');
    await fs.writeFile(entrypoint, 'def function(request: SomethingElse, rt) -> AnotherThing:\n    pass\n');
    expect(await inferUseInFeature(entrypoint)).to.equal(undefined);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('returns undefined when the file cannot be read', async () => {
    expect(await inferUseInFeature(path.join(os.tmpdir(), 'does-not-exist-xyz.py'))).to.equal(undefined);
  });
});

describe('nativeDeploy.buildDataTransformBody', () => {
  const metadata: CodeExtensionMetadata = {
    name: 'my_script',
    version: '1.0.0',
    description: 'd',
    computeType: 'CPU_M',
    codeType: 'script',
  };

  it('builds nodes/sources/macro for a DLO transform without outputDataObjects', () => {
    const config: DataTransformConfig = {
      entryPoint: 'entrypoint.py',
      sdkVersion: '1.0.0',
      dataspace: 'my_space',
      permissions: { read: { dlo: ['Account__dll', 'Contact__dll'] }, write: { dlo: ['Result__dll'] } },
    };
    const body = buildDataTransformBody(metadata, config);

    /* eslint-disable camelcase -- asserting the snake_case Data Cloud manifest wire shape */
    expect(body).to.deep.equal({
      definition: {
        type: 'DCSQL',
        version: '56.0',
        manifest: {
          nodes: {
            node1: { relation_name: 'Result__dll', config: { materialized: 'table' }, compiled_code: '' },
          },
          sources: {
            source1: { relation_name: 'Account__dll' },
            source2: { relation_name: 'Contact__dll' },
          },
          macros: { 'macro.byoc': { arguments: [{ name: 'my_script', type: 'BYOC_SCRIPT' }] } },
        },
      },
      label: 'my_script',
      name: 'my_script',
      type: 'BATCH',
      dataSpaceName: 'my_space',
    });
    /* eslint-enable camelcase */
  });

  it('emits outputDataObjects (with keyQualifierField rename) for a DMO transform', () => {
    const config: DataTransformConfig = {
      entryPoint: 'entrypoint.py',
      sdkVersion: '1.0.0',
      dataspace: 'my_space',
      permissions: { read: { dmo: ['Src__dlm'] }, write: { dmo: ['Out__dlm'] } },
      dataObjects: [
        {
          name: 'Out__dlm',
          label: 'Out',
          type: 'Profile',
          category: 'Profile',
          fields: [
            { name: 'id', label: 'Id', dataType: 'Text', isPrimaryKey: true, keyQualifierFieldName: 'kq' },
            { name: 'val', label: 'Val', dataType: 'Number' },
          ],
        },
      ],
    };
    const body = buildDataTransformBody(metadata, config);
    const definition = body.definition as Record<string, unknown>;
    expect(definition.outputDataObjects).to.deep.equal([
      {
        category: 'Profile',
        label: 'Out',
        name: 'Out__dlm',
        type: 'Profile',
        fields: [
          { isPrimaryKey: true, label: 'Id', name: 'id', type: 'Text', keyQualifierField: 'kq' },
          { isPrimaryKey: false, label: 'Val', name: 'val', type: 'Number' },
        ],
      },
    ]);
  });

  it('throws when a DMO transform is missing dataObjects', () => {
    const config: DataTransformConfig = {
      entryPoint: 'entrypoint.py',
      sdkVersion: '1.0.0',
      dataspace: 'my_space',
      permissions: { read: { dmo: ['Src__dlm'] }, write: { dmo: ['Out__dlm'] } },
    };
    expect(() => buildDataTransformBody(metadata, config)).to.throw(SfError, /dataObjects/);
  });
});

describe('nativeDeploy.getConfig', () => {
  it('parses a valid script (DataTransform) config', async () => {
    const { dir, packageDir } = await makePackage({ packageType: 'script', config: SCRIPT_DLO_CONFIG });
    const config = (await getConfig(packageDir, 'script')) as DataTransformConfig;
    expect(config.dataspace).to.equal('my_space');
    expect(config.permissions.read.dlo).to.deep.equal(['Account__dll']);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('parses a valid function config', async () => {
    const { dir, packageDir } = await makePackage({ packageType: 'function', config: { entryPoint: 'entrypoint.py' } });
    const config = await getConfig(packageDir, 'function');
    expect(config.entryPoint).to.equal('entrypoint.py');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('throws ConfigNotFound when config.json is missing', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nocfg-'));
    const err = await expectReject(getConfig(dir, 'script'));
    expect(err.name).to.equal('ConfigNotFound');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('throws on invalid JSON', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'badjson-'));
    await fs.writeFile(path.join(dir, 'config.json'), '{ not json');
    const err = await expectReject(getConfig(dir, 'script'));
    expect(err.message).to.match(/not valid JSON/);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('reports missing required fields for a script config', async () => {
    const { dir, packageDir } = await makePackage({
      packageType: 'script',
      config: { entryPoint: 'entrypoint.py' },
    });
    const err = await expectReject(getConfig(packageDir, 'script'));
    expect(err.message).to.match(/missing required fields/);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('rejects mixed DLO/DMO layers', async () => {
    const { dir, packageDir } = await makePackage({
      packageType: 'script',
      config: {
        entryPoint: 'entrypoint.py',
        sdkVersion: '1.0.0',
        dataspace: 'my_space',
        permissions: { read: { dlo: ['A__dll'] }, write: { dmo: ['B__dlm'] } },
      },
    });
    const err = await expectReject(getConfig(packageDir, 'script'));
    expect(err.message).to.match(/both reference DLOs or both reference DMOs/);
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe('nativeDeploy.htmlUnescape', () => {
  it('decodes &amp; in a presigned URL exactly once', () => {
    expect(htmlUnescape('https://host/path?a=1&amp;b=2&amp;c=3')).to.equal('https://host/path?a=1&b=2&c=3');
  });

  it('decodes numeric and hex entities', () => {
    expect(htmlUnescape('a&#39;b&#x27;c')).to.equal("a'b'c");
    expect(htmlUnescape('&lt;tag&gt;')).to.equal('<tag>');
  });

  it('does not throw on an out-of-range numeric reference', () => {
    expect(() => htmlUnescape('x&#9999999999;y')).to.not.throw();
  });
});

describe('nativeDeploy.waitForDeployment', () => {
  function counterNow(values: number[]): () => number {
    let i = 0;
    return () => values[Math.min(i++, values.length - 1)];
  }

  it('resolves immediately when the status is already Deployed', async () => {
    let calls = 0;
    let sleeps = 0;
    const status = await waitForDeployment('pkg', {
      getDeploymentStatus: async () => {
        calls++;
        return 'Deployed';
      },
      sleep: async () => {
        sleeps++;
      },
      now: () => 0,
    });
    expect(status).to.equal('Deployed');
    expect(calls).to.equal(1);
    expect(sleeps).to.equal(0);
  });

  it('polls through intermediate statuses until Deployed', async () => {
    const statuses = ['InProgress', 'InProgress', 'Deployed'];
    let idx = 0;
    let sleeps = 0;
    const seen: string[] = [];
    const status = await waitForDeployment(
      'pkg',
      {
        getDeploymentStatus: async () => statuses[idx++],
        sleep: async () => {
          sleeps++;
        },
        now: () => 0,
      },
      (s) => seen.push(s)
    );
    expect(status).to.equal('Deployed');
    expect(sleeps).to.equal(2);
    expect(seen).to.deep.equal(['InProgress', 'InProgress', 'Deployed']);
  });

  it('throws when the timeout is exceeded', async () => {
    const err = await expectReject(
      waitForDeployment('pkg', {
        getDeploymentStatus: async () => 'InProgress',
        sleep: async () => {},
        // start=0, then a jump well past the 3000s window.
        now: counterNow([0, 3_000_001_000]),
      })
    );
    expect(err.name).to.equal('DeploymentTimedOut');
  });

  it('fast-fails on a terminal failure status', async () => {
    const err = await expectReject(
      waitForDeployment('pkg', {
        getDeploymentStatus: async () => 'Failed',
        sleep: async () => {},
        now: () => 0,
      })
    );
    expect(err.name).to.equal('DeploymentFailed');
  });
});

describe('nativeDeploy.NativeDeployer.deploy', () => {
  const dummyConnection = {} as unknown as Connection;

  function recordingDeps(overrides: Partial<NativeDeployDeps> = {}): {
    deps: Partial<NativeDeployDeps>;
    order: string[];
    createdMetadata: CodeExtensionMetadata[];
    dataTransformBodies: unknown[];
  } {
    const order: string[] = [];
    const createdMetadata: CodeExtensionMetadata[] = [];
    const dataTransformBodies: unknown[] = [];
    const deps: Partial<NativeDeployDeps> = {
      createDeployment: async (metadata) => {
        order.push('createDeployment');
        createdMetadata.push(metadata);
        return { fileUploadUrl: 'https://upload.example/put?a=1&amp;b=2' };
      },
      zip: async () => {
        order.push('zip');
        return { archivePath: 'deployment.zip', fileCount: 1, archiveSizeBytes: 10 };
      },
      uploadZip: async () => {
        order.push('uploadZip');
      },
      getDeploymentStatus: async () => {
        order.push('getDeploymentStatus');
        return 'Deployed';
      },
      createDataTransform: async (body) => {
        order.push('createDataTransform');
        dataTransformBodies.push(body);
        return {};
      },
      sleep: async () => {},
      now: () => 0,
      ...overrides,
    };
    return { deps, order, createdMetadata, dataTransformBodies };
  }

  it('deploys a script package end-to-end and creates the data transform', async () => {
    const { dir, packageDir } = await makePackage({ packageType: 'script', config: SCRIPT_DLO_CONFIG });
    const { deps, order, createdMetadata, dataTransformBodies } = recordingDeps();

    const result = await NativeDeployer.deploy(
      {
        name: 'my-script',
        version: '2.0.0',
        description: 'd',
        packageDir,
        cpuSize: 'CPU_2XL',
        connection: dummyConnection,
      },
      deps
    );

    expect(result).to.deep.equal({
      success: true,
      codeType: 'script',
      name: 'my_script',
      version: '2.0.0',
      status: 'Deployed',
    });
    // Order preserved: create -> zip -> upload -> poll -> data transform.
    expect(order).to.deep.equal(['createDeployment', 'zip', 'uploadZip', 'getDeploymentStatus', 'createDataTransform']);
    // CPU_2XL maps to the CPU_M wire compute type.
    expect(createdMetadata[0].computeType).to.equal(COMPUTE_TYPES.CPU_2XL);
    expect(createdMetadata[0].computeType).to.equal('CPU_M');
    expect(createdMetadata[0].codeType).to.equal('script');
    expect(createdMetadata[0].name).to.equal('my_script');
    expect(createdMetadata[0].functionInvokeOptions).to.equal(undefined);
    expect((dataTransformBodies[0] as Record<string, unknown>).dataSpaceName).to.equal('my_space');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('infers the feature for a function package and skips the data transform', async () => {
    const { dir, packageDir } = await makePackage({
      packageType: 'function',
      config: { entryPoint: 'entrypoint.py' },
      entrypoint: CHUNKING_ENTRYPOINT,
    });
    const { deps, order, createdMetadata } = recordingDeps();

    const result = await NativeDeployer.deploy(
      { name: 'my_fn', version: '1.0.0', description: 'd', packageDir, cpuSize: 'CPU_L', connection: dummyConnection },
      deps
    );

    expect(result.codeType).to.equal('function');
    expect(createdMetadata[0].functionInvokeOptions).to.deep.equal(['UnstructuredChunking']);
    expect(order).to.not.include('createDataTransform');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('errors when the function signature does not map to a feature', async () => {
    const { dir, packageDir } = await makePackage({
      packageType: 'function',
      config: { entryPoint: 'entrypoint.py' },
      entrypoint: 'def function(request: Foo, rt) -> Bar:\n    pass\n',
    });
    const { deps } = recordingDeps();
    const err = await expectReject(
      NativeDeployer.deploy(
        { name: 'my_fn', version: '1', description: 'd', packageDir, cpuSize: 'CPU_L', connection: dummyConnection },
        deps
      )
    );
    expect(err.message).to.match(/does not match a supported type/);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('rejects an invalid CPU size before touching the org', async () => {
    const { dir, packageDir } = await makePackage({ packageType: 'script', config: SCRIPT_DLO_CONFIG });
    const { deps, order } = recordingDeps();
    const err = await expectReject(
      NativeDeployer.deploy(
        {
          name: 'my_script',
          version: '1',
          description: 'd',
          packageDir,
          cpuSize: 'BOGUS',
          connection: dummyConnection,
        },
        deps
      )
    );
    expect(err.message).to.match(/Invalid CPU size/);
    expect(order).to.have.length(0);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('maps a 409 from the deployment API to a friendly "name exists" error', async () => {
    const { dir, packageDir } = await makePackage({ packageType: 'script', config: SCRIPT_DLO_CONFIG });
    // Do NOT override createDeployment: exercise the real default that wraps the
    // connection request, with a connection stub that throws a 409.
    const connection = {
      request: () => Promise.reject(Object.assign(new Error('conflict'), { statusCode: 409 })),
    } as unknown as Connection;

    const err = await expectReject(
      NativeDeployer.deploy({
        name: 'my_script',
        version: '1',
        description: 'd',
        packageDir,
        cpuSize: 'CPU_2XL',
        connection,
      })
    );
    expect(err.name).to.equal('DeploymentExists');
    await fs.rm(dir, { recursive: true, force: true });
  });
});
