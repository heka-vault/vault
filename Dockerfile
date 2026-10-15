FROM denoland/deno:2.9.7
WORKDIR /app
COPY deno.json deno.lock ./
COPY main.ts ./
COPY src ./src
RUN deno cache main.ts && chmod -R a+rX /deno-dir /app
ENV HEKA_VAULT_DB=/data/vault.db \
    HEKA_VAULT_MASTER_KEY_FILE=/data/master.key \
    HEKA_VAULT_PORT=8090
EXPOSE 8090
CMD ["deno", "run", "--cached-only", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "main.ts", "serve"]
