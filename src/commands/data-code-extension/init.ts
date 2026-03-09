import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { PythonChecker, PythonVersionInfo } from '../../utils/pythonChecker.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('data-code-extension', 'data-code-extension.init');

export type InitResult = {
  success: boolean;
  pythonVersion: PythonVersionInfo;
  message: string;
};

export default class Init extends SfCommand<InitResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public async run(): Promise<InitResult> {
    this.spinner.start(messages.getMessage('info.checkingPython'));

    try {
      // Check Python 3.11+ is installed
      const pythonInfo = await PythonChecker.checkPython311();

      this.spinner.stop();
      this.log(messages.getMessage('info.pythonFound', [pythonInfo.version, pythonInfo.command]));

      // Add any additional initialization logic here in the future

      this.log(messages.getMessage('info.initSuccess'));

      return {
        success: true,
        pythonVersion: pythonInfo,
        message: messages.getMessage('info.initSuccess'),
      };
    } catch (error) {
      this.spinner.stop();

      // The error will be properly handled by the Salesforce CLI framework
      // as an SfError with actions, so we just throw it
      throw error;
    }
  }
}
