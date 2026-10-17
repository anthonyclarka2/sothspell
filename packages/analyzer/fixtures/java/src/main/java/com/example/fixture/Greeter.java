package com.example.fixture;

import java.util.Objects;

import com.example.fixture.store.Store;

/** Builds greetings through a Store. */
public class Greeter implements Greets {
    private static final int MAX_LENGTH = 80;

    private final Store store;

    /** Build a greeter for one store. */
    public Greeter(Store store) {
        this.store = Objects.requireNonNull(store);
    }

    @Override
    public String greet(String name) {
        String message = "hello " + name;
        store.save(name, message);
        return message;
    }

    /** The number of stored greetings. */
    public int count() {
        return store.size();
    }

    static int maxLength() {
        return MAX_LENGTH;
    }
}
