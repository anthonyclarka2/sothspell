"""Console entry point."""

from .greeter import greet


def main() -> None:
    print(greet("world"))


if __name__ == "__main__":
    main()
