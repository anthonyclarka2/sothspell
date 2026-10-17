package com.example.fixture;

import org.junit.jupiter.api.Test;

import com.example.fixture.store.Store;

class GreeterTest {
    @Test
    void greets() {
        Greeter greeter = new Greeter(new Store());
        greeter.greet("a");
    }
}
