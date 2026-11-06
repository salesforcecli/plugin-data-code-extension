"""Fixed entrypoint for the e2e smoke test.

The SDK's template entrypoint can change between SDK releases, so the smoke
test swaps in this file before scanning to get stable, comparable output.
"""

from datacustomcode.client import Client
from datacustomcode.io.writer.base import WriteMode


def main():
    client = Client()
    df = client.read_dlo("Smoke_Source__dll")
    client.write_to_dlo("Smoke_Target__dll", df, write_mode=WriteMode.APPEND)


if __name__ == "__main__":
    main()
