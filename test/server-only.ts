// `server-only` is a marker package that throws when imported into a client
// bundle. Node-based unit tests are server code, so resolve it to an empty
// module.
export {};
