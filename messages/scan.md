# summary

Scan the Data Code Extension %s package for permissions and dependencies

# description

Scans Python files in an initialized Data Code Extension package directory to identify required permissions and dependencies. Updates the config.json and requirements.txt files based on the code analysis.

# examples

- Scan a %s package in the current directory:

  <%= config.bin %> data-code-extension %s scan

- Scan with a custom entrypoint file:

  <%= config.bin %> data-code-extension %s scan --entrypoint my_script.py

- Scan with an alternate config file:

  <%= config.bin %> data-code-extension %s scan --config alternate-config.json

- Perform a dry run to see what would be changed:

  <%= config.bin %> data-code-extension %s scan --dry-run

- Scan without updating requirements.txt:

  <%= config.bin %> data-code-extension %s scan --no-requirements

# info.checkingPython

Checking Python version...

# info.pythonFound

Python %s found at '%s'

# info.checkingPackages

Checking required Python packages...

# info.packageFound

Package '%s' version %s found

# info.checkingBinary

Checking datacustomcode binary...

# info.binaryFound

Datacustomcode binary version %s found

# info.executingScan

Scanning package for permissions and dependencies...

# info.scanExecuted

Package scanned successfully in '%s'

# info.permissionFound

  Permission required: %s

# info.requirementFound

  Dependency found: %s

# info.fileScanned

  Scanned: %s

# info.scanCompleted

Package scan completed successfully!

# info.scanSuccess

Data Code Extension scan completed successfully!

# info.dryRunNotice

DRY RUN: No files were modified. Remove --dry-run flag to apply changes.

# error.scanFailed

Failed to scan Data Code Extension package

# error.configNotFound

Config file not found at '%s'

# error.notInPackageDir

Current directory is not an initialized Data Code Extension package. Run 'init' first.

# error.scanPermissionDenied

Permission denied when scanning package at '%s'

# error.scanExecutionFailed

Failed to scan package at '%s': %s

# actions.configNotFound

- Verify the config file path is correct
- Check if you're in the right directory
- Run 'init' command first if package is not initialized
- Use default config path: payload/config.json

# actions.notInPackageDir

- Change to an initialized package directory
- Run 'data-code-extension %s init' first to initialize a package
- Check that config.json exists in the payload directory

# actions.scanPermissionDenied

- Check that you have read permissions for the directory
- Verify all Python files are readable
- Ensure the config file is writable

# actions.scanExecutionFailed

- Verify the datacustomcode binary is properly installed
- Check that the package directory contains valid Python files
- Run 'datacustomcode version' to verify the binary works
- Check the error message for specific issues

# flags.config.summary

Path to an alternate config file.

# flags.config.description

Optional path to an alternate JSON config file to use instead of the package's default config. The file must exist. Useful for testing different configurations without modifying the package's primary config.json.

# flags.entrypoint.summary

Path to the config.json file to update.

# flags.entrypoint.description

The path to the config.json file that will be analyzed and updated with discovered permissions. Defaults to 'payload/config.json' in the current directory.

# flags.dryRun.summary

Preview changes without modifying any files.

# flags.dryRun.description

When set, performs a scan and shows what would be changed but does not modify any files. Useful for reviewing changes before applying them.

# flags.noRequirements.summary

Skip updating the requirements.txt file.

# flags.noRequirements.description

When set, only scans for permissions and updates config.json, but does not update the requirements.txt file with discovered dependencies.
