# summary

Initialize the Data Code Extension %s package.

# description

Initializes the Data Code Extension by checking system requirements and setting up the necessary environment.

# examples

- Initialize a %s-based Data Cloud package:

  <%= config.bin %> data-code-extension %s init --package-dir ./my-%s-package

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

# info.executingInit

Initializing Data Cloud package...

# info.initExecuted

Package initialized successfully at '%s'

# info.fileCreated

Created: %s

# info.initCompleted

Data Cloud package initialized and ready for development!

# info.initSuccess

Data Code Extension initialized successfully!

# error.initFailed

Failed to initialize Data Code Extension

# flags.packageDir.summary

Directory path where the package will be created.

# flags.packageDir.description

The directory path where the new package will be initialized. The directory will be created if it doesn't exist.
