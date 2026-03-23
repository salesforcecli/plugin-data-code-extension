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
