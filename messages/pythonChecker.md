# error.pythonNotFound

Python is not installed or not accessible in your system PATH.

# error.versionMismatch

Python version %s is installed, but version %s or higher is required.

# actions.pythonNotFound

- Install Python 3.11 from https://www.python.org/downloads/
- On macOS with Homebrew: brew install python@3.11
- On Ubuntu/Debian: sudo apt-get install python3.11
- On Windows: Download from https://www.python.org/downloads/windows/
- Ensure Python is added to your system PATH
- Verify installation by running: python3 --version or python --version

# actions.versionMismatch

- Update Python to version 3.11
- On macOS with Homebrew: brew upgrade python@3.11
- On Ubuntu/Debian: sudo apt-get update && sudo apt-get install python3.11
- On Windows: Download the latest version from https://www.python.org/downloads/windows/
- You can have multiple Python versions installed - ensure python3 or python points to 3.11+
- Verify installation by running: python3 --version or python --version