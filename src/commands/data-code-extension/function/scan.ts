import { Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { ScanBase } from '../../../base/scanBase.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-data-code-extension', 'scan');

export default class Scan extends ScanBase {
  public static readonly summary = messages.getMessage('summary', ['function']);
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples', [
    'function',
    'function',
    'function',
    'function',
    'function',
    'function',
  ]);

  public static readonly flags = {
    entrypoint: Flags.string({
      char: 'e',
      summary: messages.getMessage('flags.entrypoint.summary'),
      description: messages.getMessage('flags.entrypoint.description'),
      required: false,
    }),
    'config-file': Flags.file({
      summary: messages.getMessage('flags.configFile.summary'),
      description: messages.getMessage('flags.configFile.description'),
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
  protected getCodeType(): 'function' {
    return 'function';
  }

  // eslint-disable-next-line class-methods-use-this
  protected getMessages(): Messages<string> {
    return messages;
  }
}
