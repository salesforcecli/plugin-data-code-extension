import { Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { InitBase } from '../../../base/initBase.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-data-code-extension', 'init');

// eslint-disable-next-line sf-plugin/only-extend-SfCommand
export default class Init extends InitBase {
  public static readonly summary = messages.getMessage('summary', ['script']);
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples', ['script', 'script', 'script']);

  public static readonly flags = {
    ...InitBase.flags,
    'package-dir': Flags.directory({
      char: 'p',
      summary: messages.getMessage('flags.packageDir.summary'),
      description: messages.getMessage('flags.packageDir.description'),
      required: true,
      exists: false, // Allow non-existing directories (will be created)
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
