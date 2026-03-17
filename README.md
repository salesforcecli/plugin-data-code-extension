# data-code-extension

[![NPM](https://img.shields.io/npm/v/data-code-extension.svg?label=data-code-extension)](https://www.npmjs.com/package/data-code-extension) [![Downloads/week](https://img.shields.io/npm/dw/data-code-extension.svg)](https://npmjs.org/package/data-code-extension) [![License](https://img.shields.io/badge/License-BSD%203--Clause-brightgreen.svg)](https://raw.githubusercontent.com/salesforcecli/data-code-extension/main/LICENSE.txt)

# Description

This plugin is bundled with the [Salesforce CLI](https://developer.salesforce.com/tools/sfdxcli). For more information on the CLI, read the [getting started guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_intro.htm).

We always recommend using the latest version of these commands bundled with the CLI, however, you can install a specific version or tag if needed.

## Install

```bash
sf plugins install data-code-extension@x.y.z
```

## Issues

Please report any issues at https://github.com/forcedotcom/cli/issues

## Contributing

1. Please read our [Code of Conduct](CODE_OF_CONDUCT.md)
2. Create a new issue before starting your project so that we can keep track of
   what you are trying to add/fix. That way, we can also offer suggestions or
   let you know if there is already an effort in progress.
3. Fork this repository.
4. [Build the plugin locally](#build)
5. Create a _topic_ branch in your fork. Note, this step is recommended but technically not required if contributing using a fork.
6. Edit the code in your fork.
7. Write appropriate tests for your changes. Try to achieve at least 95% code coverage on any new code. No pull request will be accepted without unit tests.
8. Sign CLA (see [CLA](#cla) below).
9. Send us a pull request when you are done. We'll review your code, suggest any needed changes, and merge it in.

### CLA

External contributors will be required to sign a Contributor's License
Agreement. You can do so by going to https://cla.salesforce.com/sign-cla.

### Build

To build the plugin locally, make sure to have yarn installed and run the following commands:

```bash
# Clone the repository
git clone git@github.com:salesforcecli/data-code-extension

# Install the dependencies and compile
yarn && yarn build
```

To use your plugin, run using the local `./bin/dev` or `./bin/dev.cmd` file.

```bash
# Run using local run file.
bin/dev.js data-code-extension --help
```

There should be no differences when running via the Salesforce CLI or using the local run file. However, it can be useful to link the plugin to do some additional testing or run your commands from anywhere on your machine.

```bash
# Link your plugin to the sf cli
sf plugins link .
# To verify
sf plugins
```

## Commands

<!-- commands -->

- [`sf data-code-extension function deploy`](#sf-data-code-extension-function-deploy)
- [`sf data-code-extension function init`](#sf-data-code-extension-function-init)
- [`sf data-code-extension function run`](#sf-data-code-extension-function-run)
- [`sf data-code-extension function scan`](#sf-data-code-extension-function-scan)
- [`sf data-code-extension function zip`](#sf-data-code-extension-function-zip)
- [`sf data-code-extension script deploy`](#sf-data-code-extension-script-deploy)
- [`sf data-code-extension script init`](#sf-data-code-extension-script-init)
- [`sf data-code-extension script run`](#sf-data-code-extension-script-run)
- [`sf data-code-extension script scan`](#sf-data-code-extension-script-scan)
- [`sf data-code-extension script zip`](#sf-data-code-extension-script-zip)

## `sf data-code-extension function deploy`

Deploy a Data Code Extension function package to a Salesforce org

```
USAGE
  $ sf data-code-extension function deploy -n <value> -v <value> -d <value> -p <value> -o <value>
    --function-invoke-opt <value> [--json] [--flags-dir <value>] [--cpu-size CPU_L|CPU_XL|CPU_2XL|CPU_4XL]
    [--network <value>]

FLAGS
  -d, --description=<value>          (required) Description of the package.
  -n, --name=<value>                 (required) Name of the package to deploy.
  -o, --target-org=<value>           (required) Target Salesforce org for deployment.
  -p, --package-dir=<value>          (required) Directory containing the packaged code.
  -v, --version=<value>              (required) Version of the package to deploy.
      --cpu-size=<option>            [default: CPU_2XL] CPU size for the deployment.
                                     <options: CPU_L|CPU_XL|CPU_2XL|CPU_4XL>
      --function-invoke-opt=<value>  (required) Function invocation option (function packages only).
      --network=<value>              Network configuration for Jupyter notebooks.

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.
  --json               Format output as json.

DESCRIPTION
  Deploy a Data Code Extension function package to a Salesforce org

  Deploys an initialized and packaged Data Cloud custom code to a Salesforce org. The package must be initialized and
  zipped before deployment. Supports both script and function packages with configurable CPU resources and network
  settings.

EXAMPLES
  Deploy a function package to the default org:

    $ sf data-code-extension function deploy --name "my-package" --version "1.0.0" --description "My package" \
      --package-dir ./package --target-org myorg

  Deploy with specific CPU size:

    $ sf data-code-extension function deploy --name "my-package" --version "1.0.0" --description "My package" \
      --package-dir ./package --target-org myorg --cpu-size CPU_4XL

  Deploy with network configuration for Jupyter notebooks:

    $ sf data-code-extension function deploy --name "my-package" --version "1.0.0" --description "My package" \
      --package-dir ./package --target-org myorg --network "host"

FLAG DESCRIPTIONS
  -d, --description=<value>  Description of the package.

    A meaningful description of what your Data Cloud custom code package does. This helps identify the package purpose
    in your Salesforce org.

  -n, --name=<value>  Name of the package to deploy.

    The unique name identifier for your Data Cloud custom code package. This name will be used to identify the
    deployment in your Salesforce org.

  -o, --target-org=<value>  Target Salesforce org for deployment.

    The alias of the Salesforce org where you want to deploy the Data Cloud custom code package. The org must have Data
    Cloud enabled and appropriate permissions.

  -p, --package-dir=<value>  Directory containing the packaged code.

    The path to the directory containing your initialized and zipped Data Cloud custom code package. This directory
    should contain the package files created by the 'zip' command.

  -v, --version=<value>  Version of the package to deploy.

    The version string for your package deployment. Use semantic versioning (e.g., 1.0.0) to track different releases
    of your code.

  --cpu-size=CPU_L|CPU_XL|CPU_2XL|CPU_4XL  CPU size for the deployment.

    The CPU allocation size for your deployed package. Options are: CPU_L (small), CPU_XL (large), CPU_2XL (extra
    large, default), CPU_4XL (maximum). Higher CPU sizes provide more processing power but may have quota implications.

  --function-invoke-opt=<value>  Function invocation option (function packages only).

    Configuration for how functions should be invoked. UnstructuredChunking is only valid option at this point.

  --network=<value>  Network configuration for Jupyter notebooks.

    Optional network configuration setting for packages that include Jupyter notebooks. Common values include 'host'
    for host network mode. Typically applies to packages with Jupyter notebook support.
```

## `sf data-code-extension function init`

Initialize the Data Code Extension environment.

```
USAGE
  $ sf data-code-extension function init -p <value> [--json] [--flags-dir <value>]

FLAGS
  -p, --package-dir=<value>  (required) Directory path where the package will be created.

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.
  --json               Format output as json.

DESCRIPTION
  Initialize the Data Code Extension environment.

  Initializes the Data Code Extension by checking system requirements and setting up the necessary environment.

EXAMPLES
  Initialize a script-based Data Cloud package:

    $ sf data-code-extension script init --package-dir ./my-script-package

  Initialize a function-based Data Cloud package:

    $ sf data-code-extension function init --package-dir ./my-function-package

FLAG DESCRIPTIONS
  -p, --package-dir=<value>  Directory path where the package will be created.

    The directory path where the new package will be initialized.
    The directory will be created if it does not exist.
```

## `sf data-code-extension function run`

Run a Data Code Extension function package locally using data from your Salesforce Org

```
USAGE
  $ sf data-code-extension function run -e <value> -o <value> [--json] [--flags-dir <value>]
    [--config-file <value>] [--dependencies <value>]

FLAGS
  -e, --entrypoint=<value>   (required) Entrypoint file for the package to run.
  -o, --target-org=<value>   (required) Target Salesforce org to run against.
      --config-file=<value>  Path to a config file.
      --dependencies=<value> Dependencies override for the run.

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.
  --json               Format output as json.

DESCRIPTION
  Run a Data Code Extension function package locally using data from your Salesforce Org

  Executes an initialized Data Cloud custom code package against a Salesforce org. The package must be initialized
  before running. Supports both script and function packages with optional config file and dependencies overrides.

EXAMPLES
  Run a function package against the default org:

    $ sf data-code-extension function run --entrypoint ./my-package --target-org myorg

  Run with a custom config file:

    $ sf data-code-extension function run --entrypoint ./my-package --target-org myorg \
      --config-file ./payload/config.json

  Run with dependencies:

    $ sf data-code-extension function run --entrypoint ./my-package --target-org myorg \
      --dependencies "pandas==2.0.0"

FLAG DESCRIPTIONS
  -e, --entrypoint=<value>  Entrypoint file for the package to run.

    The path to the entrypoint file of your initialized Data Cloud custom code package.

  -o, --target-org=<value>  Target Salesforce org to run against.

    The alias of the Salesforce org where you want to run the Data Cloud custom code package. The org must have Data
    Cloud enabled and appropriate permissions.

  --config-file=<value>  Path to a config file.

    Optional path to a JSON config file that provides input payload for the run. Defaults to the package's
    payload/config.json if not specified.

  --dependencies=<value>  Dependencies override for the run.

    Optional comma-separated list of Python package dependencies to use during the run, overriding those defined in
    the package's requirements.txt.
```

## `sf data-code-extension function scan`

Scan the Data Code Extension function package for permissions and dependencies

```
USAGE
  $ sf data-code-extension function scan [--json] [--flags-dir <value>] [-e <value>] [--config-file <value>]
    [-d] [-n]

FLAGS
  -d, --dry-run              Preview changes without modifying any files.
  -e, --entrypoint=<value>   Path to the config.json file to update.
  -n, --no-requirements      Skip updating the requirements.txt file.
      --config-file=<value>  Path to an alternate config file.

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.
  --json               Format output as json.

DESCRIPTION
  Scan the Data Code Extension function package for permissions and dependencies

  Scans Python files in an initialized Data Code Extension package directory to identify required permissions and
  dependencies. Updates the config.json and requirements.txt files based on the code analysis.

EXAMPLES
  Scan a function package in the current directory:

    $ sf data-code-extension function scan

  Scan with a custom entrypoint file:

    $ sf data-code-extension function scan --entrypoint my_script.py

  Scan with an alternate config file:

    $ sf data-code-extension function scan --config-file alternate-config.json

  Perform a dry run to see what would be changed:

    $ sf data-code-extension function scan --dry-run

  Scan without updating requirements.txt:

    $ sf data-code-extension function scan --no-requirements

FLAG DESCRIPTIONS
  -d, --dry-run  Preview changes without modifying any files.

    When set, performs a scan and shows what would be changed but does not modify any files. Useful for reviewing
    changes before applying them.

  -e, --entrypoint=<value>  Path to the config.json file to update.

    The path to the config.json file that will be analyzed and updated with discovered permissions. Defaults to
    'payload/config.json' in the current directory.

  -n, --no-requirements  Skip updating the requirements.txt file.

    When set, only scans for permissions and updates config.json, but does not update the requirements.txt file with
    discovered dependencies.

  --config-file=<value>  Path to an alternate config file.

    Optional path to an alternate JSON config file to use instead of the package's default config. The file must
    exist. Useful for testing different configurations without modifying the package's primary config.json.
```

## `sf data-code-extension function zip`

Create a compressed archive of the Data Code Extension function package

```
USAGE
  $ sf data-code-extension function zip -p <value> [--json] [--flags-dir <value>] [-n <value>]

FLAGS
  -n, --network=<value>      Network configuration, typically used for Jupyter notebook packages.
  -p, --package-dir=<value>  (required) Directory containing the initialized package to archive.

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.
  --json               Format output as json.

DESCRIPTION
  Create a compressed archive of the Data Code Extension function package

  Creates a ZIP archive of an initialized Data Code Extension package for deployment. The archive includes all
  necessary files from the package directory while respecting .gitignore patterns and package requirements.

EXAMPLES
  Create an archive of a function package:

    $ sf data-code-extension function zip --package-dir ./my-function-package

  Create an archive with network configuration for Jupyter notebooks:

    $ sf data-code-extension function zip --package-dir ./my-function-package --network host

FLAG DESCRIPTIONS
  -n, --network=<value>  Network configuration, typically used for Jupyter notebook packages.

    Optional network configuration for packages that use Jupyter notebooks. Common values include 'host', 'bridge', or
    a custom network name. This flag is typically used when the package needs specific network access configurations.

  -p, --package-dir=<value>  Directory containing the initialized package to archive.

    The path to the directory containing an initialized Data Code Extension package. The directory must exist and
    contain a valid package structure with config.json.
```

## `sf data-code-extension script deploy`

Deploy a Data Code Extension script package to a Salesforce org

```
USAGE
  $ sf data-code-extension script deploy -n <value> -v <value> -d <value> -p <value> -o <value>
    [--json] [--flags-dir <value>] [--cpu-size CPU_L|CPU_XL|CPU_2XL|CPU_4XL] [--network <value>]

FLAGS
  -d, --description=<value>  (required) Description of the package.
  -n, --name=<value>         (required) Name of the package to deploy.
  -o, --target-org=<value>   (required) Target Salesforce org for deployment.
  -p, --package-dir=<value>  (required) Directory containing the packaged code.
  -v, --version=<value>      (required) Version of the package to deploy.
      --cpu-size=<option>    [default: CPU_2XL] CPU size for the deployment.
                             <options: CPU_L|CPU_XL|CPU_2XL|CPU_4XL>
      --network=<value>      Network configuration for Jupyter notebooks.

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.
  --json               Format output as json.

DESCRIPTION
  Deploy a Data Code Extension script package to a Salesforce org

  Deploys an initialized and packaged Data Cloud custom code to a Salesforce org. The package must be initialized and
  zipped before deployment. Supports both script and function packages with configurable CPU resources and network
  settings.

EXAMPLES
  Deploy a script package to the default org:

    $ sf data-code-extension script deploy --name "my-package" --version "1.0.0" --description "My package" \
      --package-dir ./package --target-org myorg

  Deploy with specific CPU size:

    $ sf data-code-extension script deploy --name "my-package" --version "1.0.0" --description "My package" \
      --package-dir ./package --target-org myorg --cpu-size CPU_4XL

  Deploy with network configuration for Jupyter notebooks:

    $ sf data-code-extension script deploy --name "my-package" --version "1.0.0" --description "My package" \
      --package-dir ./package --target-org myorg --network "host"

FLAG DESCRIPTIONS
  -d, --description=<value>  Description of the package.

    A meaningful description of what your Data Cloud custom code package does. This helps identify the package purpose
    in your Salesforce org.

  -n, --name=<value>  Name of the package to deploy.

    The unique name identifier for your Data Cloud custom code package. This name will be used to identify the
    deployment in your Salesforce org.

  -o, --target-org=<value>  Target Salesforce org for deployment.

    The alias of the Salesforce org where you want to deploy the Data Cloud custom code package. The org must have Data
    Cloud enabled and appropriate permissions.

  -p, --package-dir=<value>  Directory containing the packaged code.

    The path to the directory containing your initialized and zipped Data Cloud custom code package. This directory
    should contain the package files created by the 'zip' command.

  -v, --version=<value>  Version of the package to deploy.

    The version string for your package deployment. Use semantic versioning (e.g., 1.0.0) to track different releases
    of your code.

  --cpu-size=CPU_L|CPU_XL|CPU_2XL|CPU_4XL  CPU size for the deployment.

    The CPU allocation size for your deployed package. Options are: CPU_L (small), CPU_XL (large), CPU_2XL (extra
    large, default), CPU_4XL (maximum). Higher CPU sizes provide more processing power but may have quota implications.

  --network=<value>  Network configuration for Jupyter notebooks.

    Optional network configuration setting for packages that include Jupyter notebooks. Common values include 'host'
    for host network mode. Typically applies to packages with Jupyter notebook support.
```

## `sf data-code-extension script init`

Initialize the Data Code Extension environment.

```
USAGE
  $ sf data-code-extension script init -p <value> [--json] [--flags-dir <value>]

FLAGS
  -p, --package-dir=<value>  (required) Directory path where the package will be created.

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.
  --json               Format output as json.

DESCRIPTION
  Initialize the Data Code Extension environment.

  Initializes the Data Code Extension by checking system requirements and setting up the necessary environment.

EXAMPLES
  Initialize a script-based Data Cloud package:

    $ sf data-code-extension script init --package-dir ./my-script-package

  Initialize a function-based Data Cloud package:

    $ sf data-code-extension function init --package-dir ./my-function-package

FLAG DESCRIPTIONS
  -p, --package-dir=<value>  Directory path where the package will be created.

    The directory path where the new package will be initialized.
    The directory will be created if it does not exist.
```

## `sf data-code-extension script run`

Run a Data Code Extension script package locally using data from your Salesforce Org

```
USAGE
  $ sf data-code-extension script run -e <value> -o <value> [--json] [--flags-dir <value>]
    [--config-file <value>] [--dependencies <value>]

FLAGS
  -e, --entrypoint=<value>   (required) Entrypoint file for the package to run.
  -o, --target-org=<value>   (required) Target Salesforce org to run against.
      --config-file=<value>  Path to a config file.
      --dependencies=<value> Dependencies override for the run.

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.
  --json               Format output as json.

DESCRIPTION
  Run a Data Code Extension script package locally using data from your Salesforce Org

  Executes an initialized Data Cloud custom code package against a Salesforce org. The package must be initialized
  before running. Supports both script and function packages with optional config file and dependencies overrides.

EXAMPLES
  Run a script package against the default org:

    $ sf data-code-extension script run --entrypoint ./my-package --target-org myorg

  Run with a custom config file:

    $ sf data-code-extension script run --entrypoint ./my-package --target-org myorg \
      --config-file ./payload/config.json

  Run with dependencies:

    $ sf data-code-extension script run --entrypoint ./my-package --target-org myorg \
      --dependencies "pandas==2.0.0"

FLAG DESCRIPTIONS
  -e, --entrypoint=<value>  Entrypoint file for the package to run.

    The path to the entrypoint file of your initialized Data Cloud custom code package.

  -o, --target-org=<value>  Target Salesforce org to run against.

    The alias of the Salesforce org where you want to run the Data Cloud custom code package. The org must have Data
    Cloud enabled and appropriate permissions.

  --config-file=<value>  Path to a config file.

    Optional path to a JSON config file that provides input payload for the run. Defaults to the package's
    payload/config.json if not specified.

  --dependencies=<value>  Dependencies override for the run.

    Optional comma-separated list of Python package dependencies to use during the run, overriding those defined in
    the package's requirements.txt.
```

## `sf data-code-extension script scan`

Scan the Data Code Extension script package for permissions and dependencies

```
USAGE
  $ sf data-code-extension script scan [--json] [--flags-dir <value>] [-e <value>] [--config-file <value>]
    [-d] [-n]

FLAGS
  -d, --dry-run              Preview changes without modifying any files.
  -e, --entrypoint=<value>   Path to the config.json file to update.
  -n, --no-requirements      Skip updating the requirements.txt file.
      --config-file=<value>  Path to an alternate config file.

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.
  --json               Format output as json.

DESCRIPTION
  Scan the Data Code Extension script package for permissions and dependencies

  Scans Python files in an initialized Data Code Extension package directory to identify required permissions and
  dependencies. Updates the config.json and requirements.txt files based on the code analysis.

EXAMPLES
  Scan a script package in the current directory:

    $ sf data-code-extension script scan

  Scan with a custom entrypoint file:

    $ sf data-code-extension script scan --entrypoint my_script.py

  Scan with an alternate config file:

    $ sf data-code-extension script scan --config-file alternate-config.json

  Perform a dry run to see what would be changed:

    $ sf data-code-extension script scan --dry-run

  Scan without updating requirements.txt:

    $ sf data-code-extension script scan --no-requirements

FLAG DESCRIPTIONS
  -d, --dry-run  Preview changes without modifying any files.

    When set, performs a scan and shows what would be changed but does not modify any files. Useful for reviewing
    changes before applying them.

  -e, --entrypoint=<value>  Path to the config.json file to update.

    The path to the config.json file that will be analyzed and updated with discovered permissions. Defaults to
    'payload/config.json' in the current directory.

  -n, --no-requirements  Skip updating the requirements.txt file.

    When set, only scans for permissions and updates config.json, but does not update the requirements.txt file with
    discovered dependencies.

  --config-file=<value>  Path to an alternate config file.

    Optional path to an alternate JSON config file to use instead of the package's default config. The file must
    exist. Useful for testing different configurations without modifying the package's primary config.json.
```

## `sf data-code-extension script zip`

Create a compressed archive of the Data Code Extension script package

```
USAGE
  $ sf data-code-extension script zip -p <value> [--json] [--flags-dir <value>] [-n <value>]

FLAGS
  -n, --network=<value>      Network configuration, typically used for Jupyter notebook packages.
  -p, --package-dir=<value>  (required) Directory containing the initialized package to archive.

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.
  --json               Format output as json.

DESCRIPTION
  Create a compressed archive of the Data Code Extension script package

  Creates a ZIP archive of an initialized Data Code Extension package for deployment. The archive includes all
  necessary files from the package directory while respecting .gitignore patterns and package requirements.

EXAMPLES
  Create an archive of a script package:

    $ sf data-code-extension script zip --package-dir ./my-script-package

  Create an archive with network configuration for Jupyter notebooks:

    $ sf data-code-extension script zip --package-dir ./my-script-package --network host

FLAG DESCRIPTIONS
  -n, --network=<value>  Network configuration, typically used for Jupyter notebook packages.

    Optional network configuration for packages that use Jupyter notebooks. Common values include 'host', 'bridge', or
    a custom network name. This flag is typically used when the package needs specific network access configurations.

  -p, --package-dir=<value>  Directory containing the initialized package to archive.

    The path to the directory containing an initialized Data Code Extension package. The directory must exist and
    contain a valid package structure with config.json.
```

<!-- commandsstop -->
