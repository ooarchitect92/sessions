# Infrastructure

Docker Compose is a reproducible local environment, not the final production topology. Production should use managed PostgreSQL, managed Redis, private object storage with CDN and signed access, separate stateless API/worker services, a LiveKit cluster, regional TURN, managed secrets, WAF, centralized logs, metrics, traces, backups, and tested disaster recovery.

The selected production deployment target will be codified after account, region, availability, data residency, and budget decisions are confirmed. Do not treat placeholder local credentials or image tags as production configuration.


## TURN strategy

The default local stack exposes LiveKit's WebRTC TCP/UDP ports directly and does not start a host-network coturn container, which avoids non-portable behavior on Docker Desktop. Production must enable LiveKit's embedded TURN or deploy external regional TURN endpoints with DNS, TLS, authentication, restricted relay ranges, monitoring, and capacity testing. `coturn/turnserver.example.conf` is a reference only and is not production-ready.
