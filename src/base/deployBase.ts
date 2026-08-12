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
import { Messages, Org, SfError } from '@salesforce/core';
import { NativeDeployer } from '../utils/nativeDeploy.js';
import { type SharedResultProps } from './types.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-data-code-extension', 'deploy');

export type BaseDeployFlags = {
  name: string;
  'package-version': string;
  description: string;
  'package-dir': string;
  'target-org': Org;
  'cpu-size': string;
  network?: string;
};

export type DeployResult = SharedResultProps & {
  targetOrg: string;
  name: string;
  version: string;
  status: string;
  deploymentId?: string;
  endpointUrl?: string;
};

// eslint-disable-next-line sf-plugin/command-summary, sf-plugin/command-example
export abstract class DeployBase<TFlags extends BaseDeployFlags = BaseDeployFlags> extends SfCommand<DeployResult> {
  public static enableJsonFlag = false;

  public static readonly flags = {
    name: Flags.string({
      char: 'n',
      summary: messages.getMessage('flags.name.summary'),
      description: messages.getMessage('flags.name.description'),
      required: true,
      parse: (input) => {
        if (input.length === 0) throw new SfError(messages.getMessage('error.flagEmpty', ['name']), 'InvalidFlagValue');
        if (input.length > 64)
          throw new SfError(
            messages.getMessage('error.flagTooLong', ['name', '64', input.length.toString()]),
            'InvalidFlagValue'
          );
        return Promise.resolve(input);
      },
    }),
    'package-version': Flags.string({
      summary: messages.getMessage('flags.packageVersion.summary'),
      description: messages.getMessage('flags.packageVersion.description'),
      required: true,
      parse: (input) => {
        if (input.length === 0)
          throw new SfError(messages.getMessage('error.flagEmpty', ['package-version']), 'InvalidFlagValue');
        if (input.length > 64)
          throw new SfError(
            messages.getMessage('error.flagTooLong', ['package-version', '64', input.length.toString()]),
            'InvalidFlagValue'
          );
        return Promise.resolve(input);
      },
    }),
    description: Flags.string({
      char: 'd',
      summary: messages.getMessage('flags.description.summary'),
      description: messages.getMessage('flags.description.description'),
      required: true,
      parse: (input) => {
        if (input.length === 0)
          throw new SfError(messages.getMessage('error.flagEmpty', ['description']), 'InvalidFlagValue');
        if (input.length > 255)
          throw new SfError(
            messages.getMessage('error.flagTooLong', ['description', '255', input.length.toString()]),
            'InvalidFlagValue'
          );
        return Promise.resolve(input);
      },
    }),
    network: Flags.string({
      summary: messages.getMessage('flags.network.summary'),
      description: messages.getMessage('flags.network.description'),
      required: false,
    }),
    'package-dir': Flags.directory({
      char: 'p',
      summary: messages.getMessage('flags.packageDir.summary'),
      description: messages.getMessage('flags.packageDir.description'),
      required: true,
      exists: true,
    }),
    'cpu-size': Flags.string({
      summary: messages.getMessage('flags.cpuSize.summary'),
      description: messages.getMessage('flags.cpuSize.description'),
      options: ['CPU_L', 'CPU_XL', 'CPU_2XL', 'CPU_4XL'],
      default: 'CPU_2XL',
    }),
    'target-org': Flags.requiredOrg({
      char: 'o',
      summary: messages.getMessage('flags.targetOrg.summary'),
      description: messages.getMessage('flags.targetOrg.description'),
      required: true,
    }),
  };

  public async run(): Promise<DeployResult> {
    const { flags } = (await this.parse(this.constructor as typeof DeployBase)) as unknown as { flags: TFlags };
    const codeType = this.getCodeType();
    const cmdMessages = this.getMessages();

    const name = flags.name;
    const version = flags['package-version'];
    const description = flags.description;
    const packageDir = flags['package-dir'];
    const targetOrg = flags['target-org'];
    const cpuSize = flags['cpu-size'] || 'CPU_2XL';
    const network = flags.network;

    if (packageDir.length === 0) {
      throw new SfError(messages.getMessage('error.flagEmpty', ['package-dir']), 'InvalidFlagValue');
    }

    try {
      const orgUsername = targetOrg.getUsername() ?? 'target org';
      this.spinner.start(cmdMessages.getMessage('info.authenticating', [orgUsername]));

      const connection = targetOrg.getConnection();
      await connection.refreshAuth();

      this.spinner.stop();
      this.log(cmdMessages.getMessage('info.authenticated', [orgUsername]));

      this.log(cmdMessages.getMessage('info.deployingPackage'));
      const result = await NativeDeployer.deploy({
        name,
        version,
        description,
        packageDir,
        cpuSize,
        network,
        connection,
        log: this.log.bind(this),
      });

      this.log(cmdMessages.getMessage('info.deploymentComplete', [result.name, result.version]));

      this.log(cmdMessages.getMessage('info.deploySuccess'));

      return {
        success: true,
        codeType,
        packageDir,
        targetOrg: orgUsername,
        name: result.name,
        version: result.version,
        status: result.status,
        message: cmdMessages.getMessage('info.deploySuccess'),
      };
    } catch (error) {
      this.spinner.stop();

      // The error will be properly handled by the Salesforce CLI framework
      // as an SfError with actions, so we just throw it
      throw error;
    }
  }

  protected abstract getCodeType(): 'script' | 'function';
  protected abstract getMessages(): Messages<string>;
}
