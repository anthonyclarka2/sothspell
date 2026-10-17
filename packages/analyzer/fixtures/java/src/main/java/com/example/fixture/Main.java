package com.example.fixture;

import com.example.fixture.store.Store;

/** Runs the fixture. */
public final class Main {
    private Main() {
    }

    /** Greets the world. */
    public static void main(String[] args) {
        Store store = new Store();
        Greeter greeter = new Greeter(store);
        System.out.println(greeter.greet("world"));
    }
}
