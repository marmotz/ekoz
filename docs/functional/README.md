# Functional documentation

- [Global functional specification](specification.md)

## Vision

This project builds an open source federated messaging server, inspired by what
Matrix makes possible, but simpler to deploy, operate and evolve than Synapse.

Simplicity must not reduce the features expected of a modern messaging platform,
nor prevent future extensions.

The server is distributed as a container image. Technical choices are recorded in
the [technical documentation](../technical/README.md).

## Initial scope

Features are delivered in increments. The currently identified needs are:

- full user management: create, read, update and delete, profile and avatar;
- conversations between an arbitrary number of users;
- notifications in the app, by email and through other channels;
- server administration;
- federation between servers;
- fine-grained permissions at every relevant level;
- file and link sharing;
- simple extension mechanisms for features and exchanged content.

This list is deliberately open and will be refined over time.
