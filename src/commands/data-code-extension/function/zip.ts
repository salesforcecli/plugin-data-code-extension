import { Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { ZipBase } from '../../../base/zipBase.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-data-code-extension', 'zip');

export default class Zip extends ZipBase {
  public static readonly summary = messages.getMessage('summary', ['function']);
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages
    // eslint-disable-next-line sf-plugin/no-missing-messages
    .getMessages('examples')
    .map((example) => example.replace(/%s/g, 'function'));

  public static readonly flags = {
    'package-dir': Flags.directory({
      char: 'p',
      summary: messages.getMessage('flags.packageDir.summary'),
      description: messages.getMessage('flags.packageDir.description'),
      required: true,
    }),
    network: Flags.string({
      char: 'n',
      summary: messages.getMessage('flags.network.summary'),
      description: messages.getMessage('flags.network.description'),
      required: false,
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
