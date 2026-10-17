"""Greeting helpers."""

from .store import Store

MAX_LENGTH = 80


class Greeter:
    """Builds greetings through a Store."""

    def __init__(self, store: Store) -> None:
        self.store = store

    @property
    def count(self) -> int:
        return len(self.store.items)

    def greet(self, name: str) -> str:
        """Return the greeting for one name."""
        message = f"hello {name}"
        self.store.save(name, message)
        return message


def greet(name: str) -> str:
    """Greet without a store."""
    return f"hello {name}"


def _secret_helper() -> None:
    return None
