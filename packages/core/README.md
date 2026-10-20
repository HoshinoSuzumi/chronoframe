# @chronoframe/core

Transport-independent photo and album read use cases. The package depends only
on contracts; it has no Nuxt globals, database connections, filesystem or session
implementation. Repository methods are asynchronous and preserve query ordering.

The application injects a repository and trusted request access context. Hidden
album membership excludes photos from anonymous reads; public album listings do
not expose protected membership. Authorized protected album details replace raw
storage references with access-controlled media URLs. Password hashes remain in
internal access records and never appear in response resources.

This first P2 batch covers reads only. Writes, settings, Site scoping, database
migration, and job lifecycle remain in later batches. Do not use this interface
for multi-site data until a required Site context is introduced.
