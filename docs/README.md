# Documentacion de business-app-sii

Esta carpeta contiene solo documentacion propia de la plataforma fiscal y su conexion tecnica con el SII.

- [Estado tecnico actual](./current-status.md): fuente canonica de avances, riesgos, pruebas y proximos hitos de `business-app-sii`.
- [Runbook de pruebas fiscales](./real-sii-testing.md): fuente unica de comandos y flujos para factura, boleta, CAF y recuperacion.
- [Docker para certificacion y produccion](./docker-testing-production.md): topologia, targets, servicios y manejo de secretos.

Separacion documental:

- `docs_sii/`: documentos oficiales descargados del SII; no contiene propuesta ni estado interno.
- [Repositorio `sii-engine`](../../sii-engine/README.md): API y uso del motor fiscal independiente.
- [Propuesta y roadmap del backend comercial](../../business_app_back/docs/sii-integration-proposal.md).
