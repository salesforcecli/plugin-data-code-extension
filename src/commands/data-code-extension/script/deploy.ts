import { Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { DeployBase, type BaseDeployFlags } from '../../../base/deployBase.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('data-code-extension', 'deploy');

export default class Deploy extends DeployBase {
  public static readonly summary = messages.getMessage('summary', ['script']);
  public static readonly description = messages.getMessage('description');
  // eslint-disable-next-line sf-plugin/no-missing-messages
  public static readonly examples = messages.getMessages('examples').map((example) => example.replace(/%s/g, 'script'));

  public static readonly flags = {
    name: Flags.string({
      char: 'n',
      summary: messages.getMessage('flags.name.summary'),
      description: messages.getMessage('flags.name.description'),
      required: true,
    }),
    version: Flags.string({
      char: 'v',
      summary: messages.getMessage('flags.version.summary'),
      description: messages.getMessage('flags.version.description'),
      required: true,
    }),
    description: Flags.string({
      char: 'd',
      summary: messages.getMessage('flags.description.summary'),
      description: messages.getMessage('flags.description.description'),
      required: true,
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

  // eslint-disable-next-line class-methods-use-this
  protected getCodeType(): 'script' {
    return 'script';
  }

  // eslint-disable-next-line class-methods-use-this
  protected getMessages(): Messages<string> {
    return messages;
  }

  // eslint-disable-next-line class-methods-use-this
  protected getAdditionalFlags(_: BaseDeployFlags): Record<string, unknown> {
    return {};
  }
}
