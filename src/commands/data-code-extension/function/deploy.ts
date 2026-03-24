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
import { Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { DeployBase, type BaseDeployFlags } from '../../../base/deployBase.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-data-code-extension', 'deploy');

export type FunctionDeployFlags = BaseDeployFlags & {
  'function-invoke-opt': string;
};

// eslint-disable-next-line sf-plugin/only-extend-SfCommand
export default class Deploy extends DeployBase<FunctionDeployFlags> {
  public static readonly summary = messages.getMessage('summary', ['function']);
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages
    // eslint-disable-next-line sf-plugin/no-missing-messages
    .getMessages('examples')
    .map((example) => example.replace(/%s/g, 'function'));

  public static readonly flags = {
    ...DeployBase.flags,
    // Function-specific flag
    'function-invoke-opt': Flags.string({
      summary: messages.getMessage('flags.functionInvokeOpt.summary'),
      description: messages.getMessage('flags.functionInvokeOpt.description'),
      required: true,
    }),
  };

  // eslint-disable-next-line class-methods-use-this
  protected getCodeType(): 'function' {
    return 'function';
  }

  // eslint-disable-next-line class-methods-use-this
  protected getMessages(): Messages<string> {
    return messages;
  }

  // eslint-disable-next-line class-methods-use-this
  protected getAdditionalFlags(flags: FunctionDeployFlags): Record<string, unknown> {
    return {
      functionInvokeOpt: flags['function-invoke-opt'],
    };
  }
}
