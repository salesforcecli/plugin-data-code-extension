# summary

Scan the Data Code Extension %s package for permissions and dependencies.

# description

Scans Python files in an initialized Data Code Extension package directory to identify required permissions and dependencies. Updates the config.json and requirements.txt files based on the code analysis.

This command requires Python 3.11 and the salesforce-data-customcode package to be installed. The package includes pipreqs, which is used to scan Python files for external package dependencies.

# examples.script

- Scan with a custom entrypoint file:

  <%= config.bin %> data-code-extension script scan --entrypoint ./my-script-package/payload/entrypoint.py

- Perform a dry run to see what would be changed:

  <%= config.bin %> data-code-extension script scan --entrypoint ./my-script-package/payload/entrypoint.py --dry-run

- Scan without updating the requirements.txt file:

  <%= config.bin %> data-code-extension script scan --entrypoint ./my-script-package/payload/entrypoint.py --no-requirements

# examples.function

- Scan with a custom entrypoint file:

  <%= config.bin %> data-code-extension function scan --entrypoint ./my-function-package/payload/entrypoint.py

- Perform a dry run to see what would be changed:

  <%= config.bin %> data-code-extension function scan --entrypoint ./my-function-package/payload/entrypoint.py --dry-run

- Scan without updating the requirements.txt file:

  <%= config.bin %> data-code-extension function scan --entrypoint ./my-function-package/payload/entrypoint.py --no-requirements

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

# info.fileScanned

Scanned: %s

# info.scanCompleted

Package scan completed successfully!

# info.dryRunNotice

DRY RUN: No files were modified. Remove --dry-run flag to apply changes.

# flags.configFile.summary

Path to an alternate config file.

# flags.configFile.description

Optional path to an alternate JSON config file to use instead of the package's default config. The file must exist. Useful for testing different configurations without modifying the package's primary config.json.

# flags.entrypoint.summary

Path to the entrypoint Python file to scan.

# flags.entrypoint.description

The path to the entrypoint Python file that will be analyzed. Defaults to 'payload/entrypoint.py' in the current directory.

# flags.dryRun.summary

Preview changes without modifying any files.

# flags.dryRun.description

When set, performs a scan and shows what would be changed but does not modify any files. Useful for reviewing changes before applying them.

# flags.noRequirements.summary

Skip updating the requirements.txt file.

# flags.noRequirements.description

When set, only scans for permissions and updates config.json, but doesn't update the requirements.txt file with discovered dependencies.
