from __future__ import annotations

import locale
import threading
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class CommandOutputSnapshot:
    output_path: str
    output_bytes: int
    output_truncated: bool
    output_limit_exceeded: bool
    stdout: str
    stderr: str
    stdout_tail: str
    stderr_tail: str
    combined_tail: str


class CommandOutputStore:
    def __init__(
        self,
        *,
        output_path: Path,
        inline_output_max_chars: int,
        tail_max_chars: int,
        output_file_max_bytes: int,
    ) -> None:
        self.output_path = output_path
        self.inline_output_max_chars = inline_output_max_chars
        self.tail_max_bytes = max(1024, tail_max_chars * 4)
        self.output_file_max_bytes = output_file_max_bytes
        self._lock = threading.Lock()
        self._file = None
        self._output_bytes = 0
        self._file_bytes = 0
        self._output_limit_exceeded = False
        self._stdout_inline = bytearray()
        self._stderr_inline = bytearray()
        self._stdout_tail = bytearray()
        self._stderr_tail = bytearray()
        self._combined_tail = bytearray()

    def open(self) -> None:
        self.output_path.parent.mkdir(parents=True, exist_ok=True)
        self._file = self.output_path.open("wb")

    def close(self) -> None:
        with self._lock:
            if self._file is not None:
                self._file.close()
                self._file = None

    def write(self, stream: str, chunk: bytes) -> bool:
        if not chunk:
            return not self._output_limit_exceeded
        with self._lock:
            self._output_bytes += len(chunk)
            self._append_stream(stream, chunk)
            if self._file is not None and not self._output_limit_exceeded:
                prefix = f"\n[{stream}]\n".encode("utf-8")
                allowed = self.output_file_max_bytes - self._file_bytes
                payload = prefix + chunk
                if allowed > 0:
                    self._file.write(payload[:allowed])
                    self._file.flush()
                    self._file_bytes += min(len(payload), allowed)
                if len(payload) > allowed:
                    self._output_limit_exceeded = True
            return not self._output_limit_exceeded

    def snapshot(self) -> CommandOutputSnapshot:
        with self._lock:
            inline = self._output_bytes <= self.inline_output_max_chars * 4
            stdout = _decode(bytes(self._stdout_inline)) if inline else ""
            stderr = _decode(bytes(self._stderr_inline)) if inline else ""
            output_truncated = not inline or self._output_limit_exceeded
            return CommandOutputSnapshot(
                output_path=str(self.output_path),
                output_bytes=self._output_bytes,
                output_truncated=output_truncated,
                output_limit_exceeded=self._output_limit_exceeded,
                stdout=stdout,
                stderr=stderr,
                stdout_tail=_decode(bytes(self._stdout_tail)),
                stderr_tail=_decode(bytes(self._stderr_tail)),
                combined_tail=_decode(bytes(self._combined_tail)),
            )

    @property
    def output_limit_exceeded(self) -> bool:
        with self._lock:
            return self._output_limit_exceeded

    def _append_stream(self, stream: str, chunk: bytes) -> None:
        target = self._stdout_inline if stream == "stdout" else self._stderr_inline
        if len(target) <= self.inline_output_max_chars * 4:
            target.extend(chunk)
            if len(target) > self.inline_output_max_chars * 4 + 4096:
                del target[self.inline_output_max_chars * 4 :]

        tail = self._stdout_tail if stream == "stdout" else self._stderr_tail
        tail.extend(chunk)
        _trim_bytearray(tail, self.tail_max_bytes)

        self._combined_tail.extend(f"\n[{stream}]\n".encode("utf-8"))
        self._combined_tail.extend(chunk)
        _trim_bytearray(self._combined_tail, self.tail_max_bytes)


def _trim_bytearray(value: bytearray, max_bytes: int) -> None:
    if len(value) > max_bytes:
        del value[: len(value) - max_bytes]


def _decode(value: bytes) -> str:
    for encoding in ("utf-8", locale.getpreferredencoding(False), "gb18030"):
        try:
            return value.decode(encoding)
        except UnicodeDecodeError:
            continue
    return value.decode("utf-8", errors="replace")
