import { Messages } from '@salesforce/core';
import { DeployBase } from '../../../base/deployBase.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-data-code-extension', 'deploy');

// eslint-disable-next-line sf-plugin/only-extend-SfCommand
export default class Deploy extends DeployBase {
  public static readonly summary = messages.getMessage('summary', ['script']);
  public static readonly description = messages.getMessage('description');
  // eslint-disable-next-line sf-plugin/no-missing-messages
  public static readonly examples = messages.getMessages('examples').map((example) => example.replace(/%s/g, 'script'));

  public static readonly flags = {
    ...DeployBase.flags,
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
  protected getAdditionalFlags(): Record<string, unknown> {
    return {};
  }
}
