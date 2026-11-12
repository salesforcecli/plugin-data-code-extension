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
import { type SfError } from '@salesforce/core';
import {
  setPipreqsMock,
  executeNativeScan,
  findBaseDirectory,
  getPackageType,
  fileIsStreaming,
  findIgnoredBatchObjects,
  isStreamingSourceNameMissing,
  scanFile,
  scanFileForImports,
  scanFileStreaming,
  updateConfig,
  writeRequirementsFile,
} from '../../src/utils/nativeScan.js';

type ScriptPackageOptions = {
  entrypoint: string;
  config?: Record<string, unknown>;
  packageType?: 'script' | 'function';
};

async function makePackage(opts: ScriptPackageOptions): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nativescan-'));
  await fs.mkdir(path.join(dir, '.datacustomcode_proj'), { recursive: true });
  await fs.writeFile(
    path.join(dir, '.datacustomcode_proj', 'sdk_config.json'),
    JSON.stringify({ type: opts.packageType ?? 'script' })
  );
  await fs.mkdir(path.join(dir, 'payload'), { recursive: true });
  await fs.writeFile(path.join(dir, 'payload', 'entrypoint.py'), opts.entrypoint);
  await fs.writeFile(path.join(dir, 'payload', 'config.json'), JSON.stringify(opts.config ?? { dataspace: 'default' }));
  return dir;
}

/** The shape of the SDK's `streaming_deltas` example: deltas in one branch, batch calls in the other. */
const STREAMING_ENTRYPOINT = [
  'from datacustomcode.client import RunMode, StreamingClient, get_run_mode',
  'def main():',
  '    target_dlo = "Account_std_copy__dll"',
  '    client = StreamingClient()',
  '    if get_run_mode() == RunMode.DELTA_SYNC:',
  '        dataframe = client.read_dlo_deltas()',
  '        query = client.write_dlo_deltas(target_dlo, dataframe)',
  '        query.awaitTermination()',
  '    else:',
  '        dataframe = client.read_dlo()',
  '        client.auto_write_to_dlo(target_dlo, dataframe)',
  '',
].join('\n');

async function writeEntrypoint(code: string): Promise<{ tmp: string; file: string }> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'scanfile-'));
  const file = path.join(tmp, 'entrypoint.py');
  await fs.writeFile(file, code);
  return { tmp, file };
}

describe('nativeScan: scanFileStreaming', () => {
  it('detects delta reads and resolves delta write targets', async () => {
    const { tmp, file } = await writeEntrypoint(STREAMING_ENTRYPOINT);
    expect(await fileIsStreaming(file)).to.equal(true);
    const calls = await scanFileStreaming(file);
    expect(calls.readDloDeltas).to.equal(true);
    expect(calls.readDmoDeltas).to.equal(false);
    expect([...calls.writeDloDeltas]).to.deep.equal(['Account_std_copy__dll']);
    expect(calls.writeDmoDeltas.size).to.equal(0);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('is not streaming for a batch-only entrypoint or delta calls in comments', async () => {
    const { tmp, file } = await writeEntrypoint(
      '# c.read_dlo_deltas()\nc.read_dlo("a__dll")\nc.write_to_dlo("b__dll", df)\ns = "c.write_dlo_deltas(x)"\n'
    );
    expect(await fileIsStreaming(file)).to.equal(false);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  const invalid: Array<[string, string, RegExp]> = [
    [
      'reading DLO and DMO deltas',
      'c.read_dlo_deltas()\nc.read_dmo_deltas()\nc.write_dlo_deltas("o__dll", df)\n',
      /Cannot read DLO and DMO deltas/,
    ],
    ['no delta read', 'c.write_dlo_deltas("o__dll", df)\n', /must read from at least one DLO or DMO delta stream/],
    ['no delta write', 'c.read_dlo_deltas()\n', /must write to at least one DLO or DMO via write_dlo_deltas/],
    [
      'writing DLO and DMO deltas',
      'c.read_dlo_deltas()\nc.write_dlo_deltas("o__dll", df)\nc.write_dmo_deltas("p__dlm", df)\n',
      /Cannot write DLO and DMO deltas/,
    ],
    [
      'different read and write layers',
      'c.read_dlo_deltas()\nc.write_dmo_deltas("p__dlm", df)\n',
      /must read and write the same layer \(got read=dlo, write=dmo\)/,
    ],
  ];
  for (const [label, code, message] of invalid) {
    it(`rejects ${label}`, async () => {
      const { tmp, file } = await writeEntrypoint(code);
      try {
        await scanFileStreaming(file);
        expect.fail('expected scanFileStreaming to throw');
      } catch (err) {
        expect((err as SfError).name).to.equal('InvalidEntrypoint');
        expect((err as SfError).message).to.match(message);
      }
      await fs.rm(tmp, { recursive: true, force: true });
    });
  }
});

describe('nativeScan: findIgnoredBatchObjects', () => {
  it('is empty for the streaming template shape (unnamed read_dlo) and for batch-only files', async () => {
    const streaming = await writeEntrypoint(STREAMING_ENTRYPOINT);
    const batch = await writeEntrypoint('c.read_dlo("In__dll")\nc.write_to_dlo("Out__dll", df)\n');
    expect(await findIgnoredBatchObjects(streaming.file)).to.deep.equal([]);
    expect(await findIgnoredBatchObjects(batch.file)).to.deep.equal([]);
    await fs.rm(streaming.tmp, { recursive: true, force: true });
    await fs.rm(batch.tmp, { recursive: true, force: true });
  });

  it('lists named batch reads and writes in a streaming file', async () => {
    const { tmp, file } = await writeEntrypoint(
      STREAMING_ENTRYPOINT.replace('client.read_dlo()', 'client.read_dlo("B__dll")') +
        'def helper(c, df):\n    c.write_to_dlo("A__dll", df)\n'
    );
    expect(await findIgnoredBatchObjects(file)).to.deep.equal(['A__dll', 'B__dll']);
    await fs.rm(tmp, { recursive: true, force: true });
  });
});

describe('nativeScan: isStreamingSourceNameMissing', () => {
  it('is false for batch configs and named sources, true for an empty or malformed source', () => {
    expect(isStreamingSourceNameMissing({})).to.equal(false);
    expect(isStreamingSourceNameMissing({ streamingSource: { type: 'dlo', name: 'A__dll' } })).to.equal(false);
    expect(isStreamingSourceNameMissing({ streamingSource: { type: 'dlo', name: '' } })).to.equal(true);
    expect(isStreamingSourceNameMissing({ streamingSource: 'A__dll' })).to.equal(true);
  });
});

describe('nativeScan: scanFile', () => {
  it('extracts read/write DLO calls with literal and variable args', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'scanfile-'));
    const file = path.join(tmp, 'entrypoint.py');
    await fs.writeFile(
      file,
      [
        'from datacustomcode.client import Client',
        'def main():',
        '    c = Client()',
        '    c.read_dlo("Account__dll")',
        '    target = "DestDLO__dll"',
        '    c.write_to_dlo(target, df)',
      ].join('\n')
    );
    const calls = await scanFile(file);
    expect([...calls.readDlo]).to.deep.equal(['Account__dll']);
    expect([...calls.writeToDlo]).to.deep.equal(['DestDLO__dll']);
    expect(calls.readDmo.size).to.equal(0);
    expect(calls.writeToDmo.size).to.equal(0);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('rejects mixed DLO and DMO reads', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'scanfile-'));
    const file = path.join(tmp, 'entrypoint.py');
    await fs.writeFile(
      file,
      'def main():\n    c.read_dlo("a__dll")\n    c.read_dmo("b__dlm")\n    c.write_to_dlo("c__dll")\n'
    );
    let caught: Error | undefined;
    try {
      await scanFile(file);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught?.message).to.include('Cannot read from DLO and DMO');
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('rejects DLO read paired with DMO write', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'scanfile-'));
    const file = path.join(tmp, 'entrypoint.py');
    await fs.writeFile(file, 'def main():\n    c.read_dlo("a__dll")\n    c.write_to_dmo("b__dlm")\n');
    let caught: Error | undefined;
    try {
      await scanFile(file);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught?.message).to.include('Cannot read from DLO and write to DMO');
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('rejects DMO read paired with DLO write', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'scanfile-'));
    const file = path.join(tmp, 'entrypoint.py');
    await fs.writeFile(file, 'def main():\n    c.read_dmo("a__dlm")\n    c.write_to_dlo("b__dll")\n');
    let caught: Error | undefined;
    try {
      await scanFile(file);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught?.message).to.include('Cannot read from DMO and write to DLO');
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('handles single-quoted DLO arguments and ignores idents without bindings', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'scanfile-'));
    const file = path.join(tmp, 'entrypoint.py');
    // - single-quoted literal (sq branch in callRegex)
    // - ident `unbound` is not assigned to a string → must be skipped
    // - ident `target` IS bound and must be resolved
    await fs.writeFile(
      file,
      [
        'def main():',
        "    c.read_dlo('A__dll')",
        '    c.write_to_dlo(unbound, df)',
        '    target = "Resolved__dll"',
        '    c.write_to_dlo(target, df)',
      ].join('\n')
    );
    const calls = await scanFile(file);
    expect([...calls.readDlo]).to.deep.equal(['A__dll']);
    expect([...calls.writeToDlo]).to.deep.equal(['Resolved__dll']);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('ignores method-like text inside string literals and comments', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'scanfile-'));
    const file = path.join(tmp, 'entrypoint.py');
    // Real call: Source__dll. Everything else is inside strings / comments / docstrings
    // and must NOT be picked up as a permission.
    await fs.writeFile(
      file,
      [
        'from datacustomcode.client import Client',
        '"""',
        'Example usage:',
        '  c.read_dlo("DocstringFake__dll")',
        '"""',
        'def main():',
        '    c = Client()',
        '    msg = \'Calling c.read_dmo("StringFake__dlm") in a log\'',
        '    # c.write_to_dlo("CommentedOut__dll", df)',
        '    c.read_dlo("Source__dll")',
        '    c.write_to_dlo("Dest__dll", df)',
      ].join('\n')
    );
    const calls = await scanFile(file);
    expect([...calls.readDlo]).to.deep.equal(['Source__dll']);
    expect([...calls.writeToDlo]).to.deep.equal(['Dest__dll']);
    expect(calls.readDmo.size).to.equal(0);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('throws InvalidEntrypoint when only matches are inside comments/strings', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'scanfile-'));
    const file = path.join(tmp, 'entrypoint.py');
    // No real read/write calls — all "matches" live inside comments/strings.
    // The "must read at least one DLO or DMO" validator must still fire.
    await fs.writeFile(
      file,
      [
        '"""docstring with c.read_dlo("Fake__dll") inside"""',
        '# also c.write_to_dlo("CommentedOut__dll", df)',
        'def main():',
        '    log.info(\'used to call c.read_dmo("OldDmo__dlm")\')',
      ].join('\n')
    );
    let caught: Error | undefined;
    try {
      await scanFile(file);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught?.message).to.include('Must read from at least one DLO or DMO');
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('resolves variable args using the binding at the call site, not last-write-wins', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'scanfile-'));
    const file = path.join(tmp, 'entrypoint.py');
    // Variable is reassigned between calls. Each call should resolve to the value bound
    // at that point in source order, not the file-final value.
    await fs.writeFile(
      file,
      [
        'def main():',
        '    name = "First__dll"',
        '    c.read_dlo(name)',
        '    name = "Second__dll"',
        '    c.write_to_dlo(name, df)',
      ].join('\n')
    );
    const calls = await scanFile(file);
    expect([...calls.readDlo]).to.deep.equal(['First__dll']);
    expect([...calls.writeToDlo]).to.deep.equal(['Second__dll']);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('does not resolve a variable bound only after the call', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'scanfile-'));
    const file = path.join(tmp, 'entrypoint.py');
    // Read call comes BEFORE assignment of `name`. There's no binding at the call site,
    // so the read contributes nothing — InvalidEntrypoint must fire because no real read
    // was found. (write_to_dlo with a literal still counts as a write but cannot satisfy
    // the read-required validator.)
    await fs.writeFile(
      file,
      ['def main():', '    c.read_dlo(name)', '    name = "Source__dll"', '    c.write_to_dlo("Dest__dll", df)'].join(
        '\n'
      )
    );
    let caught: Error | undefined;
    try {
      await scanFile(file);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught?.message).to.include('Must read from at least one DLO or DMO');
    await fs.rm(tmp, { recursive: true, force: true });
  });
});

describe('nativeScan: scanFileForImports', () => {
  afterEach(() => {
    setPipreqsMock(null);
  });

  it('drops stdlib, datacustomcode, pyspark, and underscore-leading packages', async () => {
    // pipreqs already filters out stdlib, local modules, and underscore-prefixed packages
    // We only need to mock what pipreqs would actually return
    setPipreqsMock(async () => 'pandas\nnumpy\n');

    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'imports-'));
    const file = path.join(tmp, 'entrypoint.py');
    await fs.writeFile(
      file,
      [
        'import os',
        'import sys',
        'import pandas',
        'import numpy as np',
        'from typing import List',
        'from datacustomcode.client import Client',
        'from pyspark.sql.functions import col',
        'import _internal',
        'from . import sibling',
        'from .. import config',
        'from datetime import datetime',
        '"""docstring with import requests"""',
        '# import urllib',
      ].join('\n')
    );
    const imports = await scanFileForImports(file);
    expect([...imports].sort()).to.deep.equal(['numpy', 'pandas']);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('handles multi-name import statements', async () => {
    setPipreqsMock(async () => 'pandas\nnumpy\n');

    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'imports-'));
    const file = path.join(tmp, 'entrypoint.py');
    await fs.writeFile(file, 'import pandas, numpy as np, os\n');
    const imports = await scanFileForImports(file);
    expect([...imports].sort()).to.deep.equal(['numpy', 'pandas']);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('filters out local modules that exist as .py files in the same directory', async () => {
    setPipreqsMock(async () => 'pandas\nnumpy\n');

    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'imports-'));
    const file = path.join(tmp, 'entrypoint.py');
    await fs.writeFile(path.join(tmp, 'helper.py'), '# local helper module\n');
    await fs.writeFile(
      file,
      ['import pandas', 'import numpy', 'import helper', 'from helper import some_function as f'].join('\n')
    );
    const imports = await scanFileForImports(file);
    expect([...imports].sort()).to.deep.equal(['numpy', 'pandas']);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('filters out local packages that exist as subdirectories', async () => {
    setPipreqsMock(async () => 'pandas\nnumpy\n');

    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'imports-'));
    const file = path.join(tmp, 'entrypoint.py');
    await fs.mkdir(path.join(tmp, 'utils'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'utils', '__init__.py'), '# utils package\n');
    await fs.writeFile(path.join(tmp, 'utils', 'helper.py'), 'def process(): pass\n');
    await fs.writeFile(file, ['import pandas', 'import numpy', 'from utils import helper', 'import utils'].join('\n'));
    const imports = await scanFileForImports(file);
    expect([...imports].sort()).to.deep.equal(['numpy', 'pandas']);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('filters nested local packages by checking only top-level directory', async () => {
    setPipreqsMock(async () => 'pandas\n');

    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'imports-'));
    const file = path.join(tmp, 'entrypoint.py');
    // Create deeply nested local package structure
    await fs.mkdir(path.join(tmp, 'utils', 'nested', 'deep'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'utils', '__init__.py'), '');
    await fs.writeFile(path.join(tmp, 'utils', 'nested', '__init__.py'), '');
    await fs.writeFile(path.join(tmp, 'utils', 'nested', 'deep', 'module.py'), 'def fn(): pass\n');
    await fs.writeFile(
      file,
      ['import pandas', 'from utils.nested.deep import module', 'import utils.nested'].join('\n')
    );
    const imports = await scanFileForImports(file);
    expect([...imports].sort()).to.deep.equal(['pandas']);
    await fs.rm(tmp, { recursive: true, force: true });
  });
});

describe('nativeScan: writeRequirementsFile', () => {
  afterEach(() => {
    setPipreqsMock(null);
  });

  it('writes new requirements.txt in the parent of the entrypoint', async () => {
    setPipreqsMock(async () => 'pandas\nnumpy\n');

    const dir = await makePackage({
      entrypoint: 'import pandas\nfrom numpy import array\nfrom datacustomcode.client import Client\n',
    });
    const file = path.join(dir, 'payload', 'entrypoint.py');
    const { requirementsPath, merged } = await writeRequirementsFile(file);
    expect(requirementsPath).to.equal(path.join(dir, 'requirements.txt'));
    expect(merged).to.deep.equal(['numpy', 'pandas']);
    const written = await fs.readFile(requirementsPath, 'utf8');
    expect(written.trim().split('\n')).to.deep.equal(['numpy', 'pandas']);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('merges with existing requirements.txt and dedupes', async () => {
    setPipreqsMock(async () => 'pandas\n');

    const dir = await makePackage({
      entrypoint: 'import pandas\nfrom datacustomcode.client import Client\n',
    });
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'requests\npandas\n');
    const { merged } = await writeRequirementsFile(path.join(dir, 'payload', 'entrypoint.py'));
    expect(merged).to.deep.equal(['pandas', 'requests']);
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe('nativeScan: updateConfig', () => {
  it('updates entryPoint and permissions for script package', async () => {
    const dir = await makePackage({
      entrypoint:
        'from datacustomcode.client import Client\n' +
        'def main():\n' +
        '    c = Client()\n' +
        '    c.read_dlo("In__dll")\n' +
        '    c.write_to_dlo("Out__dll", df)\n',
    });
    const file = path.join(dir, 'payload', 'entrypoint.py');
    const cfg = (await updateConfig(file, 'script')) as {
      entryPoint: string;
      dataspace: string;
      permissions: { read: { dlo?: string[] }; write: { dlo?: string[] } };
    };
    expect(cfg.entryPoint).to.equal('entrypoint.py');
    expect(cfg.dataspace).to.equal('default');
    expect(cfg.permissions.read.dlo).to.deep.equal(['In__dll']);
    expect(cfg.permissions.write.dlo).to.deep.equal(['Out__dll']);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('writes a streaming config, keeping streamingSource.name as the only read', async () => {
    const dir = await makePackage({
      entrypoint: STREAMING_ENTRYPOINT,
      config: {
        dataspace: 'default',
        streamingSource: { type: 'dlo', name: 'Account__dll' },
        permissions: { read: { dlo: ['Stale__dll'] }, write: { dlo: ['Stale__dll'] } },
      },
    });
    const cfg = await updateConfig(path.join(dir, 'payload', 'entrypoint.py'), 'script');
    expect(cfg.streamingSource).to.deep.equal({ type: 'dlo', name: 'Account__dll' });
    expect(cfg.permissions).to.deep.equal({
      read: { dlo: ['Account__dll'] },
      write: { dlo: ['Account_std_copy__dll'] },
    });
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('clears streamingSource.name when the scanned read layer no longer matches its type', async () => {
    const dir = await makePackage({
      entrypoint: STREAMING_ENTRYPOINT.replace('read_dlo_deltas', 'read_dmo_deltas').replace(
        'write_dlo_deltas',
        'write_dmo_deltas'
      ),
      config: { dataspace: 'default', streamingSource: { type: 'dlo', name: 'Orders__dll' } },
    });
    const cfg = await updateConfig(path.join(dir, 'payload', 'entrypoint.py'), 'script');
    expect(cfg.streamingSource).to.deep.equal({ type: 'dmo', name: '' });
    expect(isStreamingSourceNameMissing(cfg)).to.equal(true);
    expect(cfg.permissions).to.deep.equal({ read: { dmo: [] }, write: { dmo: ['Account_std_copy__dll'] } });
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('writes an empty streaming read permission when streamingSource.name is not set', async () => {
    const dir = await makePackage({ entrypoint: STREAMING_ENTRYPOINT, config: { dataspace: 'default' } });
    const cfg = await updateConfig(path.join(dir, 'payload', 'entrypoint.py'), 'script');
    expect(cfg.streamingSource).to.deep.equal({ type: 'dlo', name: '' });
    expect(cfg.permissions).to.deep.equal({ read: { dlo: [] }, write: { dlo: ['Account_std_copy__dll'] } });
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('drops streamingSource when the entrypoint is no longer streaming', async () => {
    const dir = await makePackage({
      entrypoint: 'c.read_dlo("In__dll")\nc.write_to_dlo("Out__dll", df)\n',
      config: { dataspace: 'default', streamingSource: { type: 'dlo', name: 'In__dll' } },
    });
    const cfg = await updateConfig(path.join(dir, 'payload', 'entrypoint.py'), 'script');
    expect(cfg).to.not.have.property('streamingSource');
    expect(cfg.permissions).to.deep.equal({ read: { dlo: ['In__dll'] }, write: { dlo: ['Out__dll'] } });
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('preserves a non-default dataspace value', async () => {
    const dir = await makePackage({
      entrypoint:
        'from datacustomcode.client import Client\n' +
        'def main():\n' +
        '    c = Client()\n' +
        '    c.read_dlo("In__dll")\n' +
        '    c.write_to_dlo("Out__dll", df)\n',
      config: { dataspace: 'CustomSpace' },
    });
    const cfg = (await updateConfig(path.join(dir, 'payload', 'entrypoint.py'), 'script')) as { dataspace: string };
    expect(cfg.dataspace).to.equal('CustomSpace');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('skips permissions for function packages', async () => {
    const dir = await makePackage({
      entrypoint: 'from datacustomcode.function import Runtime\ndef function(req, runtime):\n    return {}\n',
      config: {},
      packageType: 'function',
    });
    const cfg = await updateConfig(path.join(dir, 'payload', 'entrypoint.py'), 'function');
    expect(cfg.entryPoint).to.equal('entrypoint.py');
    expect(cfg.permissions).to.be.undefined;
    expect(cfg.dataspace).to.be.undefined;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('throws ConfigNotFound when config.json is missing', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nativescan-'));
    await fs.mkdir(path.join(dir, 'payload'), { recursive: true });
    await fs.writeFile(path.join(dir, 'payload', 'entrypoint.py'), 'def main():\n    pass\n');
    let caught: Error | undefined;
    try {
      await updateConfig(path.join(dir, 'payload', 'entrypoint.py'), 'script');
    } catch (e) {
      caught = e as Error;
    }
    expect(caught?.name).to.equal('ConfigNotFound');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('throws MissingDataspace when script config.json has no dataspace key', async () => {
    const dir = await makePackage({
      entrypoint:
        'from datacustomcode.client import Client\n' +
        'def main():\n' +
        '    c.read_dlo("In__dll")\n' +
        '    c.write_to_dlo("Out__dll", df)\n',
      config: {},
    });
    let caught: Error | undefined;
    try {
      await updateConfig(path.join(dir, 'payload', 'entrypoint.py'), 'script');
    } catch (e) {
      caught = e as Error;
    }
    expect(caught?.name).to.equal('MissingDataspace');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('falls back to dataspace=default when value is whitespace-only', async () => {
    const dir = await makePackage({
      entrypoint:
        'from datacustomcode.client import Client\n' +
        'def main():\n' +
        '    c.read_dlo("In__dll")\n' +
        '    c.write_to_dlo("Out__dll", df)\n',
      config: { dataspace: '   ' },
    });
    const cfg = (await updateConfig(path.join(dir, 'payload', 'entrypoint.py'), 'script')) as { dataspace: string };
    expect(cfg.dataspace).to.equal('default');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('throws InvalidConfig when config.json is malformed JSON', async () => {
    const dir = await makePackage({
      entrypoint:
        'from datacustomcode.client import Client\n' +
        'def main():\n' +
        '    c.read_dlo("In__dll")\n' +
        '    c.write_to_dlo("Out__dll", df)\n',
    });
    await fs.writeFile(path.join(dir, 'payload', 'config.json'), '{ this is : not json ');
    let caught: Error | undefined;
    try {
      await updateConfig(path.join(dir, 'payload', 'entrypoint.py'), 'script');
    } catch (e) {
      caught = e as Error;
    }
    expect(caught?.name).to.equal('InvalidConfig');
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe('nativeScan: findBaseDirectory + getPackageType', () => {
  it('finds the base directory containing .datacustomcode_proj', async () => {
    const dir = await makePackage({
      entrypoint:
        'from datacustomcode.client import Client\n' +
        'def main():\n' +
        '    c.read_dlo("X__dll")\n' +
        '    c.write_to_dlo("Y__dll", df)\n',
    });
    const file = path.join(dir, 'payload', 'entrypoint.py');
    expect(findBaseDirectory(file)).to.equal(path.resolve(dir));
    expect(await getPackageType(dir)).to.equal('script');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('defaults package type to script when SDK config is missing', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nativescan-'));
    expect(await getPackageType(dir)).to.equal('script');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('returns function when SDK config says so', async () => {
    const dir = await makePackage({
      entrypoint: 'def function(req, runtime):\n    return {}\n',
      config: {},
      packageType: 'function',
    });
    expect(await getPackageType(dir)).to.equal('function');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('throws MissingPackageType when sdk_config.json is missing the type field', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nativescan-'));
    await fs.mkdir(path.join(dir, '.datacustomcode_proj'), { recursive: true });
    await fs.writeFile(path.join(dir, '.datacustomcode_proj', 'sdk_config.json'), JSON.stringify({}));
    let caught: Error | undefined;
    try {
      await getPackageType(dir);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught?.name).to.equal('MissingPackageType');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('throws InvalidPackageType when type field is not script or function', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nativescan-'));
    await fs.mkdir(path.join(dir, '.datacustomcode_proj'), { recursive: true });
    await fs.writeFile(path.join(dir, '.datacustomcode_proj', 'sdk_config.json'), JSON.stringify({ type: 'notebook' }));
    let caught: Error | undefined;
    try {
      await getPackageType(dir);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught?.name).to.equal('InvalidPackageType');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('throws InvalidSdkConfig when sdk_config.json is malformed JSON', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nativescan-'));
    await fs.mkdir(path.join(dir, '.datacustomcode_proj'), { recursive: true });
    await fs.writeFile(path.join(dir, '.datacustomcode_proj', 'sdk_config.json'), '{ broken');
    let caught: Error | undefined;
    try {
      await getPackageType(dir);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught?.name).to.equal('InvalidSdkConfig');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('falls back to startDir when no .datacustomcode_proj marker is found', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nativescan-'));
    const file = path.join(dir, 'orphan.py');
    await fs.writeFile(file, '# no package marker anywhere\n');
    expect(findBaseDirectory(file)).to.equal(path.resolve(dir));
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('falls back to parent of payload/ when no marker exists but dir is named payload', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nativescan-'));
    const payloadDir = path.join(dir, 'payload');
    await fs.mkdir(payloadDir, { recursive: true });
    const file = path.join(payloadDir, 'entrypoint.py');
    await fs.writeFile(file, '# no marker\n');
    expect(findBaseDirectory(file)).to.equal(path.resolve(dir));
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe('nativeScan: executeNativeScan', () => {
  afterEach(() => {
    setPipreqsMock(null);
  });

  it('updates config.json and writes requirements.txt by default', async () => {
    setPipreqsMock(async () => 'pandas\nnumpy\n');

    const dir = await makePackage({
      entrypoint:
        'import pandas\n' +
        'from numpy import array\n' +
        'from datacustomcode.client import Client\n' +
        'def main():\n' +
        '    c = Client()\n' +
        '    c.read_dlo("Source__dll")\n' +
        '    c.write_to_dlo("Dest__dll", df)\n',
    });

    const result = await executeNativeScan({ workingDir: dir, packageType: 'script' });

    expect(result.dryRun).to.be.false;
    expect(result.requirementsPath).to.equal(path.join(dir, 'requirements.txt'));
    expect(result.requirements).to.deep.equal(['numpy', 'pandas']);
    expect(result.filesScanned).to.deep.equal([path.join('payload', 'entrypoint.py')]);

    const cfg = JSON.parse(await fs.readFile(result.configPath, 'utf8')) as {
      permissions: { read: { dlo?: string[] }; write: { dlo?: string[] } };
    };
    expect(cfg.permissions.read.dlo).to.deep.equal(['Source__dll']);
    expect(cfg.permissions.write.dlo).to.deep.equal(['Dest__dll']);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('does not modify any files in dry-run mode', async () => {
    setPipreqsMock(async () => 'pandas\n');

    const dir = await makePackage({
      entrypoint:
        'import pandas\n' +
        'from datacustomcode.client import Client\n' +
        'def main():\n' +
        '    c.read_dlo("Source__dll")\n' +
        '    c.write_to_dlo("Dest__dll", df)\n',
    });
    const before = await fs.readFile(path.join(dir, 'payload', 'config.json'), 'utf8');

    const result = await executeNativeScan({ workingDir: dir, packageType: 'script', dryRun: true });

    expect(result.dryRun).to.be.true;
    expect(result.requirementsPath).to.be.undefined;
    expect(await fs.readFile(path.join(dir, 'payload', 'config.json'), 'utf8')).to.equal(before);
    let requirementsExists = true;
    try {
      await fs.access(path.join(dir, 'requirements.txt'));
    } catch {
      requirementsExists = false;
    }
    expect(requirementsExists).to.be.false;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('skips requirements with noRequirements=true', async () => {
    const dir = await makePackage({
      entrypoint:
        'import pandas\n' +
        'from datacustomcode.client import Client\n' +
        'def main():\n' +
        '    c.read_dlo("Source__dll")\n' +
        '    c.write_to_dlo("Dest__dll", df)\n',
    });

    const result = await executeNativeScan({ workingDir: dir, packageType: 'script', noRequirements: true });

    expect(result.requirementsPath).to.be.undefined;
    let exists = true;
    try {
      await fs.access(path.join(dir, 'requirements.txt'));
    } catch {
      exists = false;
    }
    expect(exists).to.be.false;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('throws EntrypointNotFound when entrypoint is missing', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nativescan-'));
    let caught: Error | undefined;
    try {
      await executeNativeScan({ workingDir: dir, packageType: 'script' });
    } catch (e) {
      caught = e as Error;
    }
    expect(caught?.name).to.equal('EntrypointNotFound');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('resolves package type from .datacustomcode_proj when packageType is not passed', async () => {
    setPipreqsMock(async () => '');

    // Function package. If executeNativeScan resolves type from sdk_config it will skip
    // the permission scan. If it incorrectly defaults to script it would either fill in
    // permissions (wrong) or throw InvalidEntrypoint when no read_*/write_to_* calls exist.
    const dir = await makePackage({
      entrypoint: 'from datacustomcode.function import Runtime\ndef function(req, rt):\n    return {}\n',
      config: {},
      packageType: 'function',
    });
    const result = await executeNativeScan({ workingDir: dir });
    expect(result.config.entryPoint).to.equal('entrypoint.py');
    expect(result.config.permissions).to.be.undefined;
    expect(result.config.dataspace).to.be.undefined;
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe('nativeScan: executeNativeScan confirmWrite', () => {
  const ENTRYPOINT =
    'from datacustomcode.client import Client\n' +
    'def main():\n' +
    '    c.read_dlo("Source__dll")\n' +
    '    c.write_to_dlo("Dest__dll", df)\n';

  beforeEach(() => {
    setPipreqsMock(async () => 'pandas\n');
  });

  afterEach(() => {
    setPipreqsMock(null);
  });

  it('omits written when confirmWrite is not supplied', async () => {
    const dir = await makePackage({ entrypoint: ENTRYPOINT });
    const result = await executeNativeScan({ workingDir: dir, packageType: 'script' });
    expect(result).not.to.have.property('written');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('writes when confirmWrite resolves true, passing the updated config', async () => {
    const dir = await makePackage({ entrypoint: ENTRYPOINT });
    let seen: Record<string, unknown> | undefined;
    const result = await executeNativeScan({
      workingDir: dir,
      packageType: 'script',
      confirmWrite: async (config) => {
        seen = config;
        return true;
      },
    });
    expect(seen).to.equal(result.config);
    expect(result).not.to.have.property('written');
    expect(result.requirementsPath).to.equal(path.join(dir, 'requirements.txt'));
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('writes nothing when confirmWrite resolves false', async () => {
    const dir = await makePackage({ entrypoint: ENTRYPOINT });
    const before = await fs.readFile(path.join(dir, 'payload', 'config.json'), 'utf8');
    const result = await executeNativeScan({ workingDir: dir, packageType: 'script', confirmWrite: async () => false });
    expect(result.written).to.equal(false);
    expect(result.requirementsPath).to.be.undefined;
    expect(await fs.readFile(path.join(dir, 'payload', 'config.json'), 'utf8')).to.equal(before);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('refuses to write when config.json changes while confirmWrite waits', async () => {
    const dir = await makePackage({ entrypoint: ENTRYPOINT });
    const configPath = path.join(dir, 'payload', 'config.json');
    const edited = JSON.stringify({ dataspace: 'edited', dataLineage: { 'Dest.dll': { Id: ['Source.Id'] } } });
    try {
      await executeNativeScan({
        workingDir: dir,
        packageType: 'script',
        confirmWrite: async () => {
          await fs.writeFile(configPath, edited);
          return true;
        },
      });
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as SfError).name).to.equal('ScanConfigChangedDuringConfirm');
    }
    expect(await fs.readFile(configPath, 'utf8')).to.equal(edited);
    let requirementsExists = true;
    try {
      await fs.access(path.join(dir, 'requirements.txt'));
    } catch {
      requirementsExists = false;
    }
    expect(requirementsExists).to.be.false;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('never calls confirmWrite on dry run', async () => {
    const dir = await makePackage({ entrypoint: ENTRYPOINT });
    let called = false;
    await executeNativeScan({
      workingDir: dir,
      packageType: 'script',
      dryRun: true,
      confirmWrite: async () => {
        called = true;
        return true;
      },
    });
    expect(called).to.be.false;
    await fs.rm(dir, { recursive: true, force: true });
  });
});
