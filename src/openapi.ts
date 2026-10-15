/** Hand-written OpenAPI 3.1 description of /api/v1. Served at /api/v1/openapi.json and /docs. */
export function openapi(origin: string) {
  const project = { name: "project", in: "path", required: true, schema: { type: "string" } };
  const env = {
    name: "env",
    in: "query",
    schema: { type: "string", default: "dev" },
    description: "Environment slug, e.g. dev, staging, prod.",
  };
  const path = {
    name: "path",
    in: "query",
    schema: { type: "string", default: "/" },
    description: "Folder path, e.g. / or /backend.",
  };
  const key = { name: "key", in: "path", required: true, schema: { type: "string" } };
  const ok = (description: string, schema?: object) => ({
    description,
    ...(schema ? { content: { "application/json": { schema } } } : {}),
  });
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
  const errors = {
    "401": ok("Missing or invalid token", ref("Error")),
    "403": ok("Key lacks permission (read-only key, or admin required)", ref("Error")),
    "404": ok("Not found (also returned for projects outside the key's scope)", ref("Error")),
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "Heka Vault",
      version: "1.0.0",
      description: "Internal secrets API. Authenticate with `Authorization: Bearer hvk_...`. " +
        "Admin keys can do everything. Project keys are `read` or `readwrite` on one project.",
    },
    servers: [{ url: `${origin}/api/v1` }],
    security: [{ bearer: [] }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
      schemas: {
        Error: { type: "object", properties: { error: { type: "string" } } },
        Project: {
          type: "object",
          properties: {
            slug: { type: "string" },
            name: { type: "string" },
            environments: { type: "array", items: { type: "string" } },
            createdAt: { type: "string" },
          },
        },
        Secret: {
          type: "object",
          properties: {
            key: { type: "string" },
            value: { type: "string" },
            path: { type: "string" },
            updatedAt: { type: "string" },
            updatedBy: { type: ["string", "null"] },
          },
        },
        ApiKey: {
          type: "object",
          properties: {
            id: { type: "integer" },
            name: { type: "string" },
            role: { enum: ["admin", "read", "readwrite"] },
            project: { type: ["string", "null"] },
            hint: { type: "string" },
            createdAt: { type: "string" },
            lastUsedAt: { type: ["string", "null"] },
            revokedAt: { type: ["string", "null"] },
          },
        },
        Principal: {
          type: "object",
          properties: {
            keyId: { type: "integer" },
            name: { type: "string" },
            role: { enum: ["admin", "read", "readwrite"] },
            project: { type: ["string", "null"] },
          },
        },
      },
    },
    paths: {
      "/health": {
        get: { summary: "Liveness", security: [], responses: { "200": ok("OK") } },
      },
      "/whoami": {
        get: {
          summary: "Describe the calling key",
          responses: { "200": ok("Key", ref("Principal")), ...errors },
        },
      },
      "/projects": {
        get: {
          summary: "List projects visible to this key",
          responses: {
            "200": ok("Projects", {
              type: "object",
              properties: { projects: { type: "array", items: ref("Project") } },
            }),
            ...errors,
          },
        },
        post: {
          summary: "Create a project (admin)",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["slug"],
                  properties: {
                    slug: { type: "string" },
                    name: { type: "string" },
                    environments: { type: "array", items: { type: "string" }, default: ["dev"] },
                  },
                },
              },
            },
          },
          responses: { "201": ok("Created", ref("Project")), ...errors },
        },
      },
      "/projects/{project}": {
        parameters: [project],
        get: {
          summary: "Get a project",
          responses: { "200": ok("Project", ref("Project")), ...errors },
        },
        delete: {
          summary: "Delete a project and all its secrets and keys (admin)",
          responses: { "204": ok("Deleted"), ...errors },
        },
      },
      "/projects/{project}/environments": {
        parameters: [project],
        post: {
          summary: "Add an environment (admin)",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["slug"],
                  properties: { slug: { type: "string" } },
                },
              },
            },
          },
          responses: { "201": ok("Project", ref("Project")), ...errors },
        },
      },
      "/projects/{project}/environments/{env}": {
        parameters: [project, {
          name: "env",
          in: "path",
          required: true,
          schema: { type: "string" },
        }],
        delete: {
          summary: "Delete an environment and its secrets (admin)",
          responses: { "204": ok("Deleted"), ...errors },
        },
      },
      "/projects/{project}/paths": {
        parameters: [project, env],
        get: {
          summary: "List folder paths in an environment",
          responses: { "200": ok("Paths"), ...errors },
        },
      },
      "/projects/{project}/secrets": {
        parameters: [project, env, path],
        get: {
          summary: "List secrets at a path (values included)",
          description:
            "`format=dotenv` returns a .env file body (text/plain) ready to write to disk. " +
            "`recursive=true` includes sub-folders (JSON only).",
          parameters: [
            { name: "format", in: "query", schema: { enum: ["json", "dotenv"], default: "json" } },
            { name: "recursive", in: "query", schema: { type: "boolean", default: false } },
          ],
          responses: {
            "200": {
              description: "Secrets",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      project: { type: "string" },
                      env: { type: "string" },
                      path: { type: "string" },
                      secrets: { type: "array", items: ref("Secret") },
                    },
                  },
                },
                "text/plain": { schema: { type: "string" } },
              },
            },
            ...errors,
          },
        },
        put: {
          summary: "Bulk upsert secrets at a path (readwrite or admin)",
          description:
            'Send JSON `{"secrets": {"KEY": "value"}}` or a .env file body as text/plain. ' +
            "`replace=true` also deletes keys at this path that are not in the body.",
          parameters: [{
            name: "replace",
            in: "query",
            schema: { type: "boolean", default: false },
          }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    secrets: { type: "object", additionalProperties: { type: "string" } },
                  },
                },
              },
              "text/plain": { schema: { type: "string" } },
            },
          },
          responses: { "200": ok("Counts of created/updated/deleted"), ...errors },
        },
      },
      "/projects/{project}/secrets/{key}": {
        parameters: [project, key, env, path],
        get: {
          summary: "Read one secret",
          parameters: [{
            name: "format",
            in: "query",
            schema: { enum: ["json", "raw"], default: "json" },
          }],
          responses: { "200": ok("Secret", ref("Secret")), ...errors },
        },
        put: {
          summary: "Create or update one secret (readwrite or admin)",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["value"],
                  properties: { value: { type: "string" } },
                },
              },
            },
          },
          responses: { "200": ok("Updated"), "201": ok("Created"), ...errors },
        },
        delete: {
          summary: "Delete one secret (readwrite or admin)",
          responses: { "204": ok("Deleted"), ...errors },
        },
      },
      "/keys": {
        get: {
          summary: "List API keys (admin)",
          parameters: [{ name: "project", in: "query", schema: { type: "string" } }],
          responses: {
            "200": ok("Keys", {
              type: "object",
              properties: { keys: { type: "array", items: ref("ApiKey") } },
            }),
            ...errors,
          },
        },
        post: {
          summary: "Create an API key (admin). The token is returned once.",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "role"],
                  properties: {
                    name: { type: "string" },
                    role: { enum: ["admin", "read", "readwrite"] },
                    project: { type: "string", description: "Required unless role is admin" },
                  },
                },
              },
            },
          },
          responses: {
            "201": ok("Created", {
              type: "object",
              properties: { key: ref("ApiKey"), token: { type: "string" } },
            }),
            ...errors,
          },
        },
      },
      "/keys/{id}": {
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        delete: {
          summary: "Revoke an API key (admin)",
          responses: { "204": ok("Revoked"), ...errors },
        },
      },
      "/audit": {
        get: {
          summary: "Recent audit log (admin)",
          parameters: [
            { name: "project", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 200 } },
          ],
          responses: { "200": ok("Entries"), ...errors },
        },
      },
    },
  };
}
