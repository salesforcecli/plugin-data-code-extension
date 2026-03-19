import { Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { InitBase } from '../../../base/initBase.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('data-code-extension', 'init');

export default class Init extends InitBase {
  public static readonly summary = messages.getMessage('summary', ['function']);
  public static readonly description = messages.getMessage('description');
  // eslint-disable-next-line sf-plugin/no-missing-messages
  public static readonly examples = messages.getMessages('examples').map(example =>
    example.replace(/%s/g, 'function')
  );

  public static readonly flags = {
    'package-dir': Flags.directory({
      char: 'p',
      summary: messages.getMessage('flags.packageDir.summary'),
      description: messages.getMessage('flags.packageDir.description'),
      required: true,
      exists: false,  // Allow non-existing directories (will be created)
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
