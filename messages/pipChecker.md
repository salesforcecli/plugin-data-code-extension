# error.pipNotFound

Pip is not installed or not accessible in your system PATH.

# error.packageNotInstalled

Required package '%s' is not installed.

# actions.pipNotFound

- Install pip using the official installation script: https://pip.pypa.io/en/stable/installation/
- On macOS with Homebrew: Pip usually comes with Python installation
- On Ubuntu/Debian: sudo apt-get install python3-pip
- On Windows: Pip is included with Python 3.4+ installations
- If Python is installed, try: python3 -m ensurepip or python -m ensurepip
- Verify installation by running: pip3 --version or pip --version

# actions.packageNotInstalled

- Install the package using pip: pip install salesforce-data-customcode
- If using pip3: pip3 install salesforce-data-customcode
- If using python -m pip: python3 -m pip install salesforce-data-customcode
- Consider using a virtual environment for better dependency management
- On macOS/Linux: python3 -m venv venv && source venv/bin/activate && pip install salesforce-data-customcode
- On Windows: python -m venv venv && venv\Scripts\activate && pip install salesforce-data-customcode
- Verify installation by running: pip show salesforce-data-customcode