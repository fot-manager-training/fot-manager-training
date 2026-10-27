# Domain deployment with cloud Lisa

Pinned snapshot of cloud Site version 47 for fot-manager-training.ru. The installer downloads this snapshot from GitHub, verifies checksums, preserves existing local statistics, and supports rollback. Lisa connects directly from visitors' browsers to the existing cloud API; its model key is never included. GitHub Pages main is unchanged. If the VPS gets HTTP 403 from the cloud API, this is reported and browser verification remains required.
