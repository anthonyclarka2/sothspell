use crate::store::Store;

/// The longest greeting we build.
pub const MAX_LENGTH: usize = 80;

/// Builds greetings through a store.
#[derive(Debug)]
pub struct Greeter {
    store: Store,
    count: usize,
}

/// The states a greeter can be in.
pub enum State {
    Ready,
    Busy,
}

/// Anything that can greet.
pub trait Greets {
    /// Greet one name.
    fn greet(&self, name: &str) -> String;

    /// The number of greetings built.
    fn count(&self) -> usize {
        0
    }
}

impl Greeter {
    /// Build a greeter with an empty store.
    pub fn new() -> Self {
        Self {
            store: Store::new(),
            count: 0,
        }
    }
}

impl Greets for Greeter {
    fn greet(&self, name: &str) -> String {
        format!("hello {name}")
    }

    fn count(&self) -> usize {
        self.count
    }
}

fn helper() -> usize {
    0
}
