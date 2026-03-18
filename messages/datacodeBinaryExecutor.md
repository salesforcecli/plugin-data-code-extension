# error.initExecutionFailed

Failed to initialize package at '%s': %s

# actions.initExecutionFailed

- Verify the datacustomcode binary is properly installed
- Check that all required dependencies are installed
- Run 'datacustomcode version' to verify the binary works
- Check the error message for specific issues

# error.scanExecutionFailed

Failed to scan package at '%s': %s

# actions.scanExecutionFailed

- Verify the datacustomcode binary is properly installed
- Check that the package directory contains valid Python files
- Run 'datacustomcode version' to verify the binary works
- Check the error message for specific issues

# error.zipExecutionFailed

Failed to create archive for package at '%s': %s

# actions.zipExecutionFailed

- Verify the datacustomcode binary is properly installed
- Check that the package directory is valid
- Run 'datacustomcode version' to verify the binary works
- Check the error message for specific issues

# error.deployAuthenticationFailed

Failed to authenticate with Salesforce org '%s'

# actions.deployAuthenticationFailed

- Verify the target org username/alias is correct
- Re-authenticate with 'sf org login web' or 'sf org login sfdx-url'
- Check that the org has the necessary permissions
- Ensure the org has Data Cloud enabled

# error.deployExecutionFailed

Failed to deploy package '%s': %s

# actions.deployExecutionFailed

- Verify all required flags are provided correctly
- Check the datacustomcode binary is properly installed
- Review the error message for specific issues
- Ensure the package is properly initialized and zipped

# error.runAuthenticationFailed

Failed to authenticate with Salesforce org '%s'

# actions.runAuthenticationFailed

- Verify the target org username/alias is correct
- Re-authenticate with 'sf org login web' or 'sf org login sfdx-url'
- Check that the org has the necessary permissions
- Ensure the org has Data Cloud enabled

# error.runExecutionFailed

Script execution failed:
%s

# actions.runExecutionFailed

- Verify all required flags are provided correctly
- Check the datacustomcode binary is properly installed
- Review the error message for specific issues
- Ensure the package is properly initialized
