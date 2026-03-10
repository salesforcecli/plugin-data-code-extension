# error.binaryNotFound

The 'datacustomcode' command is not found in your system PATH.

# error.binaryNotExecutable

The 'datacustomcode' command was found but failed to execute properly.

# actions.binaryNotFound

- Verify the pip package is installed: pip show salesforce-data-customcode
- Reinstall the package: pip install --force-reinstall salesforce-data-customcode
- Check if pip scripts directory is in PATH:
  - On macOS/Linux: Check ~/.local/bin or the Python scripts directory
  - On Windows: Check %APPDATA%\Python\Scripts or C:\PythonXX\Scripts
- Add the scripts directory to your PATH:
  - On macOS/Linux: export PATH="$PATH:~/.local/bin"
  - On Windows: Add the Scripts directory to your PATH environment variable
- If using a virtual environment, ensure it's activated before running this command
- Verify installation by running: datacustomcode version

# actions.binaryNotExecutable

- Check file permissions: ls -l $(which datacustomcode)
- Reinstall the package: pip install --force-reinstall salesforce-data-customcode
- Verify your Python environment is correctly configured
- Try running with full path if known: /path/to/datacustomcode version
- If using a virtual environment, ensure it's activated
- Check for any error messages when running: datacustomcode version

# error.initPermissionDenied

Permission denied when creating package at '%s'

# error.initDirectoryExists

Directory '%s' already exists and is not empty

# error.initExecutionFailed

Failed to initialize package at '%s': %s

# actions.initPermissionDenied

- Check that you have write permissions for the directory
- Try running the command with appropriate permissions
- Ensure the parent directory exists

# actions.initDirectoryExists

- Choose a different directory name
- Remove or rename the existing directory
- Use --force flag to overwrite (if supported)

# actions.initExecutionFailed

- Verify the datacustomcode binary is properly installed
- Check that all required dependencies are installed
- Run 'datacustomcode version' to verify the binary works
- Check the error message for specific issues

# error.scanPermissionDenied

Permission denied when scanning package at '%s'

# error.configNotFound

Config file not found at '%s'

# error.notInPackageDir

Current directory is not an initialized Data Code Extension package

# error.scanExecutionFailed

Failed to scan package at '%s': %s

# actions.scanPermissionDenied

- Check that you have read permissions for the directory
- Verify all Python files are readable
- Ensure the config file is writable

# actions.configNotFound

- Verify the config file path is correct
- Check if you're in the right directory
- Run 'init' command first if package is not initialized
- Use default config path: payload/config.json

# actions.notInPackageDir

- Change to an initialized package directory
- Run 'data-code-extension init' first to initialize a package
- Check that config.json exists in the payload directory

# actions.scanExecutionFailed

- Verify the datacustomcode binary is properly installed
- Check that the package directory contains valid Python files
- Run 'datacustomcode version' to verify the binary works
- Check the error message for specific issues

# error.zipPermissionDenied

Permission denied when creating archive for package at '%s'

# error.packageDirNotFound

Package directory not found at '%s'

# error.notInitializedPackage

Directory '%s' is not an initialized Data Code Extension package

# error.insufficientDiskSpace

Insufficient disk space to create archive

# error.zipExecutionFailed

Failed to create archive for package at '%s': %s

# actions.zipPermissionDenied

- Check that you have read permissions for the package directory
- Verify you have write permissions for the output location
- Ensure all files in the package are readable

# actions.packageDirNotFound

- Verify the package directory path is correct
- Check that the directory exists
- Run 'init' command first to create a package

# actions.notInitializedPackage

- Ensure the directory contains a valid package structure
- Check for config.json in the payload directory
- Run 'init' command first to initialize the package

# actions.insufficientDiskSpace

- Free up disk space on your system
- Use a different output location with more space
- Remove unnecessary files or archives

# actions.zipExecutionFailed

- Verify the datacustomcode binary is properly installed
- Check that the package directory is valid
- Run 'datacustomcode version' to verify the binary works
- Check the error message for specific issues

# error.deployAuthenticationFailed

Failed to authenticate with Salesforce org '%s'

# error.deployPackageInvalid

Package validation failed for '%s'. The package format is invalid or corrupted.

# error.deployConflict

A deployment with name '%s' and version '%s' already exists

# error.deployQuotaExceeded

Deployment quota exceeded for the organization

# error.deployNetworkError

Network error occurred during deployment

# error.deployExecutionFailed

Failed to deploy package '%s': %s

# actions.deployAuthenticationFailed

- Verify the target org username/alias is correct
- Re-authenticate with 'sf org login web' or 'sf org login sfdx-url'
- Check that the org has the necessary permissions
- Ensure the org has Data Cloud enabled

# actions.deployPackageInvalid

- Verify the package was created with 'data-code-extension zip' command
- Check that the package directory contains valid code
- Ensure the package has not been corrupted
- Re-package the code and try again

# actions.deployConflict

- Use a different name or version for your deployment
- Check existing deployments in your org
- Consider updating the version number
- Delete the existing deployment if appropriate

# actions.deployQuotaExceeded

- Check your organization's deployment quota
- Remove unused deployments
- Contact your Salesforce administrator
- Consider upgrading your org limits

# actions.deployNetworkError

- Check your internet connection
- Verify firewall and proxy settings
- Try again after a few moments
- Check Salesforce service status

# actions.deployExecutionFailed

- Verify all required flags are provided correctly
- Check the datacustomcode binary is properly installed
- Review the error message for specific issues
- Ensure the package is properly initialized and zipped