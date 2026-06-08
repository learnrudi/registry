# Local LLM OpenAI-Compatible Runtime Contract

Updated: 2026-05-17

Purpose: define how RUDI describes local LLM runtimes that expose an OpenAI-compatible HTTP API. RUDI owns runtime discovery, install guidance, model catalog metadata, health checks, model listing, endpoint normalization, and consumer-specific env/config export. Application stacks, such as Content Engine, consume the configured endpoint; they do not install runtimes or manage model files.

## Ownership Boundary

RUDI registry/daemon/CLI owns:

- Runtime package metadata, such as `runtime:ollama`.
- Install and detection hints.
- Local endpoint defaults.
- Model pull guidance and model catalog metadata.
- Smoke checks for binary, server, Docker-host reachability, and model availability.
- Normalized status output for sidecar/daemon and CLI consumers.
- Consumer-specific env/config export.
- Hardware notes and tested model records.

Consumer applications own:

- Provider abstraction and request validation.
- Application-level auth, tenant policy, and rate limits.
- Prompt/output validation.
- Persistence of derived content and provider/model metadata.
- Secret-safe logs and stable application error codes.

Consumer applications should not install Ollama, pull models, write to Ollama model storage, expose generic model-management UI, or assume a machine-specific endpoint beyond the configured OpenAI-compatible base URL.

## Load Boundary

The sidecar/daemon runtime broker should stay on the control plane: discovery, health, model listing, endpoint normalization, and consumer config export. Inference traffic should continue to flow directly from consumer applications to the selected OpenAI-compatible runtime URL. That keeps token streaming and large generation payloads out of the sidecar unless RUDI later adds an explicit routing or proxy feature.

## Runtime Broker Concepts

RUDI should describe capabilities. Consumer apps should consume capabilities.

- `runtime`: the inference service implementation, such as Ollama, LM Studio, vLLM, TGI, or llama.cpp.
- `target`: where and how that runtime is reachable, such as `mac_host`, `docker`, `lan_http`, `ssh_remote`, or `cloud_openai_compatible`.
- `consumer`: the app requesting config, such as `content-engine`, `image-generator`, or an agent runner.
- `consumerContext`: the consumer network position. For example, a host process can use `localhost`, while a Docker container on macOS usually needs `host.docker.internal`.

The first target should be:

```text
target: mac_host
provider family: openai_compatible
runtime: ollama
host process URL: http://localhost:11434/v1
Docker consumer URL: http://host.docker.internal:11434/v1
API key policy: placeholder
placeholder API key: ollama
```

## Runtime Contract

A local OpenAI-compatible runtime should expose structured metadata under `meta.localLlm` in the runtime manifest. The target shape should evolve toward:

```json
{
  "providerFamily": "openai_compatible",
  "targets": {
    "mac_host": {
      "runtimeBaseUrl": "http://localhost:11434/v1",
      "consumerUrls": {
        "host_process": "http://localhost:11434/v1",
        "docker_container": "http://host.docker.internal:11434/v1"
      },
      "healthCheck": {
        "method": "GET",
        "path": "/models"
      },
      "apiKeyPolicy": "placeholder",
      "placeholderApiKey": "ollama"
    }
  },
  "consumers": {
    "content-engine": {
      "defaultConsumerContext": "docker_container",
      "env": {
        "ENABLE_LLM": "true",
        "ENABLE_LOCAL_LLM": "true",
        "LOCAL_LLM_PROVIDER": "local",
        "LOCAL_LLM_BASE_URL": "{{baseUrl}}",
        "LOCAL_LLM_API_KEY": "{{apiKey}}",
        "LOCAL_LLM_MODEL": "{{model}}"
      }
    }
  },
  "securityNotes": ["Prefer host-local binding for development."]
}
```

The current `runtime:ollama` manifest may keep compatibility fields such as `defaultBaseUrl` and `dockerHostBaseUrl` until the CLI resolver supports the target/consumer shape.

Model recommendations should live under `meta.localLlm.models` and include enough information for later auditing:

- Model tag.
- Intended workload.
- Minimum expected memory class.
- License/source notes when known.
- Date and hardware tested, once measured locally.
- Immutable digest or model hash, when available.

## First Supported Runtime

`runtime:ollama` is the first registry target for this contract because it can run on the macOS host while Dockerized apps call `http://host.docker.internal:11434/v1`.

Baseline smoke checks:

```bash
ollama --version
curl http://localhost:11434/v1/models
docker run --rm curlimages/curl:latest http://host.docker.internal:11434/v1/models
```

Application env mapping for Content Engine:

```env
ENABLE_LLM=true
ENABLE_LOCAL_LLM=true
LOCAL_LLM_PROVIDER=local
LOCAL_LLM_BASE_URL=http://host.docker.internal:11434/v1
LOCAL_LLM_API_KEY=ollama
LOCAL_LLM_MODEL=<model-tag>
```

RUDI should produce or document those values. Content Engine should read them from its environment/config and should never hardcode machine-specific model tags.

## First Daemon Broker Layer

Build the smallest daemon-owned runtime broker surface before adding advanced runtime management:

1. Read `meta.localLlm` from the registry.
2. Resolve the active target, defaulting to `mac_host`.
3. Resolve the consumer context, defaulting per consumer.
4. Call the OpenAI-compatible `/models` endpoint.
5. Return a normalized, schema-backed status object from the daemon operation layer.
6. Expose status/model/env export through the sidecar/daemon HTTP surface.
7. Keep CLI commands as thin adapters over the same daemon contract.
8. Export one consumer-specific env mapping for Content Engine.

Initial sidecar/daemon routes:

```text
GET /local-llm/status
GET /local-llm/models
GET /local-llm/env/content-engine
GET /runtimes/ollama/status
```

Initial CLI adapters:

```bash
rudi local-llm status
rudi local-llm models
rudi local-llm env content-engine
rudi runtime list
rudi runtime status ollama
```

Example normalized status:

```json
{
  "runtime": "ollama",
  "providerFamily": "openai_compatible",
  "target": "mac_host",
  "consumerContext": "docker_container",
  "baseUrl": "http://host.docker.internal:11434/v1",
  "available": true,
  "models": []
}
```

Extra background runtime management should come later when RUDI needs caching, polling, health events, app registration, runtime routing, or model availability watchers.
