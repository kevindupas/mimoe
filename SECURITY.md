# Security policy

Mimoe is an end-to-end encrypted product: security is its reason to exist. Vulnerability reports are taken seriously.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

- Preferably via **GitHub → Security → Report a vulnerability** (private report).
- Or by email: **dupas.dev@gmail.com**, with "Mimoe security" in the subject.

Please include: a description, reproduction steps, the estimated impact, and the affected version / commit.

## Scope

Especially interesting:

- Any leak of plaintext content, the seed, or the encryption key to the server or the network.
- Bypass of account isolation (accessing another user's clips/blobs).
- Weakness in key derivation, encryption, or the dedup fingerprint.
- Code execution / path traversal on a client from server-supplied data.
- Privilege escalation or injection on the server.

## Threat model

The server is considered **untrusted**: it must never be able to read content. Data it returns to clients (blob IDs, metadata) is treated as potentially hostile. A report that breaks this assumption is high-value.
