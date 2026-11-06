"""Fixed streaming entrypoint for the e2e smoke test.

The SDK's streaming example can change between SDK releases, so the smoke
test swaps in this file before scanning to get stable, comparable output.
"""

from datacustomcode.client import RunMode, StreamingClient, get_run_mode


def main():
    target_dlo = "Smoke_Stream_Target__dll"
    client = StreamingClient()

    if get_run_mode() == RunMode.DELTA_SYNC:
        df = client.read_dlo_deltas()
        client.write_dlo_deltas(target_dlo, df).awaitTermination()
    else:
        df = client.read_dlo()
        client.auto_write_to_dlo(target_dlo, df)


if __name__ == "__main__":
    main()
