//! An in-memory store.

/// Keeps greetings by name.
pub struct Store {
    items: Vec<String>,
}

impl Store {
    /// An empty store.
    pub fn new() -> Self {
        Self { items: Vec::new() }
    }

    /// Save one greeting.
    pub fn save(&mut self, message: &str) {
        self.items.push(message.to_string());
    }
}
