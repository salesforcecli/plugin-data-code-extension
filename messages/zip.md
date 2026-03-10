# summary

Create a compressed archive of the Data Code Extension %s package

# description

Creates a ZIP archive of an initialized Data Code Extension package for deployment. The archive includes all necessary files from the package directory while respecting .gitignore patterns and package requirements.

# examples

- Create an archive of a %s package:

  <%= config.bin %> data-code-extension %s zip --package-dir ./my-%s-package

- Create an archive with network configuration for Jupyter notebooks:

  <%= config.bin %> data-code-extension %s zip --package-dir ./my-%s-package --network host

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

# info.executingZip

Creating package archive...

# info.archiveCreated

Archive created: %s

# info.filesIncluded

Files included: %s

# info.archiveSize

Archive size: %s

# info.zipCompleted

Package archive created successfully!

# info.zipSuccess

Data Code Extension archive created successfully!

# error.zipFailed

Failed to create Data Code Extension archive

# flags.packageDir.summary

Directory containing the initialized package to archive.

# flags.packageDir.description

The path to the directory containing an initialized Data Code Extension package. The directory must exist and contain a valid package structure with config.json.

# flags.network.summary

Network configuration for Jupyter notebook packages.

# flags.network.description

Optional network configuration for packages that use Jupyter notebooks. Common values include 'host', 'bridge', or a custom network name. This flag is typically used when the package needs specific network access configurations.