from fixture.greeter import Greeter, greet
from fixture.store import Store


def test_greet() -> None:
    store = Store()
    greeter = Greeter(store)
    assert greeter.greet("a") == "hello a"
    assert greet("a") == "hello a"
