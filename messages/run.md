# summary

Run a Data Code Extension %s package locally using data from your Salesforce Org.

# description

Executes an initialized Data Cloud custom code package against a Salesforce org. The package must be initialized before running. Supports both script and function packages with optional config file and dependencies overrides.

# examples

- Run a %s package against the org with alias "myorg":

  <%= config.bin %> data-code-extension %s run --entrypoint ./my-package --target-org myorg

- Run with a custom config file:

  <%= config.bin %> data-code-extension %s run --entrypoint ./my-package --target-org myorg --config-file ./payload/config.json

- Run with dependencies:

  <%= config.bin %> data-code-extension %s run --entrypoint ./my-package --target-org myorg --dependencies "pandas==2.0.0"

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

# info.authenticating

Authenticating with Salesforce org '%s'...

# info.authenticated

Successfully authenticated with org '%s'

# info.runningPackage

Running package against Salesforce org...

# info.runComplete

Package at '%s' executed successfully!

# info.runStatus

Run Status: %s

# info.runOutput

Output: %s

# info.runSuccess

Data Code Extension run completed successfully!

# error.runFailed

Failed to run Data Code Extension package

# flags.entrypoint.summary

Entrypoint file for the package to run.

# flags.entrypoint.description

The path to the entrypoint file of your initialized Data Cloud custom code package.

# flags.targetOrg.summary

Target Salesforce org to run against.

# flags.targetOrg.description

The alias or username of the Salesforce org where you want to run the Data Cloud custom code package. The org must have Data Cloud enabled and appropriate permissions.

# flags.configFile.summary

Path to a config file.

# flags.configFile.description

Optional path to a JSON config file that provides input payload for the run. Defaults to the package's payload/config.json if not specified.

# flags.dependencies.summary

Dependencies override for the run.

# flags.dependencies.description

Optional comma-separated list of Python package dependencies to use during the run, overriding those defined in the package's requirements.txt.
