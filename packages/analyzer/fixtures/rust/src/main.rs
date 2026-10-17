use fixture::greeter::Greeter;

fn main() {
    let greeter = Greeter::new();
    println!("{}", greeter.greet("world"));
}
