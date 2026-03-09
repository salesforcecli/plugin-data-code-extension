# summary

Initialize the Data Code Extension environment.

# description

Initializes the Data Code Extension by checking system requirements and setting up the necessary environment.

# examples

- Initialize the Data Code Extension:

  <%= config.bin %> <%= command.id %>

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

# info.initSuccess

Data Code Extension initialized successfully!

# error.initFailed

Failed to initialize Data Code Extension

# flags.codeType.summary

Specify the code type for the package.

# flags.codeType.description

The code type determines the structure and configuration of the package.
Choose 'script' for standalone script packages or 'function' for function-based packages.

# flags.packageDir.summary

Directory path where the package will be created.

# flags.packageDir.description

The directory path where the new package will be initialized.
The directory will be created if it does not exist.