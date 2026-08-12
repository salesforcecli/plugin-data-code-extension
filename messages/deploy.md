# summary

Deploy a Data Code Extension %s package to a Salesforce org.

# description

Deploys an initialized and packaged Data Cloud code extension to a Salesforce org. The package must be initialized and zipped before deployment. Supports both script and function packages with configurable CPU resources and network settings. Run this command from within the package directory (e.g. cd ./my-script-package).

# examples

- Deploy a %s package to the org with alias "myorg":

  <%= config.bin %> data-code-extension %s deploy --name my-package --package-version 1.0.0 --description "My package" --package-dir ./payload --target-org myorg

- Deploy with a specific CPU size:

  <%= config.bin %> data-code-extension %s deploy --name my-package --package-version 1.0.0 --description "My package" --package-dir ./payload --target-org myorg --cpu-size CPU_4XL

# examples.script

- Deploy a script package to the org with alias "myorg":

  <%= config.bin %> data-code-extension script deploy --name my-package --package-version 1.0.0 --description "My package" --package-dir ./payload --target-org myorg

- Deploy with a specific CPU size:

  <%= config.bin %> data-code-extension script deploy --name my-package --package-version 1.0.0 --description "My package" --package-dir ./payload --target-org myorg --cpu-size CPU_4XL

# examples.function

- Deploy a function package to the org with alias "myorg":

  <%= config.bin %> data-code-extension function deploy --name my-package --package-version 1.0.0 --description "My package" --package-dir ./payload --target-org myorg

- Deploy with a specific CPU size:

  <%= config.bin %> data-code-extension function deploy --name my-package --package-version 1.0.0 --description "My package" --package-dir ./payload --target-org myorg --cpu-size CPU_4XL

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

The unique name identifier for your Data Cloud custom code package. This name is used to identify the deployment in your Salesforce org.

# flags.packageVersion.summary

Version of the package to deploy.

# flags.packageVersion.description

Reserved for future use.

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

The path to the directory containing your initialized and zipped Data Cloud custom code package. This directory contains the package files created by the 'zip' command.

# flags.cpuSize.summary

CPU size for the deployment.

# flags.cpuSize.description

The CPU allocation size for your deployed package. Options are: CPU_L (small), CPU_XL (large), CPU_2XL (extra large, default), CPU_4XL (maximum). Higher CPU sizes provide more processing power but may have quota implications.

# flags.targetOrg.summary

Target Salesforce org for deployment.

# flags.targetOrg.description

The alias or username of the Salesforce org where you want to deploy the Data Cloud custom code package. The org must have Data Cloud enabled and appropriate permissions.

# error.flagEmpty

The --%s flag requires a non-empty value.

# error.flagTooLong

The --%s flag value exceeds the maximum length of %s characters (%s provided).

# info.nameSanitized

API name '%s' was sanitized to '%s'.

# info.inferredFeature

Inferred feature: %s

# info.creatingDeployment

Creating deployment '%s'...

# info.zippingPackage

Building deployment package (deployment.zip)...

# info.uploadingPackage

Uploading deployment package...

# info.waitingForDeployment

Waiting for deployment to complete...

# info.deploymentStatusPolled

Deployment status: %s

# info.creatingDataTransform

Creating data transform...

# error.invalidCpuSize

Invalid CPU size '%s'. Available options: %s.

# error.invalidApiName

API name '%s' is invalid and could not be sanitized to a valid name.

# error.apiNameMustStartWithLetter

API name '%s' must begin with a letter. The name can only contain underscores and alphanumeric characters, must begin with a letter, not include spaces, not end with an underscore, and not contain two consecutive underscores.

# error.functionSignatureMismatch

Function signature does not match a supported type. Use SearchIndexChunkingV1Request and SearchIndexChunkingV1Response in the function signature.

# error.configNotFound

config.json not found at %s.

# error.configInvalidJson

config.json at %s is not valid JSON.

# error.configMissingFields

config.json at %s is missing required fields: %s.

# error.configInvalid

config.json at %s is invalid: %s.

# error.dmoRequiresDataObjects

DMO transforms require 'dataObjects' in config.json describing the schema of each output DMO.

# error.deploymentExists

Deployment %s exists. Please use a different name.

# error.emptyDeploymentResponse

The deployment request returned no file upload URL. Verify the org has Data Cloud enabled and you have permission to create custom code deployments.

# error.uploadFailed

Failed to upload the deployment package (HTTP %s): %s

# error.deploymentTimedOut

Deployment timed out.

# error.deploymentFailedStatus

Deployment failed with status '%s'.
