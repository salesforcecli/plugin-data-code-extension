# summary

Initialize the Data Code Extension %s package.

# description

Initializes the Data Code Extension by checking system requirements and setting up the necessary environment.

# examples

- Initialize a %s-based Data Cloud package:

  <%= config.bin %> data-code-extension %s init --package-dir ./my-%s-package

# examples.function

- Initialize a function package (uses SearchIndexChunking by default):

  <%= config.bin %> data-code-extension function init --package-dir ./my-function-package

- Initialize a function package with explicit feature flag:

  <%= config.bin %> data-code-extension function init --package-dir ./my-function-package --use-in-feature SearchIndexChunking

# examples.script

- Initialize a script package:

  <%= config.bin %> data-code-extension script init --package-dir ./my-script-package

# info.checkingPython

Checking Python version...

# info.pythonFound

Python %s found at '%s'

# info.checkingPackages

Checking required Python packages...

# info.packageFound

Package '%s' version %s found

# info.executingInit

Initializing Data Cloud package...

# info.initExecuted

Package initialized successfully at '%s'

# info.fileCreated

Created: %s

# info.initCompleted

Data Cloud package initialized and ready for development!

# flags.packageDir.summary

Directory path where the package will be created.

# flags.packageDir.description

The directory path where the new package will be initialized. The directory will be created if it doesn't exist.

# flags.useInFeature.summary

Feature flag for function initialization (function packages only).

# flags.useInFeature.description

Configuration for which feature this function will be used in. SearchIndexChunking is the only valid option and is used by default if not specified.
