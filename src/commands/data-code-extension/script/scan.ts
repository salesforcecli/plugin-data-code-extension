import { Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { ScanBase } from '../../../base/scanBase.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('data-code-extension', 'scan');

export default class Scan extends ScanBase {
  public static readonly summary = messages.getMessage('summary', ['script']);
  public static readonly description = messages.getMessage('description');
  // eslint-disable-next-line sf-plugin/no-missing-messages
  public static readonly examples = messages.getMessages('examples').map(example =>
    example.replace(/%s/g, 'script')
  );

  public static readonly flags = {
    'entrypoint': Flags.string({
      char: 'e',
      summary: messages.getMessage('flags.entrypoint.summary'),
      description: messages.getMessage('flags.entrypoint.description'),
      required: false,
    }),
    'config': Flags.file({
      char: 'c',
      summary: messages.getMessage('flags.config.summary'),
      description: messages.getMessage('flags.config.description'),
      required: false,
      exists: true,
    }),
    'dry-run': Flags.boolean({
      char: 'd',
      summary: messages.getMessage('flags.dryRun.summary'),
      description: messages.getMessage('flags.dryRun.description'),
      default: false,
    }),
    'no-requirements': Flags.boolean({
      char: 'n',
      summary: messages.getMessage('flags.noRequirements.summary'),
      description: messages.getMessage('flags.noRequirements.description'),
      default: false,
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
