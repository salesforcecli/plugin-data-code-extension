# summary

Deploy a Data Code Extension %s package to a Salesforce org

# description

Deploys an initialized and packaged Data Cloud code extension to a Salesforce org. The package must be initialized and zipped before deployment. Supports both script and function packages with configurable CPU resources and network settings.

# examples

- Deploy a %s package to the default org:

  <%= config.bin %> data-code-extension %s deploy --name "my-package" --version "1.0.0" --description "My package" --package-dir ./package --target-org myorg

- Deploy with specific CPU size:

  <%= config.bin %> data-code-extension %s deploy --name "my-package" --version "1.0.0" --description "My package" --package-dir ./package --target-org myorg --cpu-size CPU_4XL

- Deploy with network configuration for Jupyter notebooks:

  <%= config.bin %> data-code-extension %s deploy --name "my-package" --version "1.0.0" --description "My package" --package-dir ./package --target-org myorg --network "host"

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

# info.deployingPackage

Deploying package to Salesforce org...

# info.deploymentComplete

Package '%s' version '%s' deployed successfully!

# info.deploymentId

Deployment ID: %s

# info.endpointUrl

Endpoint URL: %s

# info.deploymentStatus

Deployment Status: %s

# info.deploySuccess

Data Code Extension deployment completed successfully!

# error.deployFailed

Failed to deploy Data Code Extension package

# flags.name.summary

Name of the package to deploy.

# flags.name.description

The unique name identifier for your Data Cloud custom code package. This name will be used to identify the deployment in your Salesforce org.

# flags.version.summary

Version of the package to deploy.

# flags.version.description

The version string for your package deployment. Use semantic versioning (e.g., 1.0.0) to track different releases of your code.

# flags.description.summary

Description of the package.

# flags.description.description

A meaningful description of what your Data Cloud custom code package does. This helps identify the package purpose in your Salesforce org.

# flags.network.summary

Network configuration for Jupyter notebooks.

# flags.network.description

Optional network configuration setting for packages that include Jupyter notebooks. Common values include 'host' for host network mode. Typically applies to packages with Jupyter notebook support.

# flags.packageDir.summary

Directory containing the packaged code.

# flags.packageDir.description

The path to the directory containing your initialized and zipped Data Cloud custom code package. This directory should contain the package files created by the 'zip' command.

# flags.cpuSize.summary

CPU size for the deployment.

# flags.cpuSize.description

The CPU allocation size for your deployed package. Options are: CPU_L (small), CPU_XL (large), CPU_2XL (extra large, default), CPU_4XL (maximum). Higher CPU sizes provide more processing power but may have quota implications.

# flags.targetOrg.summary

Target Salesforce org for deployment.

# flags.targetOrg.description

The alias of the Salesforce org where you want to deploy the Data Cloud custom code package. The org must have Data Cloud enabled and appropriate permissions.

# flags.functionInvokeOpt.summary

Function invocation option (function packages only).

# flags.functionInvokeOpt.description

Configuration for how functions should be invoked. UnstructuredChunking is only valid option at this point
