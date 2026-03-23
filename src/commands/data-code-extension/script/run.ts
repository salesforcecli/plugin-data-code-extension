import { Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { RunBase } from '../../../base/runBase.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-data-code-extension', 'run');

export default class Run extends RunBase {
  public static readonly summary = messages.getMessage('summary', ['script']);
  public static readonly description = messages.getMessage('description');
  // eslint-disable-next-line sf-plugin/no-missing-messages
  public static readonly examples = messages.getMessages('examples').map((example) => example.replace(/%s/g, 'script'));

  public static readonly flags = {
    entrypoint: Flags.file({
      char: 'e',
      summary: messages.getMessage('flags.entrypoint.summary'),
      description: messages.getMessage('flags.entrypoint.description'),
      required: true,
      exists: true,
    }),
    'target-org': Flags.requiredOrg({
      char: 'o',
      summary: messages.getMessage('flags.targetOrg.summary'),
      description: messages.getMessage('flags.targetOrg.description'),
      required: true,
    }),
    'config-file': Flags.file({
      summary: messages.getMessage('flags.configFile.summary'),
      description: messages.getMessage('flags.configFile.description'),
      required: false,
      exists: true,
    }),
    dependencies: Flags.string({
      summary: messages.getMessage('flags.dependencies.summary'),
      description: messages.getMessage('flags.dependencies.description'),
      required: false,
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
}
