# error.binaryNotFound

The 'datacustomcode' command is not found in your system PATH.

# error.binaryNotExecutable

The 'datacustomcode' command was found but failed to execute properly.

# actions.binaryNotFound

- Verify the pip package is installed: pip show salesforce-data-customcode
- Reinstall the package: pip install --force-reinstall salesforce-data-customcode
- Check if pip scripts directory is in PATH:
  - On macOS/Linux: Check ~/.local/bin or the Python scripts directory
  - On Windows: Check %APPDATA%\Python\Scripts or C:\PythonXX\Scripts
- Add the scripts directory to your PATH:
  - On macOS/Linux: export PATH="$PATH:~/.local/bin"
  - On Windows: Add the Scripts directory to your PATH environment variable
- If using a virtual environment, ensure it's activated before running this command
- Verify installation by running: datacustomcode version

# actions.binaryNotExecutable

- Check file permissions: ls -l $(which datacustomcode)
- Reinstall the package: pip install --force-reinstall salesforce-data-customcode
- Verify your Python environment is correctly configured
- Try running with full path if known: /path/to/datacustomcode version
- If using a virtual environment, ensure it's activated
- Check for any error messages when running: datacustomcode version