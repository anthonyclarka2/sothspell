"""A tiny in-memory store."""

from dataclasses import dataclass, field


@dataclass
class Store:
    """Keeps greetings by name."""

    items: dict[str, str] = field(default_factory=dict)

    def save(self, name: str, message: str) -> None:
        """Store one message."""
        self.items[name] = message

    def load(self, name: str) -> str | None:
        return self.items.get(name)
