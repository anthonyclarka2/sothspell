package com.example.fixture.store;

import java.util.HashMap;
import java.util.Map;

/** Keeps greetings in memory. */
public class Store {
    private final Map<String, String> items = new HashMap<>();

    /** Save one message. */
    public void save(String name, String message) {
        items.put(name, message);
    }

    /** The number of stored messages. */
    public int size() {
        return items.size();
    }
}
