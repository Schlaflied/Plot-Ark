# LTI 1.3 (Moodle) — MVP

Plot Ark is the **Tool**; one Moodle site is the **Platform**. Disabled unless `LTI_ISSUER` and `LTI_CLIENT_ID` are set.

| Env var | Purpose |
|---|---|
| `LTI_ISSUER`, `LTI_CLIENT_ID`, `LTI_DEPLOYMENT_ID` | Platform registration (from Moodle) |
| `LTI_AUTH_URL`, `LTI_JWKS_URL` | Moodle OIDC auth endpoint / public keyset |
| `LTI_TOOL_BASE_URL` | Public origin of Plot Ark (https in production) |
| `LTI_TOOL_PRIVATE_KEY`, `LTI_TOOL_KID` | RSA key (PEM, `\n`-escaped) signing Deep Linking responses; public half at `/api/lti/jwks` |
| `LTI_STATE_SECRET` | Random secret binding OIDC state to the browser |

Moodle tool config: login URL `/api/lti/login`, redirect/launch URL `/api/lti/launch`, public keyset `/api/lti/jwks`, deep-linking supported.

Roles: Instructor → Professor, Learner → Student (anything else is rejected). Accounts match on `(issuer, sub)` via `lti_users`; the platform email is never an identity key.

Out of scope (follow-ups): NRPS, AGS completion/grade passback, multi-tenant platform registry. State/nonce/code store is in-process (run one worker or move it to Redis).
